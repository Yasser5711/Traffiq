import type { ConnState } from '../../../shared/types';
import type { Page } from '../lib/ctx';
import { fmtHMS } from '../lib/format';
import { Icon, type IconName } from './Icon';

const NAV: [Page, string, IconName][] = [
  ['overview', 'Overview', 'overview'],
  ['requests', 'Requests', 'requests'],
  ['domains', 'Domains', 'globe'],
  ['settings', 'Settings', 'settings'],
];

interface Props {
  page: Page;
  go: (p: Page) => void;
  serverName: string;
  conn: ConnState;
  lastEvent: number | null;
  tz: string;
  authEnabled: boolean;
  onLogout: () => void;
}

export function Sidebar({ page, go, serverName, conn, lastEvent, tz, authEnabled, onLogout }: Props) {
  const [dot, label, sub] = {
    connected: ['dot bg2', 'VPS Connected', `${serverName} · Traefik logs`],
    reconnecting: ['dot bg4', 'Reconnecting…', 'Retrying automatically'],
    disconnected: ['dot bg5', 'VPS Disconnected', lastEvent ? 'Last event ' + fmtHMS(lastEvent, tz) : 'No events received'],
  }[conn];

  return (
    <nav className="side" aria-label="Primary" style={{ flex: '0 0 216px', display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 10px', borderRight: '1px solid var(--border)', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 18px' }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--accent-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flex: 'none' }}>
          <Icon name="logo" style={{ width: 15, height: 15, strokeWidth: 2.2 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em' }}>TrafficLens</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{serverName}</span>
        </div>
      </div>
      {NAV.map(([k, text, icon]) => (
        <button key={k} className={'nav' + (page === k ? ' on' : '')} aria-current={page === k ? 'page' : undefined} onClick={() => go(k)}>
          <Icon name={icon} />
          <span>{text}</span>
        </button>
      ))}
      <div className="grow" style={{ flexGrow: 1, minHeight: 24 }} />
      {authEnabled && (
        <button className="nav" onClick={onLogout} style={{ marginBottom: 8 }}>
          <Icon name="logout" />
          <span>Sign out</span>
        </button>
      )}
      <div className="card connbox" role="status" style={{ padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={dot} />
          <span style={{ fontWeight: 500, fontSize: 12.5 }}>{label}</span>
        </div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</span>
      </div>
    </nav>
  );
}
