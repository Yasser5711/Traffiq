import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { streamSSE } from 'hono/streaming';
import { existsSync } from 'node:fs';
import { config, RETENTIONS } from './config';
import { setSetting, setting } from './db';
import { connState, onIngest, prune, startCollector, state, testConnection } from './collector';
import { domainList, domainStats, overview, requestById, requestLog, type RequestQuery, type Scope } from './stats';
import { isAuthed, login, logout, requireAuth } from './auth';
import type { Status } from '../shared/types';

const MAX_RANGE = 31 * 24 * 3600e3;

function scopeOf(q: (k: string) => string | undefined): Scope {
  const now = Date.now();
  let end = Number(q('end')) || now;
  let start = Number(q('start')) || end - 3600e3;
  end = Math.min(end, now);
  if (start >= end) start = end - 60_000;
  if (end - start > MAX_RANGE) start = end - MAX_RANGE;
  const domains = (q('domains') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return { start, end, domains };
}

const app = new Hono();
const api = new Hono();

api.get('/session', c => c.json({ authEnabled: !!config.password, authed: isAuthed(c) }));

api.post('/login', async c => {
  const body = await c.req.json<{ password?: string }>().catch(() => ({}) as { password?: string });
  if (login(c, body.password ?? '')) return c.json({ ok: true });
  await Bun.sleep(600); // slow down guessing
  return c.json({ ok: false, error: 'Incorrect password' }, 401);
});

api.post('/logout', c => {
  logout(c);
  return c.json({ ok: true });
});

api.use('/*', async (c, next) => {
  const p = c.req.path;
  if (p.endsWith('/session') || p.endsWith('/login') || p.endsWith('/logout') || p.endsWith('/health')) return next();
  return requireAuth(c, next);
});

api.get('/health', c => c.json({ ok: true }));

api.get('/status', c => {
  const s: Status = {
    serverName: config.serverName,
    logPath: config.logPath,
    state: connState(),
    lastEvent: state.lastEvent,
    lastError: state.lastError,
    linesTotal: state.linesTotal,
    retention: setting('retention', '14d'),
    authEnabled: !!config.password,
    version: config.version,
  };
  return c.json(s);
});

api.post('/status/test', async c => c.json(await testConnection()));

api.put('/settings', async c => {
  const body = await c.req.json<{ retention?: string }>().catch(() => ({}) as { retention?: string });
  if (body.retention) {
    if (!RETENTIONS[body.retention]) return c.json({ error: 'invalid retention' }, 400);
    setSetting('retention', body.retention);
    prune();
  }
  return c.json({ retention: setting('retention', '14d') });
});

api.get('/overview', c => c.json(overview(scopeOf(k => c.req.query(k)))));

api.get('/domains', c => c.json(domainStats(scopeOf(k => c.req.query(k)))));

api.get('/domain-list', c => c.json(domainList(scopeOf(k => c.req.query(k)))));

api.get('/requests', c => {
  const q = (k: string) => c.req.query(k);
  const sort = (q('sort') ?? 'ts') as RequestQuery['sort'];
  const query: RequestQuery = {
    ...scopeOf(q),
    domain: q('domain') || undefined,
    method: q('method') || undefined,
    status: q('status') || undefined,
    path: q('path') || undefined,
    ip: q('ip') || undefined,
    minDur: Number(q('minDur')) || undefined,
    sort: ['ts', 'domain', 'status', 'dur', 'ip', 'size'].includes(sort) ? sort : 'ts',
    dir: q('dir') === 'asc' ? 'asc' : 'desc',
    page: Math.max(0, Number(q('page')) || 0),
    pageSize: Math.min(200, Math.max(1, Number(q('pageSize')) || 25)),
  };
  return c.json(requestLog(query));
});

api.get('/requests/:id', c => {
  const r = requestById(Number(c.req.param('id')));
  return r ? c.json(r) : c.json({ error: 'not found' }, 404);
});

// Live stream: tells the dashboard when new requests were stored.
api.get('/stream', c =>
  streamSSE(c, async stream => {
    let open = true;
    const off = onIngest(e => {
      stream.writeSSE({ event: 'ingest', data: JSON.stringify(e) }).catch(() => {});
    });
    stream.onAbort(() => {
      open = false;
      off();
    });
    await stream.writeSSE({ event: 'hello', data: JSON.stringify({ state: connState() }) });
    while (open) {
      await stream.sleep(15_000);
      if (open) await stream.writeSSE({ event: 'ping', data: JSON.stringify({ state: connState(), lastEvent: state.lastEvent }) });
    }
  }),
);

api.all('*', c => c.json({ error: 'not found' }, 404));

app.route('/api', api);

if (existsSync(config.staticDir)) {
  app.use('/assets/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('/*', serveStatic({ root: config.staticDir }));
  app.get('*', serveStatic({ path: `${config.staticDir}/index.html` }));
}

startCollector();

const server = Bun.serve({ port: config.port, fetch: app.fetch, idleTimeout: 0 });
console.log(`[traffiq] listening on http://localhost:${server.port}`);
