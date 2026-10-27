import type { EndpointStat, Overview as OverviewData } from '../../../shared/types';
import { qs, useQuery } from '../lib/api';
import { PREV_LABEL, scopeParams, type Filters, type Scope } from '../lib/ctx';
import { durCls, fmtCompact, fmtDur, fmtInt, fmtPct, fmtPP, methodCls, pctChange, statusCls } from '../lib/format';
import { TrafficChart } from '../components/TrafficChart';

interface Props {
  scope: Scope;
  onPickDomain: (d: string) => void;
  onPickEndpoint: (e: EndpointStat, extra: Partial<Filters>) => void;
  onSlowest: (e: EndpointStat) => void;
  onPickIp: (ip: string) => void;
}

// good: +1 when up is good, -1 when up is bad, 0 neutral.
function delta(v: number, good: number) {
  const up = v >= 0;
  const cls = Math.abs(v) < 0.05 || good === 0 ? 'd-neu' : (up ? 1 : -1) * good > 0 ? 'd-good' : 'd-bad';
  return { arrow: up ? '↑' : '↓', cls: 'delta ' + cls };
}

export function Overview({ scope, onPickDomain, onPickEndpoint, onSlowest, onPickIp }: Props) {
  const { data, loading } = useQuery<OverviewData>(`/overview${qs(scopeParams(scope))}`, 'overview|' + scope.scopeKey);
  const busy = loading || !data;
  const t = data?.totals, p = data?.prev;

  const sr = t && t.total ? ((t.c2 + t.c3) / t.total) * 100 : 0;
  const pSr = p && p.total ? ((p.c2 + p.c3) / p.total) * 100 : 0;
  const prevLabel = PREV_LABEL[scope.rangeKey];
  const kpis = t && p
    ? [
        { label: 'Total requests', hint: 'HTTP/S', value: fmtInt(t.total), unit: '', d: fmtPct(pctChange(t.total, p.total)), prev: fmtInt(p.total), ...delta(pctChange(t.total, p.total), 0) },
        { label: 'Success rate', hint: '2xx + 3xx', value: sr.toFixed(2), unit: '%', d: fmtPP(sr - pSr), prev: pSr.toFixed(2) + '%', ...delta(sr - pSr, 1) },
        { label: 'Avg response time', hint: 'mean', value: fmtInt(t.avg), unit: 'ms', d: fmtPct(pctChange(t.avg, p.avg)), prev: Math.round(p.avg) + ' ms', ...delta(pctChange(t.avg, p.avg), -1) },
        { label: 'Error requests', hint: `${fmtCompact(t.c4)} 4xx · ${fmtCompact(t.c5)} 5xx`, value: fmtInt(t.c4 + t.c5), unit: '', d: fmtPct(pctChange(t.c4 + t.c5, p.c4 + p.c5)), prev: fmtInt(p.c4 + p.c5), ...delta(pctChange(t.c4 + t.c5, p.c4 + p.c5), -1) },
      ]
    : ['Total requests', 'Success rate', 'Avg response time', 'Error requests'].map(label => ({ label, hint: '', value: '', unit: '', d: '', prev: '', arrow: '', cls: '' }));

  const topMax = data?.topDomains[0]?.count || 1;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <section key={k.label} className="card" aria-label={k.label} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 108 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 500 }}>{k.label}</span>
              <span className="lbl mono" style={{ fontSize: 11 }}>{k.hint}</span>
            </div>
            {busy ? (
              <>
                <span className="skel" style={{ height: 28, width: '55%' }} />
                <span className="skel" style={{ height: 13, width: '75%' }} />
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span className="num" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{k.value}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{k.unit}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className={k.cls}>{k.arrow} {k.d}</span>
                  <span className="lbl num">vs {k.prev} {prevLabel}</span>
                </div>
              </>
            )}
          </section>
        ))}
      </div>

      <TrafficChart series={data?.series ?? null} scope={scope} loading={busy} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(270px, 100%), 1fr))', gap: 12 }}>
        <InsightCard title="Top domains" hint="Requests" empty={!busy && !data?.topDomains.length} emptyText="No traffic in this range." loading={busy}>
          {data?.topDomains.map(d => (
            <button key={d.domain} className="irow" onClick={() => onPickDomain(d.domain)} title={`Filter dashboard to ${d.domain}`}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="mono ell" style={{ fontSize: 12.5 }}>{d.domain}</span>
                  <span className="mono" style={{ fontSize: 12.5 }}>{fmtInt(d.count)}</span>
                </div>
                <div className="bar"><span style={{ width: (d.count / topMax) * 100 + '%' }} /></div>
              </div>
            </button>
          ))}
        </InsightCard>

        <InsightCard title="Failing endpoints" hint="4xx + 5xx" empty={!busy && !data?.failing.length} emptyText="No failed requests in this range." loading={busy}>
          {data?.failing.map(e => (
            <button key={e.domain + e.method + e.route} className="irow" onClick={() => onPickEndpoint(e, { status: String(e.code ?? 4)[0] + 'xx' })}>
              <span className={methodCls(e.method)} style={{ minWidth: 0, padding: '0 5px', fontSize: 10.5 }}>{e.method}</span>
              <Endpoint e={e} />
              {e.code && <span className={statusCls(e.code)}>{e.code}</span>}
              <span className="mono" style={{ minWidth: 34, textAlign: 'right' }}>{fmtInt(e.count)}</span>
            </button>
          ))}
        </InsightCard>

        <InsightCard title="Slowest endpoints" hint="Avg duration" empty={!busy && !data?.slowest.length} emptyText="Not enough requests yet." loading={busy}>
          {data?.slowest.map(e => (
            <button key={e.domain + e.method + e.route} className="irow" onClick={() => onSlowest(e)}>
              <span className={methodCls(e.method)} style={{ minWidth: 0, padding: '0 5px', fontSize: 10.5 }}>{e.method}</span>
              <Endpoint e={e} />
              <span className={'mono ' + durCls(e.avg ?? 0)} style={{ whiteSpace: 'nowrap' }}>{fmtDur(e.avg ?? 0)}</span>
            </button>
          ))}
        </InsightCard>

        <InsightCard title="Top client IPs" hint="Requests" empty={!busy && !data?.topIps.length} emptyText="No clients in this range." loading={busy}>
          {data?.topIps.map(o => (
            <button key={o.ip} className="irow" onClick={() => onPickIp(o.ip)}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span className="mono ell" style={{ fontSize: 12.5 }}>{o.ip}</span>
                <span className="lbl" style={{ fontSize: 11.5 }}>{Math.round((o.errors / o.count) * 100)}% errors</span>
              </span>
              <span className="mono">{fmtInt(o.count)}</span>
            </button>
          ))}
        </InsightCard>
      </div>
    </>
  );
}

function Endpoint({ e }: { e: EndpointStat }) {
  return (
    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <span className="mono ell" style={{ fontSize: 12.5 }} title={e.route}>{e.route}</span>
      <span className="lbl ell" style={{ fontSize: 11.5 }}>{e.domain}</span>
    </span>
  );
}

function InsightCard({ title, hint, children, empty, emptyText, loading }: { title: string; hint: string; children: React.ReactNode; empty: boolean; emptyText: string; loading: boolean }) {
  return (
    <section className="card" style={{ padding: '14px 8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 6px' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{title}</h3>
        <span className="lbl">{hint}</span>
      </div>
      {loading
        ? [70, 55, 62, 48].map(w => <div key={w} style={{ padding: '13px 8px' }}><span className="skel" style={{ height: 12, width: w + '%' }} /></div>)
        : children}
      {empty && <div className="lbl" style={{ padding: '18px 8px' }}>{emptyText}</div>}
    </section>
  );
}
