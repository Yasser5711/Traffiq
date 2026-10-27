import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ConnState, Status } from '../../shared/types';
import { qs, useQuery } from './lib/api';
import { DUR_MIN, EMPTY_FILTERS, type Filters, type Page, type Scope, type Sort } from './lib/ctx';
import { ago, fmtHMS } from './lib/format';
import { ACCENTS, useDark, usePrefs, type RangeKey } from './lib/prefs';
import { Sidebar } from './components/Sidebar';
import { HeaderControls } from './components/HeaderControls';
import { Icon } from './components/Icon';
import { RequestDrawer } from './components/RequestDrawer';
import { RequestLog } from './components/RequestLog';
import { Overview } from './pages/Overview';
import { Domains } from './pages/Domains';

// The map pulls in world geometry and d3-geo: load it only when the Map page opens.
const MapPage = lazy(() => import('./pages/Map').then(m => ({ default: m.MapPage })));
import { Settings } from './pages/Settings';

const PAGES: Page[] = ['overview', 'requests', 'map', 'domains', 'settings'];
const TITLES: Record<Page, string> = { overview: 'Traffic Overview', requests: 'Requests', map: 'Map', domains: 'Domains', settings: 'Settings' };

function pageFromHash(): Page {
  const p = location.hash.replace(/^#\/?/, '') as Page;
  return PAGES.includes(p) ? p : 'overview';
}

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function App({ authEnabled, onLogout }: { authEnabled: boolean; onLogout: () => void }) {
  const [prefs, setPrefs] = usePrefs();
  const dark = useDark(prefs.theme);
  const ac = ACCENTS[prefs.accent];
  const now = useNow(1000);

  const [page, setPage] = useState<Page>(pageFromHash);
  useEffect(() => {
    const on = () => setPage(pageFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (p: Page) => {
    location.hash = '/' + p;
    setPage(p);
    setSel(null);
  };

  // Scope: time range + domain selection.
  const [range, setRange] = useState<RangeKey | 'custom'>(prefs.defRange);
  const [custom, setCustom] = useState<{ start: number; end: number } | null>(null);
  const [domainSel, setDomainSel] = useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [anchor, setAnchor] = useState(Date.now());
  const [updatedAt, setUpdatedAt] = useState(Date.now());

  // Live request log.
  const [live, setLive] = useState(true);
  const [pending, setPending] = useState(0);
  const [tableNow, setTableNow] = useState(Date.now());
  const liveRef = useRef(live);
  liveRef.current = live;

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<Sort>({ key: 'ts', dir: 'desc' });
  const [pg, setPg] = useState(0);
  const [sel, setSel] = useState<number | null>(null);

  // Server status + stream.
  const status = useQuery<Status>(`/status?t=${Math.floor(now / 10000)}`, 'status');
  const [streamDown, setStreamDown] = useState(false);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    es.addEventListener('hello', () => setStreamDown(false));
    es.addEventListener('ingest', e => {
      setStreamDown(false);
      const { count } = JSON.parse((e as MessageEvent).data) as { count: number };
      if (!liveRef.current) {
        setPending(p => p + count);
        return;
      }
      // Throttle table refreshes to one per second.
      const wait = Math.max(0, 1000 - (Date.now() - last));
      clearTimeout(timer);
      timer = setTimeout(() => {
        last = Date.now();
        setTableNow(last);
      }, wait);
    });
    es.onerror = () => setStreamDown(true);
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, []);

  // Auto-refresh charts and KPIs.
  useEffect(() => {
    if (!autoRefresh || range === 'custom') return;
    const t = setInterval(() => {
      const n = Date.now();
      setAnchor(n);
      setUpdatedAt(n);
    }, prefs.interval * 1000);
    return () => clearInterval(t);
  }, [autoRefresh, range, prefs.interval]);

  const refresh = () => {
    const n = Date.now();
    setAnchor(n);
    setUpdatedAt(n);
    setTableNow(n);
  };

  const scope: Scope = useMemo(() => {
    const isCustom = range === 'custom' && !!custom;
    const durMs = isCustom ? custom!.end - custom!.start : DUR_MIN[range as RangeKey] * 60_000;
    const end = isCustom ? custom!.end : anchor;
    const tableEnd = isCustom ? custom!.end : Math.max(tableNow, anchor);
    return {
      tz: prefs.tz,
      rangeKey: isCustom ? 'custom' : (range as RangeKey),
      start: end - durMs,
      end,
      tableStart: tableEnd - durMs,
      tableEnd,
      domains: domainSel,
      scopeKey: `${range}|${custom?.start}|${custom?.end}|${domainSel.join(',')}`,
      longRange: durMs > 1440 * 60_000 * 1.01,
    };
  }, [range, custom, anchor, tableNow, domainSel, prefs.tz]);

  const domainList = useQuery<{ domain: string; count: number }[]>(`/domain-list${qs({ start: scope.start, end: scope.end })}`, 'domain-list');

  // Connection state shown in the sidebar, header pill and banner.
  const serverDown = !!status.error && !status.data;
  const conn: ConnState = status.error || streamDown ? (serverDown ? 'disconnected' : 'reconnecting') : (status.data?.state ?? 'connected');
  const lastEvent = status.data?.lastEvent ?? null;
  const serverName = status.data?.serverName ?? 'vps-01';

  let liveCls = 'live on', liveLabel = 'Live';
  if (conn === 'disconnected') [liveCls, liveLabel] = ['live bad', 'Offline'];
  else if (conn === 'reconnecting') [liveCls, liveLabel] = ['live warn', 'Reconnecting'];
  else if (!live) [liveCls, liveLabel] = ['live off', 'Paused'];

  const isCustom = scope.rangeKey === 'custom';
  const updatedLabel = isCustom ? 'Fixed range' : autoRefresh ? 'Updated ' + ago(now - updatedAt) : 'Auto-refresh off · updated ' + ago(now - updatedAt);

  const toggleLive = () => {
    if (live) setLive(false);
    else {
      setLive(true);
      setPending(0);
      setTableNow(Date.now());
    }
  };

  const setF = (patch: Partial<Filters>) => {
    setFilters(f => ({ ...f, ...patch }));
    setPg(0);
  };

  const style = { '--accent': dark ? ac.a : ac.strong, '--accent-strong': ac.strong, '--accent-text': dark ? ac.a : ac.lt, display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', minHeight: '100vh' } as CSSProperties;

  const logProps = {
    scope, filters, setF, sort, setSort: (s: Sort) => { setSort(s); setPg(0); }, pg, setPg, sel, onOpen: setSel, live, pending, toggleLive,
    clearFilters: () => { setFilters(EMPTY_FILTERS); setPg(0); },
    domainOptions: (domainList.data ?? []).map(d => d.domain),
  };

  return (
    <div className={'tl' + (dark ? '' : ' light')} style={style}>
      <Sidebar page={page} go={go} serverName={serverName} conn={conn} lastEvent={lastEvent} tz={prefs.tz} authEnabled={authEnabled} onLogout={onLogout} />

      <main style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px 16px', padding: '14px 24px', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 25 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em' }}>{TITLES[page]}</h1>
            <span className={liveCls}><span className="dot" />{liveLabel}</span>
            {page !== 'settings' && <span className="lbl num">{updatedLabel}</span>}
          </div>
          {page !== 'settings' && (
            <HeaderControls
              tz={prefs.tz}
              domains={domainList.data ?? []}
              domainSel={domainSel}
              setDomainSel={d => { setDomainSel(d); setPg(0); }}
              range={range}
              custom={isCustom ? custom : null}
              setRange={r => { setRange(r); setCustom(null); setPg(0); refresh(); }}
              setCustom={c => { setCustom(c); setRange('custom'); setPg(0); }}
              autoRefresh={autoRefresh}
              setAutoRefresh={setAutoRefresh}
              interval={prefs.interval}
              refresh={refresh}
            />
          )}
        </header>

        {conn !== 'connected' && (
          <div className={'banner ' + (conn === 'disconnected' ? 'bad' : 'warn')} role="alert">
            <Icon name="wifiOff" />
            <span style={{ flex: 1, minWidth: 240 }}>
              <strong style={{ fontWeight: 600 }}>{conn === 'disconnected' ? `Connection to ${serverName} lost.` : `Reconnecting to ${serverName}…`}</strong>{' '}
              <span style={{ color: 'var(--muted)' }}>
                {serverDown
                  ? 'Traffiq can’t reach its server. Retrying automatically.'
                  : status.data?.lastError
                    ? `The Traefik access log can’t be read (${status.data.lastError}). ${lastEvent ? 'Showing data received up to ' + fmtHMS(lastEvent, prefs.tz) + '.' : ''}`
                    : 'The live stream dropped briefly. New requests will appear as soon as it is restored.'}
              </span>
            </span>
            <button className="btn" onClick={() => { status.reload(); refresh(); }}>Retry now</button>
          </div>
        )}

        <div style={{ padding: '20px 24px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {page === 'overview' && (
            <Overview
              scope={scope}
              onPickDomain={d => setDomainSel([d])}
              onPickEndpoint={(e, extra) => setF({ path: e.route.split(':')[0], domain: e.domain, ...extra })}
              onSlowest={e => { setF({ path: e.route.split(':')[0], domain: e.domain, status: 'all' }); setSort({ key: 'dur', dir: 'desc' }); }}
              onPickIp={ip => setF({ ip })}
            />
          )}
          {(page === 'overview' || page === 'requests') && <RequestLog {...logProps} mode={page} onViewAll={() => go('requests')} />}
          {page === 'map' && (
            <Suspense fallback={<span className="skel" style={{ height: 480, borderRadius: 10 }} />}>
              <MapPage
                scope={scope}
                geoStatus={status.data?.geo}
                onCountry={country => { setFilters({ ...EMPTY_FILTERS, country }); setPg(0); go('requests'); }}
              />
            </Suspense>
          )}
          {page === 'domains' &&<Domains scope={scope} onOpen={d => { setDomainSel([d]); setFilters(EMPTY_FILTERS); go('requests'); }} />}
          {page === 'settings' && <Settings prefs={prefs} setPrefs={setPrefs} status={status.data} conn={conn} reloadStatus={status.reload} />}
        </div>
      </main>

      {sel != null && (
        <RequestDrawer
          id={sel}
          tz={prefs.tz}
          onClose={() => setSel(null)}
          onByIp={ip => { setSel(null); setFilters({ ...EMPTY_FILTERS, ip }); setPg(0); go('requests'); }}
          onByPath={(path, domain) => { setSel(null); setFilters({ ...EMPTY_FILTERS, path, domain }); setPg(0); go('requests'); }}
          onByDomain={d => { setSel(null); setDomainSel([d]); setPg(0); }}
        />
      )}
    </div>
  );
}
