import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    credentials: 'same-origin',
  });
  if (res.status === 401) window.dispatchEvent(new Event('tl:unauthorized'));
  if (!res.ok) throw new ApiError(res.status, (await res.text().catch(() => '')) || res.statusText);
  return res.json() as Promise<T>;
}

export function qs(params: Record<string, string | number | undefined | null | false>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) u.set(k, String(v));
  const s = u.toString();
  return s ? '?' + s : '';
}

/**
 * Fetches `path` whenever it changes. Keeps the previous data while refetching;
 * `loading` is only true when the request "key" (path minus volatile params) changed,
 * so background refreshes don't flash skeletons.
 */
export function useQuery<T>(path: string | null, key: string = path ?? '') {
  const [state, setState] = useState<{ data: T | null; key: string | null; error: Error | null }>({ data: null, key: null, error: null });
  const [fetching, setFetching] = useState(false);
  const seq = useRef(0);

  const run = useCallback(() => {
    if (!path) return;
    const id = ++seq.current;
    setFetching(true);
    api<T>(path)
      .then(data => id === seq.current && setState({ data, key, error: null }))
      .catch(error => id === seq.current && setState(s => ({ ...s, key, error })))
      .finally(() => id === seq.current && setFetching(false));
  }, [path, key]);

  useEffect(run, [run]);

  return { data: state.data, error: state.error, loading: state.key !== key, fetching, reload: run };
}
