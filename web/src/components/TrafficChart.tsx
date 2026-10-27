import { useState } from 'react';
import type { Series } from '../../../shared/types';
import { monoPath, niceMax } from '../lib/chart';
import { RANGE_LABEL, type Scope } from '../lib/ctx';
import { fmtCompact, fmtHM, fmtHMS, fmtInt, fmtWD } from '../lib/format';

const W = 1000, H = 280;
const GL = ['2xx', '3xx', '4xx', '5xx'], GN = ['Success', 'Redirect', 'Client error', 'Server error'];
const KEYS = ['c2', 'c3', 'c4', 'c5'] as const;

export function TrafficChart({ series, scope, loading }: { series: Series | null; scope: Scope; loading: boolean }) {
  const [mode, setMode] = useState<'total' | 'status'>('status');
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [hover, setHover] = useState<number | null>(null);
  const tz = scope.tz;

  const n = series?.c2.length ?? 0;
  const G = KEYS.map(k => series?.[k] ?? []);
  const TOT = G[0]!.map((_, i) => G[0]![i]! + G[1]![i]! + G[2]![i]! + G[3]![i]!);
  const ERR = G[0]!.map((_, i) => G[2]![i]! + G[3]![i]!);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const xs = TOT.map((_, i) => (n > 1 ? (i / (n - 1)) * W : 0));
  const bMs = series?.bucketMs ?? 60_000;
  const s0 = series?.start ?? scope.start;

  const paths: { cls: string; d: string }[] = [];
  let maxV = 0, empty = false;
  const area = (line: string) => line + 'L' + W + ',' + H + 'L0,' + H + 'Z';
  if (n >= 2) {
    if (mode === 'status') {
      const cum: number[][] = [];
      let run = new Array<number>(n).fill(0);
      for (let k = 0; k < 4; k++) {
        if (!hidden['g' + k]) run = run.map((v, i) => v + G[k]![i]!);
        cum[k] = run.slice();
      }
      maxV = Math.max(...cum[3]!);
      empty = [0, 1, 2, 3].every(k => hidden['g' + k]);
      const nm = niceMax(maxV || 1);
      const yv = (v: number) => H - (v / nm) * (H - 6);
      const lines: { cls: string; d: string }[] = [];
      // Draw the largest stack first so smaller ones paint on top.
      for (let k = 3; k >= 0; k--) {
        if (hidden['g' + k]) continue;
        const line = monoPath(xs, cum[k]!.map(yv));
        paths.push({ cls: 'f' + (k + 2), d: area(line) });
        lines.push({ cls: 'ln s' + (k + 2), d: line });
      }
      paths.push(...lines);
    } else {
      maxV = Math.max(...(hidden.tot ? ERR : TOT));
      empty = !!hidden.tot && !!hidden.err;
      const nm = niceMax(maxV || 1);
      const yv = (v: number) => H - (v / nm) * (H - 6);
      if (!hidden.tot) {
        const l = monoPath(xs, TOT.map(yv));
        paths.push({ cls: 'fA', d: area(l) }, { cls: 'ln sA', d: l });
      }
      if (!hidden.err) {
        const l = monoPath(xs, ERR.map(yv));
        paths.push({ cls: 'fE', d: area(l) }, { cls: 'ln s5', d: l });
      }
    }
  }
  const nm = niceMax(maxV || 1);
  const yTicks = [0, 1, 2, 3, 4].map(i => ({ pos: (((i / 4) * (H - 6)) / H) * 100 + '%', label: fmtCompact((nm * i) / 4) }));
  const bMin = bMs / 60_000;
  const bLabel = bMin < 1 ? Math.round(bMs / 1000) + ' s' : bMin < 60 ? bMin + ' min' : bMin / 60 + ' h';
  const tickLabel = (t: number) => (scope.longRange ? fmtWD(t, tz) : bMin < 1 ? fmtHMS(t, tz) : fmtHM(t, tz));
  const xTicks = n >= 2 ? [0, 1, 2, 3, 4, 5].map(j => {
    const i = Math.round((j * (n - 1)) / 5);
    return { pos: (i / (n - 1)) * 100 + '%', shift: j === 0 ? '0' : j === 5 ? '-100%' : '-50%', label: tickLabel(s0 + i * bMs) };
  }) : [];
  let peakI = 0;
  TOT.forEach((v, i) => { if (v > TOT[peakI]!) peakI = i; });
  const peakT = s0 + peakI * bMs;
  const sub = `${RANGE_LABEL[scope.rangeKey]} · ${bLabel} intervals · peak ${fmtInt(TOT[peakI] ?? 0)} at ${scope.longRange ? fmtWD(peakT, tz) + ' ' : ''}${fmtHM(peakT, tz)}`;

  const legend = mode === 'status'
    ? [0, 1, 2, 3].map(k => ({ key: 'g' + k, label: GL[k]!, value: sum(G[k]!), dot: 'dot bg' + (k + 2) }))
    : [{ key: 'tot', label: 'All requests', value: sum(TOT), dot: 'dot bgA' }, { key: 'err', label: 'Errors (4xx + 5xx)', value: sum(ERR), dot: 'dot bg5' }];

  const bTime = (i: number) => {
    const t0 = s0 + i * bMs, t1 = t0 + bMs;
    if (bMin < 1) return fmtHMS(t0, tz) + ' – ' + fmtHMS(t1, tz);
    if (scope.longRange) return fmtWD(t0, tz) + ' · ' + fmtHM(t0, tz) + ' – ' + fmtHM(t1, tz);
    return fmtHM(t0, tz) + ' – ' + fmtHM(t1, tz);
  };

  let hv: null | { left: string; shift: string; time: string; rows: { label: string; value: string; dot: string }[]; footLabel: string; foot: string } = null;
  if (hover != null && hover < n && !loading && !empty) {
    const i = hover, frac = n > 1 ? i / (n - 1) : 0;
    hv = {
      left: frac * 100 + '%',
      shift: frac < 0.6 ? '12px' : 'calc(-100% - 12px)',
      time: bTime(i),
      rows: mode === 'status'
        ? [3, 2, 1, 0].filter(k => !hidden['g' + k]).map(k => ({ label: GL[k] + ' ' + GN[k], value: fmtInt(G[k]![i]!), dot: 'dot bg' + (k + 2) }))
        : [{ label: 'Requests', value: fmtInt(TOT[i]!), dot: 'dot bgA' }, { label: 'Errors', value: fmtInt(ERR[i]!), dot: 'dot bg5' }],
      footLabel: mode === 'status' ? 'Total' : 'Error rate',
      foot: mode === 'status' ? fmtInt(TOT[i]!) : (TOT[i] ? ((ERR[i]! / TOT[i]!) * 100).toFixed(1) : '0.0') + '%',
    };
  }

  return (
    <section className="card chart" aria-label="Requests over time" style={{ padding: '16px 16px 10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Requests over time</h2>
          <div className="lbl num" style={{ marginTop: 2 }}>{series ? sub : ' '}</div>
        </div>
        <div className="seg" role="group" aria-label="Chart breakdown">
          {(['total', 'status'] as const).map(m => (
            <button key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => { setMode(m); setHover(null); }}>
              {m === 'total' ? 'Total' : 'By status'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '14px 0 12px' }}>
        {legend.map(l => (
          <button key={l.key} className={'leg' + (hidden[l.key] ? ' off' : '')} aria-pressed={!hidden[l.key]} onClick={() => setHidden(h => ({ ...h, [l.key]: !h[l.key] }))}>
            <span className={l.dot} />
            <span>{l.label}</span>
            <span className="mono" style={{ color: 'var(--muted)' }}>{fmtCompact(l.value)}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ position: 'relative', width: 40, height: 280, flex: 'none' }} aria-hidden="true">
          {yTicks.map(y => (
            <span key={y.pos} className="mono" style={{ position: 'absolute', right: 0, bottom: y.pos, transform: 'translateY(50%)', fontSize: 11, color: 'var(--faint)' }}>{y.label}</span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: 'relative', height: 280 }} onMouseLeave={() => setHover(null)}>
            {yTicks.map(y => (
              <div key={y.pos} style={{ position: 'absolute', left: 0, right: 0, bottom: y.pos, borderTop: '1px dashed var(--border)' }} />
            ))}
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Requests over time, ${RANGE_LABEL[scope.rangeKey]}, ${fmtInt(sum(TOT))} requests in total`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', opacity: loading ? 0.25 : 1, transition: 'opacity .2s' }}>
              <defs>
                <linearGradient id="tlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: 'var(--accent)', stopOpacity: 0.3 }} />
                  <stop offset="1" style={{ stopColor: 'var(--accent)', stopOpacity: 0.02 }} />
                </linearGradient>
              </defs>
              {paths.map((p, i) => <path key={i} className={p.cls} d={p.d} />)}
            </svg>
            {loading && <span className="skel" style={{ position: 'absolute', inset: 0, opacity: 0.5 }} />}
            {empty && <div className="lbl" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>All series hidden. Select a series in the legend to show it.</div>}
            {hv && (
              <>
                <div className="vline" style={{ left: hv.left }} />
                <div className="tip" style={{ left: hv.left, transform: `translateX(${hv.shift})` }}>
                  <div className="mono" style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 6 }}>{hv.time}</div>
                  {hv.rows.map(t => (
                    <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                      <span className={t.dot} />
                      <span style={{ flex: 1 }}>{t.label}</span>
                      <span className="mono">{t.value}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                    <span style={{ color: 'var(--muted)' }}>{hv.footLabel}</span>
                    <span className="mono" style={{ fontWeight: 500 }}>{hv.foot}</span>
                  </div>
                </div>
              </>
            )}
            <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
              {TOT.map((_, i) => <div key={i} style={{ flex: 1, height: '100%' }} onMouseEnter={() => hover !== i && setHover(i)} />)}
            </div>
          </div>
          <div style={{ position: 'relative', height: 22, marginTop: 6 }} aria-hidden="true">
            {xTicks.map((x, j) => (
              <span key={j} className="mono" style={{ position: 'absolute', top: 0, left: x.pos, transform: `translateX(${x.shift})`, fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap' }}>{x.label}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
