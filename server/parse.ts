// Turns one line of Traefik's JSON access log into a request record.
// Field reference: https://doc.traefik.io/traefik/observability/access-logs/

export interface ParsedRequest {
  ts: number;
  domain: string;
  method: string;
  path: string;
  route: string;
  status: number;
  dur: number;
  size: number;
  ip: string; // visitor address (from proxy headers when available)
  peer: string; // address Traefik saw the connection from
  ua: string;
  proto: string;
  scheme: string;
  router: string;
  service: string;
  upstream: string;
  entrypoint: string;
  overhead: number;
  origin: number;
  reqId: string;
}

const NS_PER_MS = 1e6;

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(str(v));
  return Number.isFinite(n) ? n : 0;
}

// Collapse ids so "/api/users/123" and "/api/users/456" group together.
export function routeOf(path: string): string {
  const p = path.split('?')[0] || '/';
  return p
    .split('/')
    .map(seg => {
      if (/^\d+$/.test(seg)) return ':id';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ':uuid';
      if (seg.length >= 12 && /^[0-9a-f]+$/i.test(seg)) return ':hex';
      return seg.replace(/-[0-9a-f]{6,}(?=\.\w+$)/i, '-:hash');
    })
    .join('/');
}

function hostOnly(h: string): string {
  // Strip port, keep IPv6 literals intact.
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  const i = h.lastIndexOf(':');
  return (i > 0 && h.indexOf(':') === i ? h.slice(0, i) : h).toLowerCase();
}

function upstreamOf(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.Scheme || o.Host) return `${str(o.Scheme) || 'http'}://${str(o.Host)}${str(o.Path)}`;
  }
  return '';
}

const PRIVATE_V4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/;

/** Loopback, private, CGNAT (Tailscale) and link-local addresses. */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  return PRIVATE_V4.test(ip);
}

/** Case-insensitive lookup of a request header kept in the access log ("request_<Name>"). */
function header(o: Record<string, unknown>, name: string): string {
  const want = 'request_' + name.toLowerCase();
  for (const k in o) if (k.length === want.length && k.toLowerCase() === want) return str(o[k]);
  return '';
}

/**
 * The visitor's address. Behind Cloudflare or a tunnel, Traefik's peer is the proxy, so
 * prefer the forwarding headers when Traefik is configured to keep them in the log.
 */
function realIp(o: Record<string, unknown>, peer: string): string {
  const cf = header(o, 'Cf-Connecting-Ip').trim();
  if (cf) return cf;
  const xff = header(o, 'X-Forwarded-For');
  if (xff) {
    const hops = xff.split(',').map(s => s.trim()).filter(Boolean);
    const pub = hops.find(h => !isPrivateIp(h));
    if (pub) return pub;
  }
  const xr = header(o, 'X-Real-Ip').trim();
  if (xr && !isPrivateIp(xr)) return xr;
  return peer;
}

function serviceName(s: string): string {
  // "my-app-service@docker" -> "my-app-service"
  return s.replace(/@[a-z]+$/i, '');
}

export function parseLine(line: string): ParsedRequest | null {
  if (!line || line[0] !== '{') return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  const method = str(o.RequestMethod);
  const status = num(o.DownstreamStatus || o.OriginStatus);
  if (!method || !status) return null;

  const start = str(o.StartUTC) || str(o.time) || str(o.StartLocal);
  const ts = start ? Date.parse(start) : Date.now();
  if (!Number.isFinite(ts)) return null;

  const path = str(o.RequestPath) || '/';
  const host = hostOnly(str(o.RequestHost) || str(o.RequestAddr));
  const service = str(o.ServiceName);
  const peer = str(o.ClientHost) || hostOnly(str(o.ClientAddr));

  return {
    ts,
    domain: host || '(no host)',
    method,
    path,
    route: routeOf(path),
    status,
    dur: num(o.Duration) / NS_PER_MS,
    size: Math.round(num(o.DownstreamContentSize)),
    ip: realIp(o, peer),
    peer,
    ua: header(o, 'User-Agent'),
    proto: str(o.RequestProtocol),
    scheme: str(o.RequestScheme),
    router: str(o.RouterName),
    service: serviceName(service),
    upstream: upstreamOf(o.ServiceURL) || str(o.ServiceAddr),
    entrypoint: str(o.entryPointName),
    overhead: num(o.Overhead) / NS_PER_MS,
    origin: num(o.OriginDuration) / NS_PER_MS,
    reqId: header(o, 'X-Request-Id') || str(o['downstream_X-Request-Id']),
  };
}
