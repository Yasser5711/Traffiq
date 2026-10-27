// Tails the Traefik access log and stores each request in SQLite.
// Handles log rotation (inode change) and truncation (size shrinks).

import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { eq, lt, max, sql } from 'drizzle-orm';
import { config, RETENTIONS } from './config';
import { db, setting } from './db';
import { domains as domainsT, logCursor, minuteStats, requests } from './schema';
import { parseLine, type ParsedRequest } from './parse';
import type { ConnState } from '../shared/types';

const CHUNK = 4 * 1024 * 1024;
const INSERT_BATCH = 500; // keeps each statement under SQLite's bound-parameter limit

function getCursor(path: string) {
  return db.select().from(logCursor).where(eq(logCursor.path, path)).get();
}

function putCursor(path: string, ino: string, offset: number) {
  db.insert(logCursor).values({ path, ino, offset }).onConflictDoUpdate({ target: logCursor.path, set: { ino, offset } }).run();
}

type Listener = (e: { count: number; newest: number }) => void;
const listeners = new Set<Listener>();
export function onIngest(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const state = {
  lastEvent: null as number | null,
  lastError: null as string | null,
  lastErrorAt: 0,
  lastOkAt: 0,
  linesTotal: 0,
};

export function connState(): ConnState {
  if (!state.lastError) return 'connected';
  // Brief read failures (rotation in progress) show as "reconnecting".
  return Date.now() - state.lastOkAt < 30_000 ? 'reconnecting' : 'disconnected';
}

type MinuteRow = typeof minuteStats.$inferInsert & { c2: number; c3: number; c4: number; c5: number; durSum: number };

function store(rows: ParsedRequest[], cutoff: number) {
  const keep = rows.filter(r => r.ts >= cutoff && !config.ignoreHosts.includes(r.domain));
  if (!keep.length) return { count: 0, newest: 0 };

  const minutes = new Map<string, MinuteRow>();
  const services = new Map<string, string>();
  let newest = 0;
  for (const r of keep) {
    newest = Math.max(newest, r.ts);
    const minute = Math.floor(r.ts / 60000) * 60000;
    const key = minute + '|' + r.domain;
    let m = minutes.get(key);
    if (!m) minutes.set(key, (m = { minute, domain: r.domain, c2: 0, c3: 0, c4: 0, c5: 0, durSum: 0 }));
    const g = Math.min(5, Math.max(2, Math.floor(r.status / 100))) as 2 | 3 | 4 | 5;
    m[`c${g}`]++;
    m.durSum += r.dur;
    if (!services.has(r.domain) || r.service) services.set(r.domain, r.service);
  }

  db.transaction(tx => {
    for (let i = 0; i < keep.length; i += INSERT_BATCH) tx.insert(requests).values(keep.slice(i, i + INSERT_BATCH)).run();
    for (const m of minutes.values()) {
      tx.insert(minuteStats)
        .values(m)
        .onConflictDoUpdate({
          target: [minuteStats.minute, minuteStats.domain],
          set: {
            c2: sql`${minuteStats.c2} + excluded.c2`,
            c3: sql`${minuteStats.c3} + excluded.c3`,
            c4: sql`${minuteStats.c4} + excluded.c4`,
            c5: sql`${minuteStats.c5} + excluded.c5`,
            durSum: sql`${minuteStats.durSum} + excluded.dur_sum`,
          },
        })
        .run();
    }
    for (const [domain, service] of services) {
      tx.insert(domainsT)
        .values({ domain, service })
        .onConflictDoUpdate({
          target: domainsT.domain,
          set: { service: sql`CASE WHEN excluded.service <> '' THEN excluded.service ELSE ${domainsT.service} END` },
        })
        .run();
    }
  });
  return { count: keep.length, newest };
}

let ino = '';
let offset = -1;
let carry = '';

function retentionMs() {
  return RETENTIONS[setting('retention', '14d')] ?? RETENTIONS['14d']!;
}

function poll() {
  const path = config.logPath;
  let st;
  try {
    st = statSync(path);
  } catch (e) {
    fail(`Cannot read ${path}: ${(e as NodeJS.ErrnoException).code ?? e}`);
    return;
  }
  const curIno = String(st.ino);
  if (offset < 0) {
    const saved = getCursor(path);
    if (saved && saved.ino === curIno && saved.offset <= st.size) offset = saved.offset;
    else offset = Math.max(0, st.size - config.backfillBytes);
    ino = curIno;
    carry = '';
  } else if (curIno !== ino || st.size < offset) {
    // Rotated or truncated: start over from the top of the new file.
    ino = curIno;
    offset = 0;
    carry = '';
  }
  if (st.size === offset) {
    ok();
    return;
  }

  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch (e) {
    fail(`Cannot open ${path}: ${(e as NodeJS.ErrnoException).code ?? e}`);
    return;
  }
  try {
    const cutoff = Date.now() - retentionMs();
    const buf = Buffer.allocUnsafe(CHUNK);
    let skipPartial = offset > 0 && carry === '' && !getCursor(path);
    while (offset < st.size) {
      const n = readSync(fd, buf, 0, Math.min(CHUNK, st.size - offset), offset);
      if (n <= 0) break;
      offset += n;
      const text = carry + buf.toString('utf8', 0, n);
      const lines = text.split('\n');
      carry = lines.pop() ?? '';
      if (skipPartial) {
        lines.shift(); // backfill started mid-line
        skipPartial = false;
      }
      const rows: ParsedRequest[] = [];
      for (const l of lines) {
        const r = parseLine(l.trim());
        if (r) rows.push(r);
      }
      state.linesTotal += lines.length;
      if (rows.length) {
        const res = store(rows, cutoff);
        if (res.count) {
          state.lastEvent = Math.max(state.lastEvent ?? 0, res.newest);
          for (const fn of listeners) fn(res);
        }
      }
    }
    // Only persist complete lines; the carry is re-read next time.
    putCursor(path, ino, offset - Buffer.byteLength(carry));
    ok();
  } catch (e) {
    fail(String(e));
  } finally {
    closeSync(fd);
  }
}

function ok() {
  state.lastError = null;
  state.lastOkAt = Date.now();
}

function fail(msg: string) {
  if (state.lastError !== msg) console.warn('[collector]', msg);
  state.lastError = msg;
  state.lastErrorAt = Date.now();
}

export function prune() {
  const cutoff = Date.now() - retentionMs();
  db.delete(requests).where(lt(requests.ts, cutoff)).run();
  db.delete(minuteStats).where(lt(minuteStats.minute, cutoff)).run();
}

/** Checks the log is readable and reports how many lines arrived recently. */
export async function testConnection(windowMs = 2000): Promise<{ ok: boolean; message: string }> {
  try {
    statSync(config.logPath);
  } catch (e) {
    return { ok: false, message: `Could not read the access log (${(e as NodeJS.ErrnoException).code ?? 'error'})` };
  }
  const before = state.linesTotal;
  await Bun.sleep(windowMs);
  const n = state.linesTotal - before;
  return { ok: true, message: `Log file readable · ${n} new line${n === 1 ? '' : 's'} in the last ${windowMs / 1000} s` };
}

export function startCollector() {
  state.lastEvent = db.select({ ts: max(requests.ts) }).from(requests).get()?.ts ?? null;
  prune();
  poll();
  setInterval(poll, config.pollMs);
  setInterval(prune, 15 * 60 * 1000);
  console.log(`[collector] reading ${config.logPath}`);
}
