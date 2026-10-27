// Development helper: writes realistic Traefik JSON access-log lines to ./data/access.log
// so the whole collector → database → dashboard pipeline can run without a VPS.
//
//   bun scripts/simulate.ts            backfill 7 days (first run) then stream live
//   bun scripts/simulate.ts --reset    delete the log and start over

import { appendFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const LOG = process.env.ACCESS_LOG_PATH || './data/access.log';
const BACKFILL_DAYS = 7;
const BACKFILL_PER_DAY = 9000;
const M = 60_000;

type Route = { m: string; p: string; w: [number, number, number, number]; codes?: Partial<Record<0 | 1 | 2 | 3, number[]>>; size: number; lat: number; ua?: string[] };
type Domain = { name: string; svc: string; ip: string; port: number; rate: number; lat: number; routes: Route[] };

const UA_WEB = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0',
];
const UA_API = [...UA_WEB.slice(0, 2), 'Go-http-client/2.0', 'curl/8.5.0', 'python-requests/2.32.3', 'okhttp/4.12.0'];
const UA_SCAN = ['Mozilla/5.0 zgrab/0.x'];
const DEFAULT_CODES = [[200], [301, 302], [400, 404], [500, 502]];

const DOMAINS: Domain[] = [
  {
    name: 'api.example.com', svc: 'api', ip: '10.0.1.12', port: 8080, rate: 120, lat: 64,
    routes: [
      { m: 'GET', p: '/api/users', w: [30, 0, 2, 0], codes: { 2: [401] }, size: 2400, lat: 0.7 },
      { m: 'GET', p: '/api/users/:id', w: [16, 0, 3, 0], codes: { 2: [404] }, size: 860, lat: 0.6 },
      { m: 'GET', p: '/api/products', w: [22, 0, 1, 3], codes: { 2: [400], 3: [500, 502] }, size: 1250, lat: 1.5 },
      { m: 'POST', p: '/api/orders', w: [8, 0, 3, 2], codes: { 0: [201], 2: [422, 400], 3: [500, 504] }, size: 640, lat: 2.4 },
      { m: 'PATCH', p: '/api/users/:id', w: [4, 0, 1, 0], codes: { 2: [422] }, size: 820, lat: 1.1 },
      { m: 'PUT', p: '/api/cart/items/:id', w: [5, 0, 1, 0], codes: { 2: [409] }, size: 410, lat: 0.9 },
      { m: 'DELETE', p: '/api/sessions/:hex', w: [3, 0, 1, 0], codes: { 0: [204], 2: [404] }, size: 0, lat: 0.5 },
      { m: 'GET', p: '/api/health', w: [12, 0, 0, 0.3], codes: { 3: [503] }, size: 48, lat: 0.08 },
      { m: 'POST', p: '/api/webhooks/stripe', w: [2, 0, 1, 0], codes: { 2: [400] }, size: 24, lat: 0.8, ua: ['Stripe/1.0 (+https://stripe.com/docs/webhooks)'] },
      { m: 'GET', p: '/api/search?q=:q', w: [7, 0, 4, 0], codes: { 2: [429, 400] }, size: 3100, lat: 1.3 },
    ],
  },
  {
    name: 'app.example.com', svc: 'web-app', ip: '10.0.1.14', port: 3000, rate: 70, lat: 92,
    routes: [
      { m: 'GET', p: '/', w: [10, 3, 0, 0], codes: { 1: [302] }, size: 9200, lat: 1 },
      { m: 'GET', p: '/_next/static/chunks/main-:hash.js', w: [16, 26, 0, 0], codes: { 1: [304] }, size: 86000, lat: 0.25 },
      { m: 'POST', p: '/api/auth/login', w: [6, 0, 6, 0.5], codes: { 2: [401, 401, 429], 3: [500] }, size: 512, lat: 0.9 },
      { m: 'GET', p: '/api/auth/session', w: [20, 0, 3, 0], codes: { 2: [401] }, size: 640, lat: 0.4 },
      { m: 'GET', p: '/settings', w: [5, 0, 0, 0], size: 14200, lat: 1.2 },
      { m: 'PUT', p: '/api/profile', w: [3, 0, 1, 1], codes: { 2: [422], 3: [502] }, size: 780, lat: 1.4 },
      { m: 'GET', p: '/projects/:id', w: [8, 0, 1, 0], codes: { 2: [403] }, size: 12400, lat: 1.3 },
    ],
  },
  {
    name: 'dashboard.example.com', svc: 'dashboard', ip: '10.0.1.18', port: 3000, rate: 24, lat: 138,
    routes: [
      { m: 'GET', p: '/dashboard', w: [12, 2, 0, 0], codes: { 1: [302] }, size: 18400, lat: 0.9 },
      { m: 'GET', p: '/dashboard/analytics', w: [6, 0, 0, 1], codes: { 3: [504] }, size: 22800, lat: 1.7 },
      { m: 'GET', p: '/api/metrics?range=:r', w: [14, 0, 1, 1], codes: { 2: [403], 3: [500] }, size: 6200, lat: 1.2 },
      { m: 'POST', p: '/api/reports/export', w: [2, 0, 1, 0.5], codes: { 3: [504] }, size: 1800, lat: 4.5 },
    ],
  },
  {
    name: 'example.com', svc: 'marketing-site', ip: '10.0.1.21', port: 80, rate: 40, lat: 36,
    routes: [
      { m: 'GET', p: '/', w: [20, 8, 0, 0.3], codes: { 1: [301], 3: [502] }, size: 32000, lat: 1 },
      { m: 'GET', p: '/pricing', w: [8, 0, 0, 0], size: 21400, lat: 1.1 },
      { m: 'GET', p: '/blog/self-hosting-with-traefik', w: [6, 2, 0, 0], codes: { 1: [301] }, size: 41000, lat: 1.3 },
      { m: 'GET', p: '/robots.txt', w: [3, 2, 0, 0], codes: { 1: [304] }, size: 120, lat: 0.2 },
      { m: 'GET', p: '/wp-login.php', w: [0, 0, 5, 0], codes: { 2: [404] }, size: 162, lat: 0.3, ua: UA_SCAN },
      { m: 'GET', p: '/.env', w: [0, 0, 3, 0], codes: { 2: [404] }, size: 162, lat: 0.3, ua: UA_SCAN },
      { m: 'POST', p: '/contact', w: [1, 0, 1, 0], codes: { 2: [422] }, size: 340, lat: 2 },
    ],
  },
];

const IPS: [string, number][] = [
  ['192.0.2.15', 10], ['198.51.100.24', 6], ['203.0.113.12', 5], ['192.0.2.35', 4], ['198.51.100.7', 4], ['192.0.2.88', 3],
  ['203.0.113.45', 3], ['198.51.100.142', 3], ['192.0.2.201', 2], ['203.0.113.190', 2], ['2001:db8::1f', 2], ['203.0.113.9', 2],
];

const rnd = Math.random;
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)]!;
function pickW<T>(items: T[], weight: (t: T) => number): T {
  const tot = items.reduce((s, x) => s + weight(x), 0);
  let x = rnd() * tot;
  for (const it of items) {
    if (x < weight(it)) return it;
    x -= weight(it);
  }
  return items[0]!;
}
const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());
const hex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(rnd() * 16)]).join('');

// Busy during the day, quiet at night (Europe/Paris-ish).
function diurnal(t: number) {
  const d = new Date(t);
  const h = (d.getUTCHours() + 1 + d.getUTCMinutes() / 60) % 24;
  return 0.32 + 0.68 * Math.pow(Math.max(0, Math.sin((Math.PI * (((h - 4) + 24) % 24)) / 24)), 1.4);
}

function expand(p: string) {
  return p
    .replace(':id', String(1000 + Math.floor(rnd() * 9000)))
    .replace(':hex', hex(16))
    .replace(':hash', hex(8))
    .replace(':q', pick(['laptop', 'desk', 'chair', 'monitor']))
    .replace(':r', pick(['1h', '24h', '7d']));
}

function line(t: number): string {
  const d = pickW(DOMAINS, x => x.rate);
  const route = pickW(d.routes, r => r.w.reduce((a, b) => a + b, 0));
  const g = pickW([0, 1, 2, 3] as const, k => route.w[k]);
  const code = pick(route.codes?.[g] ?? DEFAULT_CODES[g]!);
  let dur = d.lat * route.lat * (0.82 + 0.36 * diurnal(t)) * Math.exp(gauss() * 0.42);
  if (code === 304) dur *= 0.3;
  else if (g === 2) dur *= 0.5;
  else if (g === 3) dur *= 2.4;
  if (code === 504) dur = 30000 + rnd() * 60;
  const size = code === 304 || code === 204 ? 0 : g === 1 ? 150 + rnd() * 90 : g === 2 ? 110 + rnd() * 480 : g === 3 ? 700 + rnd() * 900 : route.size * (0.7 + 0.6 * rnd());
  const ua = pick(route.ua ?? (d.name.startsWith('api') ? UA_API : UA_WEB));
  const ip = route.ua === UA_SCAN ? '203.0.113.77' : pickW(IPS, x => x[1])[0];
  const durNs = Math.round(dur * 1e6);
  const overheadNs = Math.min(durNs, Math.round((0.3 + rnd() * 3) * 1e6));
  return JSON.stringify({
    ClientAddr: `${ip}:${40000 + Math.floor(rnd() * 20000)}`,
    ClientHost: ip,
    DownstreamContentSize: Math.round(size),
    DownstreamStatus: code,
    Duration: durNs,
    OriginContentSize: Math.round(size),
    OriginDuration: durNs - overheadNs,
    OriginStatus: code,
    Overhead: overheadNs,
    RequestAddr: d.name,
    RequestHost: d.name,
    RequestMethod: route.m,
    RequestPath: expand(route.p),
    RequestProtocol: ua.startsWith('curl') || ua.startsWith('python') ? 'HTTP/1.1' : 'HTTP/2.0',
    RequestScheme: 'https',
    RouterName: `${d.svc}-router-websecure@docker`,
    ServiceAddr: `${d.ip}:${d.port}`,
    ServiceName: `${d.svc}-service@docker`,
    ServiceURL: `http://${d.ip}:${d.port}`,
    StartLocal: new Date(t).toISOString(),
    StartUTC: new Date(t).toISOString(),
    entryPointName: 'websecure',
    level: 'info',
    msg: '',
    'request_User-Agent': ua,
    'request_X-Request-Id': `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`,
    time: new Date(t).toISOString(),
  });
}

mkdirSync(dirname(LOG), { recursive: true });
if (process.argv.includes('--reset') && existsSync(LOG)) rmSync(LOG);

if (!existsSync(LOG) || statSync(LOG).size === 0) {
  const now = Date.now();
  const total = BACKFILL_DAYS * BACKFILL_PER_DAY;
  const times: number[] = [];
  // Sample timestamps following the daily curve, denser in the last hour.
  while (times.length < total) {
    const t = now - rnd() * BACKFILL_DAYS * 1440 * M;
    if (rnd() < diurnal(t)) times.push(t);
  }
  for (let i = 0; i < 1500; i++) times.push(now - rnd() * 60 * M);
  times.sort((a, b) => a - b);
  const CH = 5000;
  for (let i = 0; i < times.length; i += CH) appendFileSync(LOG, times.slice(i, i + CH).map(line).join('\n') + '\n');
  console.log(`[sim] backfilled ${times.length} lines into ${LOG}`);
}

console.log(`[sim] streaming live requests to ${LOG}`);
setInterval(() => {
  const now = Date.now();
  // ~30 requests/min at peak, consistent with the backfill density.
  const n = Math.floor(0.6 * diurnal(now) * 1.4 + rnd());
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(line(now - Math.floor(rnd() * 900)));
  if (out.length) appendFileSync(LOG, out.join('\n') + '\n');
}, 1000);
