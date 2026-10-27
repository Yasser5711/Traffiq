export const fmtInt = (v: number) => Math.round(v).toLocaleString('en-US');

export function fmtCompact(v: number) {
  v = Math.round(v);
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(v);
}

export const fmtDur = (ms: number) => (ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + ' s');

export function fmtSize(b: number) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) {
    const k = b / 1024;
    return (k < 10 ? k.toFixed(1) : Math.round(k)) + ' KB';
  }
  return (b / 1048576).toFixed(1) + ' MB';
}

export const fmtPct = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%';
export const fmtPP = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + ' pp';
export const pctChange = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);

export const durCls = (ms: number) => (ms >= 3000 ? 'dur-crit' : ms >= 1000 ? 'dur-slow' : '');
export const statusCls = (s: number | string) => 'badge st' + String(s)[0];
export const methodCls = (m: string) => 'badge mth m' + m;

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string, key: string, opts: Intl.DateTimeFormatOptions) {
  const k = tz + '|' + key;
  let f = cache.get(k);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, ...opts });
    } catch {
      f = new Intl.DateTimeFormat('en-GB', { hour12: false, ...opts });
    }
    cache.set(k, f);
  }
  return f;
}
export const fmtHMS = (t: number, tz: string) => dtf(tz, 'hms', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(t);
export const fmtHM = (t: number, tz: string) => dtf(tz, 'hm', { hour: '2-digit', minute: '2-digit' }).format(t);
export const fmtDM = (t: number, tz: string) => dtf(tz, 'dm', { day: 'numeric', month: 'short' }).format(t);
export const fmtWD = (t: number, tz: string) => dtf(tz, 'wd', { weekday: 'short', day: 'numeric' }).format(t);
export const fmtYear = (t: number, tz: string) => dtf(tz, 'y', { year: 'numeric' }).format(t);

export function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 2) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 48) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

export function toLocalInput(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const STATUS_TEXT: Record<number, string> = {
  100: 'Continue', 101: 'Switching Protocols', 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 206: 'Partial Content',
  301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 408: 'Request Timeout',
  409: 'Conflict', 410: 'Gone', 413: 'Content Too Large', 422: 'Unprocessable Content', 429: 'Too Many Requests', 499: 'Client Closed Request',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};
