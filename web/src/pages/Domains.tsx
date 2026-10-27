import type { DomainStat } from '../../../shared/types';
import { qs, useQuery } from '../lib/api';
import { RANGE_LABEL, type Scope } from '../lib/ctx';
import { fmtInt, fmtPct, pctChange } from '../lib/format';
import { Icon } from '../components/Icon';

export function Domains({ scope, onOpen }: { scope: Scope; onOpen: (domain: string) => void }) {
  const { data, loading } = useQuery<DomainStat[]>(`/domains${qs({ start: scope.start, end: scope.end })}`, 'domains|' + scope.scopeKey);
  const rows = data ?? [];
  const dMax = Math.max(1, ...rows.map(r => r.totals.total));

  return (
    <section className="card" aria-label="Monitored domains" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '14px 18px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Monitored domains</h2>
          <span className="lbl">{data ? `${rows.length} domain${rows.length === 1 ? '' : 's'} · ${RANGE_LABEL[scope.rangeKey]}` : ''}</span>
        </div>
        <span className="lbl">Select a domain to open its requests</span>
      </div>
      <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
        <div style={{ minWidth: 960 }}>
          <div className="dhead">
            <span>Domain</span><span>Requests</span><span>Success rate</span><span>Avg response</span><span>Errors</span><span>Traffic trend</span><span />
          </div>
          {loading && [0, 1, 2, 3].map(i => (
            <div key={i} className="drow" style={{ cursor: 'default' }}>
              <span className="skel" style={{ height: 12, width: '70%' }} />
              <span className="skel" style={{ height: 12, width: '50%' }} />
              <span className="skel" style={{ height: 12, width: '60%' }} />
              <span className="skel" style={{ height: 12, width: '60%' }} />
              <span className="skel" style={{ height: 12, width: '50%' }} />
              <span className="skel" style={{ height: 12, width: '80%' }} />
              <span />
            </div>
          ))}
          {!loading && rows.map(x => {
            const t = x.totals;
            const sr = t.total ? ((t.c2 + t.c3) / t.total) * 100 : 0;
            const err = t.c4 + t.c5;
            const mx = Math.max(1, ...x.spark), mn = Math.min(...x.spark);
            const spark = x.spark.map((v, i) => `${(x.spark.length > 1 ? (i / (x.spark.length - 1)) * 120 : 0).toFixed(1)},${(28 - ((v - mn) / Math.max(1, mx - mn)) * 26).toFixed(1)}`).join(' ');
            return (
              <button key={x.domain} className="drow" onClick={() => onOpen(x.domain)} aria-label={`View requests for ${x.domain}`}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                  <span className="favi" aria-hidden="true">{x.domain[0]?.toUpperCase()}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span className="mono ell" style={{ fontWeight: 500, fontSize: 13 }}>{x.domain}</span>
                    <span className="lbl mono ell" style={{ fontSize: 11 }}>{x.service || '—'}</span>
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="mono" style={{ fontSize: 13 }}>{fmtInt(t.total)}</span>
                    <span className="delta d-neu" style={{ fontSize: 11.5 }}>{fmtPct(pctChange(t.total, x.prev.total))}</span>
                  </span>
                  <span className="bar" style={{ maxWidth: 150 }}><span style={{ width: (t.total / dMax) * 100 + '%' }} /></span>
                </span>
                <span className={'mono ' + (sr < 95 ? 'dur-slow' : '')} style={{ fontSize: 13 }}>{sr.toFixed(2)}%</span>
                <span className="mono" style={{ fontSize: 13 }}>{Math.round(t.avg)} ms</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span className="mono" style={{ fontSize: 13 }}>{fmtInt(err)}</span>
                  <span className="lbl num" style={{ fontSize: 11.5 }}>{(t.total ? (err / t.total) * 100 : 0).toFixed(1)}%</span>
                </span>
                <span>
                  <svg viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true" style={{ width: 120, height: 30, display: 'block', overflow: 'visible' }}>
                    <polyline className="ln sA" points={spark} />
                  </svg>
                </span>
                <Icon name="chevRight" className="ic chev" />
              </button>
            );
          })}
          {!loading && !rows.length && <div className="lbl" style={{ padding: '32px 18px', textAlign: 'center' }}>No traffic recorded in this range yet.</div>}
        </div>
      </div>
    </section>
  );
}
