// Aggregations behind the dashboard: KPIs, time series, insights, domains, request log.

import { and, asc, avg, count, desc, eq, gte, inArray, lt, lte, max, sql, sum, type SQL } from 'drizzle-orm';
import { db } from './db';
import { domains as domainsT, minuteStats, requests } from './schema';
import type { DomainStat, EndpointStat, Overview, RequestDetail, RequestPage, RequestRow, Series, Totals } from '../shared/types';

const MIN = 60_000;
const BUCKET_OPTIONS = [0.5, 1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 720, 1440];
const MAX_BUCKETS = 72;

export interface Scope {
  start: number;
  end: number;
  domains: string[]; // empty = all
}

// Status-class counters over raw rows.
const c2 = sql<number>`sum(case when ${requests.status} < 300 then 1 else 0 end)`;
const c3 = sql<number>`sum(case when ${requests.status} >= 300 and ${requests.status} < 400 then 1 else 0 end)`;
const c4 = sql<number>`sum(case when ${requests.status} >= 400 and ${requests.status} < 500 then 1 else 0 end)`;
const c5 = sql<number>`sum(case when ${requests.status} >= 500 then 1 else 0 end)`;
const errors = sql<number>`sum(case when ${requests.status} >= 400 then 1 else 0 end)`;

type Row4 = { c2: number | string | null; c3: number | string | null; c4: number | string | null; c5: number | string | null; dur: number | string | null };

function toTotals(r: Row4 | null | undefined): Totals {
  const n = (v: number | string | null | undefined) => Number(v ?? 0);
  const a = n(r?.c2), b = n(r?.c3), c = n(r?.c4), d = n(r?.c5);
  const total = a + b + c + d;
  return { total, c2: a, c3: b, c4: c, c5: d, avg: total ? n(r?.dur) / total : 0 };
}

function pickBucket(start: number, end: number) {
  const durMin = (end - start) / MIN;
  for (const o of BUCKET_OPTIONS) if (durMin / o <= MAX_BUCKETS) return o * MIN;
  return 1440 * MIN;
}

// Ranges with sub-minute buckets read raw rows; longer ones read the minute rollup.
const useRaw = (start: number, end: number) => pickBucket(start, end) < MIN;

function rawWhere(scope: Scope, ...extra: (SQL | undefined)[]) {
  return and(
    gte(requests.ts, scope.start),
    lt(requests.ts, scope.end),
    scope.domains.length ? inArray(requests.domain, scope.domains) : undefined,
    ...extra,
  );
}

function rollupWhere(start: number, end: number, domains: string[]) {
  return and(
    gte(minuteStats.minute, start),
    lt(minuteStats.minute, end),
    domains.length ? inArray(minuteStats.domain, domains) : undefined,
  );
}

const rollupSums = {
  c2: sum(minuteStats.c2),
  c3: sum(minuteStats.c3),
  c4: sum(minuteStats.c4),
  c5: sum(minuteStats.c5),
  dur: sum(minuteStats.durSum),
};

function totals(scope: Scope): Totals {
  const row = useRaw(scope.start, scope.end)
    ? db.select({ c2, c3, c4, c5, dur: sum(requests.dur) }).from(requests).where(rawWhere(scope)).get()
    : db.select(rollupSums).from(minuteStats).where(rollupWhere(scope.start, scope.end, scope.domains)).get();
  return toTotals(row);
}

function totalsByDomain(scope: Scope): Map<string, Totals> {
  const rows = useRaw(scope.start, scope.end)
    ? db.select({ domain: requests.domain, c2, c3, c4, c5, dur: sum(requests.dur) }).from(requests).where(rawWhere(scope)).groupBy(requests.domain).all()
    : db.select({ domain: minuteStats.domain, ...rollupSums }).from(minuteStats).where(rollupWhere(scope.start, scope.end, scope.domains)).groupBy(minuteStats.domain).all();
  return new Map(rows.map(r => [r.domain, toTotals(r)]));
}

interface Grid {
  bucketMs: number;
  start: number;
  n: number;
}

function grid(scope: Scope): Grid {
  const bucketMs = pickBucket(scope.start, scope.end);
  const n = Math.max(2, Math.round((scope.end - scope.start) / bucketMs));
  // Align buckets so the last one ends at the latest complete boundary.
  const e0 = Math.floor(scope.end / bucketMs) * bucketMs;
  return { bucketMs, start: e0 - n * bucketMs, n };
}

function emptySeries(g: Grid): Series {
  const z = () => new Array<number>(g.n).fill(0);
  return { bucketMs: g.bucketMs, start: g.start, c2: z(), c3: z(), c4: z(), c5: z() };
}

/** Time series per domain (or a single '*' series when byDomain is false). */
function series(scope: Scope, byDomain: boolean): { grid: Grid; data: Map<string, Series> } {
  const g = grid(scope);
  const end = g.start + g.n * g.bucketMs;
  let rows: { domain: string; i: number; c2: unknown; c3: unknown; c4: unknown; c5: unknown }[];
  if (g.bucketMs < MIN) {
    const i = sql<number>`(${requests.ts} - ${g.start}) / ${g.bucketMs}`;
    const domain = byDomain ? requests.domain : sql<string>`'*'`;
    rows = db
      .select({ domain, i, c2, c3, c4, c5 })
      .from(requests)
      .where(rawWhere({ ...scope, start: g.start, end }))
      .groupBy(domain, i)
      .all();
  } else {
    const i = sql<number>`(${minuteStats.minute} - ${g.start}) / ${g.bucketMs}`;
    const domain = byDomain ? minuteStats.domain : sql<string>`'*'`;
    rows = db
      .select({ domain, i, c2: sum(minuteStats.c2), c3: sum(minuteStats.c3), c4: sum(minuteStats.c4), c5: sum(minuteStats.c5) })
      .from(minuteStats)
      .where(rollupWhere(g.start, end, scope.domains))
      .groupBy(domain, i)
      .all();
  }
  const data = new Map<string, Series>();
  for (const r of rows) {
    let s = data.get(r.domain);
    if (!s) data.set(r.domain, (s = emptySeries(g)));
    const i = Math.floor(Number(r.i));
    if (i < 0 || i >= g.n) continue;
    s.c2[i] = Number(r.c2);
    s.c3[i] = Number(r.c3);
    s.c4[i] = Number(r.c4);
    s.c5[i] = Number(r.c5);
  }
  return { grid: g, data };
}

const endpointKey = [requests.domain, requests.method, requests.route] as const;

export function overview(scope: Scope): Overview {
  const span = scope.end - scope.start;
  const prevScope = { ...scope, start: scope.start - span, end: scope.start };
  const s = series(scope, false);

  const topDomains = [...totalsByDomain(scope).entries()]
    .map(([domain, v]) => ({ domain, count: v.total }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const failing: EndpointStat[] = db
    .select({
      domain: requests.domain,
      method: requests.method,
      route: requests.route,
      count: count(),
      codes: sql<string>`group_concat(${requests.status})`,
    })
    .from(requests)
    .where(rawWhere(scope, gte(requests.status, 400)))
    .groupBy(...endpointKey)
    .orderBy(desc(count()))
    .limit(5)
    .all()
    .map(({ codes, ...r }) => {
      const freq = new Map<number, number>();
      for (const c of codes.split(',')) freq.set(+c, (freq.get(+c) ?? 0) + 1);
      return { ...r, code: [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] };
    });

  const avgDur = avg(requests.dur);
  const slowest: EndpointStat[] = db
    .select({ domain: requests.domain, method: requests.method, route: requests.route, count: count(), avg: avgDur })
    .from(requests)
    .where(rawWhere(scope))
    .groupBy(...endpointKey)
    .having(gte(count(), 3))
    .orderBy(desc(avgDur))
    .limit(5)
    .all()
    .map(r => ({ ...r, avg: Number(r.avg) }));

  const topIps = db
    .select({ ip: requests.ip, count: count(), errors })
    .from(requests)
    .where(rawWhere(scope))
    .groupBy(requests.ip)
    .orderBy(desc(count()))
    .limit(5)
    .all()
    .map(r => ({ ...r, errors: Number(r.errors) }));

  return {
    range: { start: scope.start, end: scope.end },
    totals: totals(scope),
    prev: totals(prevScope),
    series: s.data.get('*') ?? emptySeries(s.grid),
    topDomains,
    failing,
    slowest,
    topIps,
  };
}

const SPARK_POINTS = 40;

export function domainStats(scope: Scope): DomainStat[] {
  const all = { ...scope, domains: [] };
  const span = scope.end - scope.start;
  const cur = totalsByDomain(all);
  const prev = totalsByDomain({ ...all, start: scope.start - span, end: scope.start });
  const s = series(all, true);
  const services = new Map(db.select().from(domainsT).all().map(r => [r.domain, r.service]));
  const zero = toTotals(null);

  return [...cur.entries()]
    .map(([domain, t]) => {
      const ser = s.data.get(domain);
      const tl = ser ? ser.c2.map((v, i) => v + ser.c3[i]! + ser.c4[i]! + ser.c5[i]!) : [];
      const step = Math.max(1, Math.ceil(tl.length / SPARK_POINTS));
      const spark: number[] = [];
      for (let i = 0; i < tl.length; i += step) spark.push(tl.slice(i, i + step).reduce((a, b) => a + b, 0));
      return { domain, service: services.get(domain) ?? '', totals: t, prev: prev.get(domain) ?? zero, spark };
    })
    .sort((a, b) => b.totals.total - a.totals.total);
}

export function domainList(scope: Scope): { domain: string; count: number }[] {
  const counts = totalsByDomain({ ...scope, domains: [] });
  return db
    .select({ domain: domainsT.domain })
    .from(domainsT)
    .all()
    .map(({ domain }) => ({ domain, count: counts.get(domain)?.total ?? 0 }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

export interface RequestQuery extends Scope {
  domain?: string;
  method?: string;
  status?: string; // "4xx" or "404"
  path?: string;
  ip?: string;
  minDur?: number;
  sort: 'ts' | 'domain' | 'status' | 'dur' | 'ip' | 'size';
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const SORT_COLS = { ts: requests.ts, domain: requests.domain, status: requests.status, dur: requests.dur, ip: requests.ip, size: requests.size };

function contains(col: typeof requests.path | typeof requests.ip, q: string) {
  const pattern = '%' + q.replace(/[\\%_]/g, c => '\\' + c) + '%';
  return sql`${col} like ${pattern} escape '\\'`;
}

function statusFilter(status?: string): SQL | undefined {
  if (status && /^[1-5]xx$/.test(status)) {
    const lo = Number(status[0]) * 100;
    return and(gte(requests.status, lo), lt(requests.status, lo + 100));
  }
  if (status && /^\d{3}$/.test(status)) return eq(requests.status, Number(status));
  return undefined;
}

export function requestLog(q: RequestQuery): RequestPage {
  // The table includes rows up to "now", so the upper bound is inclusive.
  const base = and(
    gte(requests.ts, q.start),
    lte(requests.ts, q.end),
    q.domains.length ? inArray(requests.domain, q.domains) : undefined,
    q.domain ? eq(requests.domain, q.domain) : undefined,
    q.method ? eq(requests.method, q.method) : undefined,
    q.path ? contains(requests.path, q.path) : undefined,
    q.ip ? contains(requests.ip, q.ip) : undefined,
    q.minDur ? gte(requests.dur, q.minDur) : undefined,
  );

  const g = db.select({ all: count(), c2, c3, c4, c5, newest: max(requests.ts) }).from(requests).where(base).get();
  const st = statusFilter(q.status);
  const where = and(base, st);
  const total = st ? (db.select({ n: count() }).from(requests).where(where).get()?.n ?? 0) : (g?.all ?? 0);

  const col = SORT_COLS[q.sort] ?? requests.ts;
  const rows: RequestRow[] = db
    .select({
      id: requests.id,
      ts: requests.ts,
      domain: requests.domain,
      method: requests.method,
      path: requests.path,
      status: requests.status,
      dur: requests.dur,
      size: requests.size,
      ip: requests.ip,
    })
    .from(requests)
    .where(where)
    .orderBy(q.dir === 'asc' ? asc(col) : desc(col), desc(requests.ts), desc(requests.id))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize)
    .all();

  return {
    rows,
    total,
    groups: { all: g?.all ?? 0, '2xx': Number(g?.c2 ?? 0), '3xx': Number(g?.c3 ?? 0), '4xx': Number(g?.c4 ?? 0), '5xx': Number(g?.c5 ?? 0) },
    newest: g?.newest ?? 0,
  };
}

export function requestById(id: number): RequestDetail | null {
  return db.select().from(requests).where(eq(requests.id, id)).get() ?? null;
}
