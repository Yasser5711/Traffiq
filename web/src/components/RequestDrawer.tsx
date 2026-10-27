import { useEffect, useRef } from 'react';
import type { RequestDetail } from '../../../shared/types';
import { useQuery } from '../lib/api';
import { durCls, flag, fmtDM, fmtDur, fmtHMS, fmtInt, fmtSize, fmtYear, methodCls, STATUS_TEXT, statusCls } from '../lib/format';
import { Icon } from './Icon';

interface Props {
  id: number;
  position: { index: number; count: number } | null; // place in the visible table
  onPrev?: () => void;
  onNext?: () => void;
  tz: string;
  onClose: () => void;
  onByIp: (ip: string) => void;
  onByPath: (path: string, domain: string) => void;
  onByDomain: (domain: string) => void;
}

export function RequestDrawer({ id, position, onPrev, onNext, tz, onClose, onByIp, onByPath, onByDomain }: Props) {
  const { data: e, error } = useQuery<RequestDetail>(`/requests/${id}`);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const on = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => {
      window.removeEventListener('keydown', on);
      prev?.focus?.();
    };
  }, []);

  const q = e ? e.path.indexOf('?') : -1;
  const dash = (v: string) => v || '—';
  const kv = (rows: [string, string][]) => (
    <div className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <span className="mono">{v}</span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <button className="dscrim" aria-label="Close request details" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Request details">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {e && (
              <>
                <span className={methodCls(e.method)}>{e.method}</span>
                <span className={statusCls(e.status)}>{e.status}</span>
                <span className="ell" style={{ fontWeight: 500 }}>{STATUS_TEXT[e.status] ?? ''}</span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {position && (
              <>
                <span className="lbl num" style={{ marginRight: 2 }}>{position.index + 1} / {position.count}</span>
                <button className="btn icon ghost" aria-label="Previous request" title="Previous (↑ or k)" onClick={onPrev} disabled={!onPrev}>
                  <Icon name="chevDown" style={{ transform: 'rotate(180deg)' }} />
                </button>
                <button className="btn icon ghost" aria-label="Next request" title="Next (↓ or j)" onClick={onNext} disabled={!onNext}>
                  <Icon name="chevDown" />
                </button>
              </>
            )}
            <span className="kbd" aria-hidden="true">Esc</span>
            <button ref={closeRef} className="btn icon ghost" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && <span className="badmsg">This request is no longer available. It may have been removed by the retention policy.</span>}
          {!e && !error && [80, 60, 90, 70, 50].map(w => <span key={w} className="skel" style={{ height: 14, width: w + '%' }} />)}
          {e && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="eyebrow">URL</span>
                <div className="mono" style={{ fontSize: 12.5, wordBreak: 'break-all', padding: '10px 11px', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 7, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ flex: 1 }}>{(e.scheme || 'https') + '://' + e.domain + e.path}</span>
                  <button className="btn icon ghost" style={{ width: 24, height: 24, flex: 'none' }} aria-label="Copy URL" onClick={() => navigator.clipboard?.writeText((e.scheme || 'https') + '://' + e.domain + e.path)}>
                    <Icon name="copy" style={{ width: 13, height: 13 }} />
                  </button>
                </div>
                <span className="lbl mono" style={{ fontSize: 11.5 }}>
                  {fmtDM(e.ts, tz)} {fmtYear(e.ts, tz)}, {fmtHMS(e.ts, tz)}.{String(e.ts % 1000).padStart(3, '0')} · {tz}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {[
                  ['Duration', fmtDur(e.dur), durCls(e.dur)],
                  ['Status', String(e.status), ''],
                  ['Response size', fmtSize(e.size), ''],
                ].map(([k, v, c]) => (
                  <div key={k} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="lbl" style={{ fontSize: 11.5 }}>{k}</span>
                    <span className={'mono ' + c} style={{ fontSize: 15, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="eyebrow">Request</span>
                {kv([
                  ['Timestamp', new Date(e.ts).toISOString()],
                  ['Domain', e.domain],
                  ['Method', e.method],
                  ['Path', q >= 0 ? e.path.slice(0, q) : e.path],
                  ['Query string', q >= 0 ? e.path.slice(q) : '—'],
                  ['Protocol', dash(e.proto)],
                  ['Client IP', e.ip],
                  ['Location', e.country ? `${flag(e.country)} ${[e.city, e.countryName].filter(Boolean).join(', ')}` : e.country === '' ? 'Unknown (private or unlisted address)' : '—'],
                  ...(e.peer && e.peer !== e.ip ? ([['Proxy peer', e.peer]] as [string, string][]) : []),
                  ['User agent', dash(e.ua)],
                ])}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="eyebrow">Response</span>
                {kv([
                  ['Status', `${e.status} ${STATUS_TEXT[e.status] ?? ''}`],
                  ['Total duration', fmtDur(e.dur)],
                  ['Upstream duration', e.origin ? fmtDur(e.origin) : '—'],
                  ['Proxy overhead', e.overhead ? e.overhead.toFixed(2) + ' ms' : '—'],
                  ['Response size', fmtSize(e.size) + (e.size >= 1024 ? ` (${fmtInt(e.size)} bytes)` : '')],
                ])}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="eyebrow">Routing</span>
                {kv([
                  ['Entry point', dash(e.entrypoint)],
                  ['Router', dash(e.router)],
                  ['Service', dash(e.service)],
                  ['Upstream', dash(e.upstream)],
                  ['Request ID', dash(e.reqId)],
                ])}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button className="btn" onClick={() => onByIp(e.ip)}>Requests from this IP</button>
                <button className="btn" onClick={() => onByPath(e.path.split('?')[0]!, e.domain)}>Requests to this path</button>
                <button className="btn" onClick={() => onByDomain(e.domain)}>Only this domain</button>
              </div>
              <span className="lbl">Request and response bodies are not captured. Fields above come from the Traefik access log entry.</span>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
