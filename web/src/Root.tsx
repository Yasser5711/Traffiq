import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { ACCENTS, loadPrefs, useDark } from './lib/prefs';
import { App } from './App';
import { Login } from './pages/Login';

type Session = { authEnabled: boolean; authed: boolean };

export function Root() {
  const [session, setSession] = useState<Session | null>(null);

  const check = () => api<Session>('/session').then(setSession).catch(() => setSession({ authEnabled: false, authed: true }));
  useEffect(() => {
    check();
    const on = () => setSession(s => (s ? { ...s, authed: false } : s));
    window.addEventListener('tl:unauthorized', on);
    return () => window.removeEventListener('tl:unauthorized', on);
  }, []);

  if (!session) return null;
  if (!session.authed) return <LoginShell onDone={check} />;
  return <App authEnabled={session.authEnabled} onLogout={() => api('/logout', { method: 'POST' }).then(check)} />;
}

function LoginShell({ onDone }: { onDone: () => void }) {
  const prefs = loadPrefs();
  const dark = useDark(prefs.theme);
  const ac = ACCENTS[prefs.accent];
  return (
    <div className={'tl' + (dark ? '' : ' light')} style={{ '--accent': dark ? ac.a : ac.strong, '--accent-strong': ac.strong, '--accent-text': dark ? ac.a : ac.lt } as React.CSSProperties}>
      <Login onDone={onDone} />
    </div>
  );
}
