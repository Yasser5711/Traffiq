// Runtime configuration, read once from the environment.

const env = process.env;

function int(name: string, fallback: number): number {
  const v = parseInt(env[name] ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
}

const isProd = env.NODE_ENV === 'production';

export const config = {
  isProd,
  // In dev, PORT belongs to Vite (the API sits behind its proxy on 3000).
  port: isProd ? int('PORT', 3000) : int('API_PORT', 3000),
  // Display name of the server in the sidebar.
  serverName: env.SERVER_NAME || 'vps-01',
  // Traefik JSON access log. Dokploy writes it here on the host.
  logPath: env.ACCESS_LOG_PATH || (isProd ? '/etc/dokploy/traefik/dynamic/access.log' : './data/access.log'),
  dbPath: env.DB_PATH || (isProd ? '/data/trafficlens.db' : './data/trafficlens.db'),
  // On first start, only import this many trailing bytes of an existing log.
  backfillBytes: int('BACKFILL_BYTES', 64 * 1024 * 1024),
  pollMs: int('POLL_MS', 1000),
  // Optional: protect the dashboard with a password.
  password: env.AUTH_PASSWORD || '',
  sessionSecret: env.SESSION_SECRET || env.AUTH_PASSWORD || 'dev-secret',
  // Hosts never recorded (e.g. the dashboard's own domain).
  ignoreHosts: (env.IGNORE_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  staticDir: env.STATIC_DIR || './dist',
  version: '0.1.0',
};

export const RETENTIONS: Record<string, number> = {
  '24h': 24 * 3600e3,
  '7d': 7 * 24 * 3600e3,
  '14d': 14 * 24 * 3600e3,
  '30d': 30 * 24 * 3600e3,
};
