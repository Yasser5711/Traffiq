import { useEffect, useRef, useState } from 'react';
import type { RequestPage } from '../../../shared/types';
import { qs, useQuery } from '../lib/api';
import { EMPTY_FILTERS, type Filters, type Scope, type Sort, type SortKey } from '../lib/ctx';
import { durCls, flag, fmtDM, fmtDur, fmtHMS, fmtInt, fmtSize, methodCls, STATUS_TEXT, statusCls } from '../lib/format';
import { Icon } from './Icon';

interface Props {
  mode: 'overview' | 'requests';
  scope: Scope;
  filters: Filters;
  setF: (patch: Partial<Filters>) => void;
  clearFilters: () => void;
  sort: Sort;
  setSort: (s: Sort) => void;
  pg: number;
  setPg: (n: number) => void;
  sel: number | null;
  onOpen: (id: number) => void;
  live: boolean;
  pending: number;
  toggleLive: () => void;
  onViewAll: () => void;
  domainOptions: string[];
  onRows?: (ids: number[]) => void; // ids of the rows on screen, for keyboard navigation
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const STATUS_CODES = [200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504];
const GROUPS = [
  ['all', 'All', 'bgA'],
  ['2xx', '2xx Success', 'bg2'],
  ['3xx', '3xx Redirect', 'bg3'],
  ['4xx', '4xx Client error', 'bg4'],
  ['5xx', '5xx Server error', 'bg5'],
] as const;
const FRESH_MS = 3200;

/** Text input that only commits after the user pauses typing. */
function useDebounced(value: string, commit: (v: string) => void, ms = 300) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => commit(local), ms);
    return () => clearTimeout(t);
  }, [local]);
  return [local, setLocal] as const;
}

export function RequestLog(p: Props) {
  const { scope, filters: f, sort } = p;
  const pageSize = p.mode === 'overview' ? 10 : 25;
  const params = {
    start: scope.tableStart,
    end: scope.tableEnd,
    domains: scope.domains.join(','),
    domain: f.domain !== 'all' && f.domain,
    method: f.method !== 'all' && f.method,
    status: f.status !== 'all' && f.status,
    path: f.path.trim(),
    ip: f.ip.trim(),
    country: f.country,
    minDur: f.minDur,
    sort: sort.key,
    dir: sort.dir,
    page: p.pg,
    pageSize,
  };
  const { start, end, ...stable } = params;
  const { data, loading } = useQuery<RequestPage>(`/requests${qs(params)}`, JSON.stringify(stable) + scope.scopeKey);

  // Highlight rows that arrived since the previous live refresh.
  const seen = useRef(0);
  const [freshAfter, setFreshAfter] = useState(Infinity);
  const [freshUntil, setFreshUntil] = useState(0);
  useEffect(() => {
    if (!data) return;
    if (seen.current && data.newest > seen.current && p.live) {
      setFreshAfter(seen.current);
      setFreshUntil(Date.now() + FRESH_MS);
    }
    seen.current = Math.max(seen.current, data.newest);
  }, [data]);
  const [, force] = useState(0);
  useEffect(() => {
    if (!freshUntil) return;
    const t = setTimeout(() => force(x => x + 1), Math.max(0, freshUntil - Date.now()));
    return () => clearTimeout(t);
  }, [freshUntil]);
  const freshOn = Date.now() < freshUntil;

  useEffect(() => {
    if (data) p.onRows?.(data.rows.map(r => r.id));
  }, [data]);

  const [path, setPath] = useDebounced(f.path, v => p.setF({ path: v }));
  const [ip, setIp] = useDebounced(f.ip, v => p.setF({ ip: v }));
  const [minDur, setMinDur] = useDebounced(f.minDur, v => p.setF({ minDur: v }));

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pg = Math.min(p.pg, pages - 1);
  const filtersActive = (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).some(k => f[k] !== EMPTY_FILTERS[k]);
  const ready = !loading && !!data;

  const sortBtn = (k: SortKey, label: string) => {
    const on = sort.key === k;
    return (
      <button
        className={'thb' + (on ? ' on' : '')}
        onClick={() => p.setSort(on ? { key: k, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'domain' || k === 'ip' ? 'asc' : 'desc' })}
        aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        {label}
        <span>{on ? (sort.dir === 'asc' ? '↑' : '↓') : ''}</span>
      </button>
    );
  };

  const domainOpts = Array.from(new Set([...p.domainOptions, ...(f.domain !== 'all' ? [f.domain] : [])]));

  return (
    <>
      {p.mode === 'requests' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Filter by status group">
          {GROUPS.map(([v, label, dot]) => (
            <button key={v} className={'chip' + (f.status === v ? ' on' : '')} aria-pressed={f.status === v} onClick={() => p.setF({ status: v })}>
              <span className={'dot ' + dot} />
              <span>{label}</span>
              <span className="mono" style={{ color: 'var(--muted)' }}>{data ? fmtInt(data.groups[v]) : '–'}</span>
            </button>
          ))}
        </div>
      )}

      <section className="card" aria-label="Request log" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{p.mode === 'overview' ? 'Recent requests' : 'Request log'}</h2>
            <span className="lbl num">{data ? fmtInt(total) + ' matching' : ''}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!p.live && p.pending > 0 && (
              <button className="btn" onClick={p.toggleLive} style={{ color: 'var(--accent-text)' }}>
                <span className="dot bgA" />Show {fmtInt(p.pending)} new
              </button>
            )}
            <button className="btn" onClick={p.toggleLive} aria-pressed={!p.live}>
              <Icon name={p.live ? 'pause' : 'play'} />
              <span>{p.live ? 'Pause live' : 'Resume live'}</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 12px' }}>
          <label className="sr" htmlFor="f-dom">Domain</label>
          <select id="f-dom" className="sel" value={f.domain} onChange={e => p.setF({ domain: e.target.value })}>
            <option value="all">All domains</option>
            {domainOpts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <label className="sr" htmlFor="f-m">HTTP method</label>
          <select id="f-m" className="sel" value={f.method} onChange={e => p.setF({ method: e.target.value })}>
            <option value="all">All methods</option>
            {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <label className="sr" htmlFor="f-st">Status</label>
          <select id="f-st" className="sel" value={f.status} onChange={e => p.setF({ status: e.target.value })}>
            <option value="all">All statuses</option>
            <option value="2xx">2xx · Success</option>
            <option value="3xx">3xx · Redirect</option>
            <option value="4xx">4xx · Client error</option>
            <option value="5xx">5xx · Server error</option>
            <optgroup label="Status code">
              {STATUS_CODES.map(c => <option key={c} value={String(c)}>{c} {STATUS_TEXT[c]}</option>)}
            </optgroup>
          </select>
          <div className="fwrap" style={{ flex: '1 1 200px' }}>
            <Icon name="search" />
            <label className="sr" htmlFor="f-path">Search request path</label>
            <input id="f-path" className="inp mono" type="text" placeholder="Search path, e.g. /api/users" value={path} onChange={e => setPath(e.target.value)} autoComplete="off" aria-keyshortcuts="/" style={{ paddingRight: 30 }} />
            {!path && <span className="suffix kbd" aria-hidden="true">/</span>}
          </div>
          <div className="fwrap" style={{ flex: '0 1 170px' }}>
            <Icon name="ip" />
            <label className="sr" htmlFor="f-ip">Search client IP</label>
            <input id="f-ip" className="inp mono" type="text" placeholder="Client IP" value={ip} onChange={e => setIp(e.target.value)} autoComplete="off" />
          </div>
          <div className="fwrap" style={{ flex: '0 1 160px' }}>
            <Icon name="timer" />
            <label className="sr" htmlFor="f-dur">Minimum duration in milliseconds</label>
            <input id="f-dur" className="inp mono" type="number" min={0} step={50} placeholder="Min duration" value={minDur} onChange={e => setMinDur(e.target.value)} style={{ paddingRight: 32 }} />
            <span className="suffix">ms</span>
          </div>
          {f.country && (
            <button className="chip on" onClick={() => p.setF({ country: '' })} aria-label="Remove country filter" title="Remove country filter">
              <span>{f.country === '-' ? 'Unknown location' : `${flag(f.country)} ${f.country}`}</span>
              <Icon name="close" style={{ width: 13, height: 13 }} />
            </button>
          )}
          {filtersActive && (
            <button className="btn ghost" onClick={p.clearFilters}>
              <Icon name="close" />Clear filters
            </button>
          )}
        </div>

        <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
          <div role="table" aria-label="Requests" style={{ minWidth: 1060, ['--cols' as string]: '128px minmax(150px, 190px) 64px minmax(220px, 1fr) 52px 86px 150px 76px' }}>
            <div role="row" className="thead">
              <div role="columnheader">{sortBtn('ts', 'Timestamp')}</div>
              <div role="columnheader">{sortBtn('domain', 'Domain')}</div>
              <div role="columnheader">Method</div>
              <div role="columnheader">Path</div>
              <div role="columnheader">{sortBtn('status', 'Status')}</div>
              <div role="columnheader" className="r">{sortBtn('dur', 'Duration')}</div>
              <div role="columnheader">{sortBtn('ip', 'Client IP')}</div>
              <div role="columnheader" className="r">{sortBtn('size', 'Size')}</div>
            </div>
            {!ready &&
              [62, 48, 70, 55, 66, 44, 58, 50].map((w, i) => (
                <div key={i} className="trow" style={{ cursor: 'default' }}>
                  <span className="skel" style={{ height: 11, width: w + '%', gridColumn: '1 / -1' }} />
                </div>
              ))}
            {ready &&
              rows.map(r => (
                <div
                  key={r.id}
                  role="row"
                  tabIndex={0}
                  className={'trow' + (freshOn && r.ts > freshAfter ? ' fresh' : '') + (p.sel === r.id ? ' picked' : '')}
                  onClick={() => p.onOpen(r.id)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), p.onOpen(r.id))}
                >
                  <div role="cell" className="mono" style={{ color: 'var(--muted)' }}>
                    {scope.longRange ? fmtDM(r.ts, scope.tz) + ' ' + fmtHMS(r.ts, scope.tz) : fmtHMS(r.ts, scope.tz)}
                  </div>
                  <div role="cell"><span className="ell">{r.domain}</span></div>
                  <div role="cell"><span className={methodCls(r.method)}>{r.method}</span></div>
                  <div role="cell"><span className="pathbtn mono" title={r.path}>{r.path}</span></div>
                  <div role="cell"><span className={statusCls(r.status)}>{r.status}</span></div>
                  <div role="cell" className="mono r"><span className={durCls(r.dur)}>{fmtDur(r.dur)}</span></div>
                  <div role="cell" className="mono" style={{ gap: 6 }}>
                    {r.country && <span aria-label={r.country} title={r.country}>{flag(r.country)}</span>}
                    <span className="ell">{r.ip}</span>
                  </div>
                  <div role="cell" className="mono r" style={{ color: 'var(--muted)' }}>{fmtSize(r.size)}</div>
                </div>
              ))}
          </div>
        </div>

        {ready && rows.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '48px 16px', textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              <Icon name="searchMinus" style={{ width: 18, height: 18 }} />
            </div>
            <div style={{ fontWeight: 500 }}>{filtersActive ? 'No requests match these filters' : 'No requests in this range'}</div>
            <div className="lbl" style={{ maxWidth: 360 }}>Try widening the time range, choosing more domains, or removing a filter.</div>
            {filtersActive && <button className="btn" onClick={p.clearFilters} style={{ marginTop: 4 }}>Clear filters</button>}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          <span className="lbl num">
            {total ? `${pg * pageSize + 1}–${Math.min(total, (pg + 1) * pageSize)} of ${fmtInt(total)} · page ${pg + 1} of ${fmtInt(pages)}` : 'No results'}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {p.mode === 'overview' && (
              <button className="btn ghost" onClick={p.onViewAll} style={{ color: 'var(--accent-text)' }}>
                View all requests<Icon name="arrowRight" />
              </button>
            )}
            <button className="btn" onClick={() => p.setPg(Math.max(0, pg - 1))} disabled={pg === 0}>Previous</button>
            <button className="btn" onClick={() => p.setPg(Math.min(pages - 1, pg + 1))} disabled={pg >= pages - 1}>Next</button>
          </div>
        </div>
      </section>
    </>
  );
}
