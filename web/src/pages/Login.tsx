import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';

export function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/login', { method: 'POST', body: JSON.stringify({ password }) });
      onDone();
    } catch {
      setError('Incorrect password.');
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img className="logo-mark" src="/logo-mark.png" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Traffiq</span>
            <span className="lbl">Sign in to view traffic</span>
          </div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="lbl">Password</span>
          <input className="inp" type="password" autoFocus autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <span className="badmsg" role="alert">{error}</span>}
        <button className="btn primary" type="submit" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
