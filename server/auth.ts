// Optional password protection. Enabled when AUTH_PASSWORD is set.
// The session cookie is an HMAC-signed expiry timestamp: nothing to store server-side.

import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config';

const COOKIE = 'tl_session';
const TTL_MS = 30 * 24 * 3600e3;

function sign(value: string) {
  return createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isAuthed(c: Context) {
  if (!config.password) return true;
  const raw = getCookie(c, COOKIE);
  if (!raw) return false;
  const [exp, sig] = raw.split('.');
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}

export async function requireAuth(c: Context, next: Next) {
  if (isAuthed(c)) return next();
  return c.json({ error: 'unauthorized' }, 401);
}

export function login(c: Context, password: string) {
  if (!config.password || !safeEqual(sign(password), sign(config.password))) return false;
  const exp = String(Date.now() + TTL_MS);
  setCookie(c, COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: c.req.header('x-forwarded-proto') === 'https' || c.req.url.startsWith('https:'),
    path: '/',
    maxAge: TTL_MS / 1000,
  });
  return true;
}

export function logout(c: Context) {
  deleteCookie(c, COOKIE, { path: '/' });
}
