import { useEffect, useState } from 'react';

export type RangeKey = '15m' | '1h' | '24h' | '7d';
export type ThemePref = 'dark' | 'light' | 'system';

export interface Prefs {
  interval: number; // seconds
  defRange: RangeKey;
  theme: ThemePref;
  tz: string;
  accent: 'violet' | 'blue';
}

const KEY = 'traffiq:prefs';

function browserTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const DEFAULTS: Prefs = { interval: 5, defRange: '7d', theme: 'dark', tz: browserTz(), accent: 'violet' };
// Bump when a default changes so previously saved values for it are dropped once.
const VERSION = 2;

export function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if ((saved.v ?? 1) < 2) delete saved.defRange; // v2: default range became 7d
    delete saved.v;
    return { ...DEFAULTS, ...saved };
  } catch {
    return DEFAULTS;
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...prefs, v: VERSION }));
    } catch {
      /* storage unavailable: preferences just won't persist */
    }
  }, [prefs]);
  const update = (p: Partial<Prefs>) => setPrefs(cur => ({ ...cur, ...p }));
  return [prefs, update] as const;
}

/** Resolves the theme preference, following the OS when set to "system". */
export function useDark(pref: ThemePref) {
  const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [sysDark, setSysDark] = useState(mq?.matches ?? true);
  useEffect(() => {
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return pref === 'system' ? sysDark : pref === 'dark';
}

export const ACCENTS = {
  violet: { a: '#8B7CF6', strong: '#6E56CF', lt: '#5F49C4' },
  blue: { a: '#5B8CFF', strong: '#2F6FEB', lt: '#1F5FD6' },
};
