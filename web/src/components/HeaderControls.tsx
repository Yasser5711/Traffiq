import { useEffect, useState } from 'react';
import { fmtCompact, fmtDM, fmtHM, toLocalInput } from '../lib/format';
import type { RangeKey } from '../lib/prefs';
import { Icon } from './Icon';

const RANGES: RangeKey[] = ['15m', '1h', '24h', '7d'];
const MIN = 60_000;

interface Props {
  tz: string;
  domains: { domain: string; count: number }[];
  domainSel: string[];
  setDomainSel: (d: string[]) => void;
  range: RangeKey | 'custom';
  custom: { start: number; end: number } | null;
  setRange: (r: RangeKey) => void;
  setCustom: (c: { start: number; end: number }) => void;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  interval: number;
  refresh: () => void;
}

export function HeaderControls(p: Props) {
  const [open, setOpen] = useState<'domain' | 'custom' | null>(null);
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open]);

  const domainLabel = !p.domainSel.length ? 'All domains' : p.domainSel.length === 1 ? p.domainSel[0] : p.domainSel.length + ' domains';

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative' }}>
        <button className="btn" onClick={() => setOpen(open === 'domain' ? null : 'domain')} aria-haspopup="true" aria-expanded={open === 'domain'}>
          <Icon name="globe" style={{ color: 'var(--muted)' }} />
          <span>{domainLabel}</span>
          <Icon name="chevDown" style={{ color: 'var(--muted)', width: 14, height: 14 }} />
        </button>
        {open === 'domain' && <DomainPicker {...p} onClose={() => setOpen(null)} />}
      </div>

      <div style={{ position: 'relative' }}>
        <div className="seg" role="group" aria-label="Time range">
          {RANGES.map(r => {
            const on = !p.custom && p.range === r;
            return (
              <button key={r} className={on ? 'on' : ''} aria-pressed={on} onClick={() => { p.setRange(r); setOpen(null); }}>
                {r}
              </button>
            );
          })}
          <button className={p.custom ? 'on' : ''} aria-pressed={!!p.custom} onClick={() => setOpen(open === 'custom' ? null : 'custom')}>
            <Icon name="calendar" style={{ width: 13, height: 13 }} />
            <span>{p.custom ? `${fmtDM(p.custom.start, p.tz)} ${fmtHM(p.custom.start, p.tz)} – ${fmtHM(p.custom.end, p.tz)}` : 'Custom'}</span>
          </button>
        </div>
        {open === 'custom' && <CustomRange custom={p.custom} onApply={c => { p.setCustom(c); setOpen(null); }} onClose={() => setOpen(null)} />}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, paddingLeft: 10, borderLeft: '1px solid var(--border)' }}>
        <button className={'switch' + (p.autoRefresh ? ' on' : '')} role="switch" aria-checked={p.autoRefresh} aria-label="Auto-refresh" onClick={() => p.setAutoRefresh(!p.autoRefresh)}>
          <span className="knob" />
        </button>
        <span className="lbl" aria-hidden="true">Auto-refresh · {p.interval < 60 ? p.interval + 's' : '1m'}</span>
      </div>
      <button
        className="btn icon"
        aria-label="Refresh now"
        onClick={() => {
          p.refresh();
          setSpin(true);
          setTimeout(() => setSpin(false), 600);
        }}
      >
        <Icon name="refresh" className={'ic' + (spin ? ' spin' : '')} />
      </button>
    </div>
  );
}

function DomainPicker({ domains, domainSel, setDomainSel, onClose }: Props & { onClose: () => void }) {
  const [q, setQ] = useState('');
  const all = domains.map(d => d.domain);
  const selected = domainSel.length ? domainSel : all;
  const dq = q.trim().toLowerCase();
  const opts = domains.filter(d => !dq || d.domain.includes(dq));
  const total = domains.reduce((s, d) => s + d.count, 0);

  const toggle = (name: string) => {
    let next = selected.includes(name) ? selected.filter(v => v !== name) : [...selected, name];
    if (!next.length) return; // keep at least one domain
    if (next.length === all.length) next = [];
    setDomainSel(next);
  };

  return (
    <>
      <button className="scrim" aria-label="Close domain selector" onClick={onClose} />
      <div className="pop" style={{ left: 0, width: 310, padding: 6, maxHeight: '70vh', overflowY: 'auto' }}>
        <div className="fwrap" style={{ marginBottom: 4 }}>
          <Icon name="search" />
          <label className="sr" htmlFor="tl-dq">Search domains</label>
          <input id="tl-dq" className="inp" type="text" placeholder="Search domains…" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" autoFocus />
        </div>
        <label className="opt">
          <input type="checkbox" checked={!domainSel.length} onChange={() => domainSel.length && setDomainSel([])} />
          <span style={{ flex: 1, fontWeight: 500 }}>All domains</span>
          <span className="lbl mono">{fmtCompact(total)}</span>
        </label>
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        {opts.map(o => (
          <label key={o.domain} className="opt">
            <input type="checkbox" checked={selected.includes(o.domain)} onChange={() => toggle(o.domain)} />
            <span className="mono ell" style={{ flex: 1, fontSize: 12.5 }}>{o.domain}</span>
            <span className="lbl mono">{fmtCompact(o.count)}</span>
          </label>
        ))}
        {!opts.length && <div className="lbl" style={{ padding: '10px 9px' }}>{domains.length ? `No domains match “${q}”` : 'No traffic recorded yet'}</div>}
      </div>
    </>
  );
}

function CustomRange({ custom, onApply, onClose }: { custom: { start: number; end: number } | null; onApply: (c: { start: number; end: number }) => void; onClose: () => void }) {
  const now = Date.now();
  const [from, setFrom] = useState(toLocalInput(custom?.start ?? now - 6 * 3600e3));
  const [to, setTo] = useState(toLocalInput(custom?.end ?? now));
  const [err, setErr] = useState('');

  const apply = () => {
    const a = new Date(from).getTime(), b = new Date(to).getTime(), t = Date.now();
    if (!isFinite(a) || !isFinite(b)) return setErr('Enter both a start and an end time.');
    if (b <= a) return setErr('The end time must be after the start time.');
    if (b - a < 5 * MIN) return setErr('Choose a range of at least 5 minutes.');
    if (b - a > 31 * 1440 * MIN) return setErr('Choose a range of at most 31 days.');
    onApply({ start: a, end: Math.min(b, t) });
  };

  return (
    <>
      <button className="scrim" aria-label="Close custom range" onClick={onClose} />
      <div className="pop" style={{ right: 0, width: 290, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="eyebrow">Custom range</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="lbl">From</span>
          <input className="inp" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="lbl">To</span>
          <input className="inp" type="datetime-local" value={to} onChange={e => setTo(e.target.value)} />
        </label>
        <span className="lbl">Data is available for the configured retention period.</span>
        {err && <span className="badmsg">{err}</span>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={apply}>Apply range</button>
        </div>
      </div>
    </>
  );
}
