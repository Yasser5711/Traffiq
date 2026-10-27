import { useState } from 'react';
import type { ConnState, Status } from '../../../shared/types';
import { api } from '../lib/api';
import { ago, fmtHMS, fmtInt } from '../lib/format';
import type { Prefs } from '../lib/prefs';
import { Icon } from '../components/Icon';

const TIMEZONES = ['Europe/Paris', 'UTC', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore'];

interface Props {
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  status: Status | null;
  conn: ConnState;
  reloadStatus: () => void;
}

export function Settings({ prefs, setPrefs, status, conn, reloadStatus }: Props) {
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [retention, setRetention] = useState<string | null>(null);
  const [saved, setSaved] = useState('');

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await api<{ ok: boolean; message: string }>('/status/test', { method: 'POST' }));
    } catch {
      setTest({ ok: false, message: 'Traffiq server is unreachable.' });
    }
    setTesting(false);
    reloadStatus();
  };

  const saveRetention = async (value: string) => {
    setRetention(value);
    setSaved('');
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify({ retention: value }) });
      setSaved('Saved');
      reloadStatus();
    } catch {
      setSaved('Could not save');
    }
  };

  const liveCls = { connected: 'live on', reconnecting: 'live warn', disconnected: 'live bad' }[conn];
  const connShort = { connected: 'Connected', reconnecting: 'Reconnecting', disconnected: 'Disconnected' }[conn];
  const tzs = TIMEZONES.includes(prefs.tz) ? TIMEZONES : [prefs.tz, ...TIMEZONES];
  const row = (label: React.ReactNode, desc: string, control: React.ReactNode, extra?: React.ReactNode) => (
    <div className="srow">
      <div className="sdesc" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {label}
        <span className="lbl">{desc}</span>
        {extra}
      </div>
      {control}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820, width: '100%' }}>
      <section className="card" aria-labelledby="set-src">
        <div className="srow" style={{ alignItems: 'flex-start' }}>
          <div className="sdesc" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 id="set-src" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Data source</h2>
            <span className="lbl">Traffiq reads the Traefik access log written by Dokploy on this server. Nothing leaves the VPS.</span>
          </div>
          <span className={liveCls}><span className="dot" />{connShort}</span>
        </div>
        {row(
          <span style={{ fontWeight: 500 }}>Access log</span>,
          'JSON access log consumed by the collector.',
          <span className="mono" style={{ fontSize: 12, padding: '6px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel2)', wordBreak: 'break-all' }}>{status?.logPath ?? '…'}</span>,
          status?.lastError ? <span className="badmsg">{status.lastError}</span> : null,
        )}
        {row(
          <span style={{ fontWeight: 500 }}>Last event received</span>,
          'Time of the most recent request stored.',
          <span className="mono" style={{ fontSize: 12.5 }}>{status?.lastEvent ? `${fmtHMS(status.lastEvent, prefs.tz)} (${ago(Date.now() - status.lastEvent)})` : 'No events yet'}</span>,
        )}
        {row(
          <span style={{ fontWeight: 500 }}>Lines read</span>,
          'Log lines processed since the server started.',
          <span className="mono" style={{ fontSize: 12.5 }}>{status ? fmtInt(status.linesTotal) : '…'}</span>,
        )}
        {row(
          <span style={{ fontWeight: 500 }}>IP geolocation</span>,
          'DB-IP City Lite, stored on this server and refreshed monthly. Lookups never leave the VPS.',
          <span className={!status ? 'mono' : status.geo.loaded ? 'okmsg' : status.geo.error && !status.geo.downloading ? 'badmsg' : 'lbl'} style={{ fontSize: 12.5 }}>
            {!status
              ? '…'
              : !status.geo.enabled
                ? 'Off'
                : status.geo.loaded
                  ? `Ready${status.geo.builtAt ? ' · built ' + new Date(status.geo.builtAt).toISOString().slice(0, 10) : ''}`
                  : status.geo.downloading
                    ? 'Downloading…'
                    : status.geo.error ?? 'Loading…'}
          </span>,
        )}
        {row(
          <span style={{ fontWeight: 500 }}>Test connection</span>,
          'Checks that the log file is readable and new lines are arriving.',
          <button className="btn" onClick={runTest} disabled={testing}>
            <Icon name="refresh" className={'ic' + (testing ? ' spin' : '')} />
            {testing ? 'Testing…' : 'Test connection'}
          </button>,
          test ? <span className={test.ok ? 'okmsg' : 'badmsg'}>{test.message}</span> : null,
        )}
      </section>

      <section className="card" aria-labelledby="set-pref">
        <div className="srow">
          <h2 id="set-pref" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Preferences</h2>
          <span className="lbl">Changes apply immediately.</span>
        </div>
        {row(
          <label htmlFor="s-int" style={{ fontWeight: 500 }}>Refresh interval</label>,
          'How often charts and summary cards update while auto-refresh is on.',
          <select id="s-int" className="sel" value={prefs.interval} onChange={e => setPrefs({ interval: parseInt(e.target.value, 10) || 5 })} style={{ width: 180 }}>
            <option value={5}>Every 5 seconds</option>
            <option value={10}>Every 10 seconds</option>
            <option value={30}>Every 30 seconds</option>
            <option value={60}>Every minute</option>
          </select>,
        )}
        {row(
          <label htmlFor="s-range" style={{ fontWeight: 500 }}>Default time range</label>,
          'The range selected when Traffiq opens.',
          <select id="s-range" className="sel" value={prefs.defRange} onChange={e => setPrefs({ defRange: e.target.value as Prefs['defRange'] })} style={{ width: 180 }}>
            <option value="15m">Last 15 minutes</option>
            <option value="1h">Last hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
          </select>,
        )}
        {row(
          <label htmlFor="s-ret" style={{ fontWeight: 500 }}>Data retention</label>,
          'Older request records are deleted from the local database. Longer retention uses more disk space.',
          <select id="s-ret" className="sel" value={retention ?? status?.retention ?? '14d'} onChange={e => saveRetention(e.target.value)} style={{ width: 180 }}>
            <option value="24h">24 hours</option>
            <option value="7d">7 days</option>
            <option value="14d">14 days</option>
            <option value="30d">30 days</option>
          </select>,
          saved ? <span className={saved === 'Saved' ? 'okmsg' : 'badmsg'}>{saved}</span> : null,
        )}
        {row(
          <span style={{ fontWeight: 500 }}>Theme</span>,
          'System follows your operating system setting.',
          <div className="seg" role="group" aria-label="Theme">
            {(['dark', 'light', 'system'] as const).map(k => (
              <button key={k} className={prefs.theme === k ? 'on' : ''} aria-pressed={prefs.theme === k} onClick={() => setPrefs({ theme: k })}>
                {k[0]!.toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>,
        )}
        {row(
          <span style={{ fontWeight: 500 }}>Accent color</span>,
          'Used for highlights, charts and the logo.',
          <div className="seg" role="group" aria-label="Accent color">
            {(['violet', 'blue'] as const).map(k => (
              <button key={k} className={prefs.accent === k ? 'on' : ''} aria-pressed={prefs.accent === k} onClick={() => setPrefs({ accent: k })}>
                <span className="dot" style={{ background: k === 'violet' ? '#8B7CF6' : '#5B8CFF' }} />
                {k[0]!.toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>,
        )}
        {row(
          <label htmlFor="s-tz" style={{ fontWeight: 500 }}>Time zone</label>,
          'Used for timestamps, chart axes and custom ranges.',
          <select id="s-tz" className="sel" value={prefs.tz} onChange={e => setPrefs({ tz: e.target.value })} style={{ width: 180 }}>
            {tzs.map(t => <option key={t} value={t}>{t}</option>)}
          </select>,
        )}
      </section>
      <span className="lbl" style={{ paddingLeft: 2 }}>Traffiq {status?.version ?? ''}</span>
    </div>
  );
}
