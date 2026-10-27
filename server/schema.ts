import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const requests = sqliteTable(
  'requests',
  {
    id: integer('id').primaryKey(),
    ts: integer('ts').notNull(), // epoch ms
    domain: text('domain').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    route: text('route').notNull(), // path with ids collapsed, used for grouping
    status: integer('status').notNull(),
    dur: real('dur').notNull(), // ms
    size: integer('size').notNull(),
    ip: text('ip').notNull(),
    ua: text('ua').notNull().default(''),
    proto: text('proto').notNull().default(''),
    scheme: text('scheme').notNull().default(''),
    router: text('router').notNull().default(''),
    service: text('service').notNull().default(''),
    upstream: text('upstream').notNull().default(''),
    entrypoint: text('entrypoint').notNull().default(''),
    overhead: real('overhead').notNull().default(0),
    origin: real('origin').notNull().default(0),
    reqId: text('req_id').notNull().default(''),
  },
  t => [index('ix_requests_ts').on(t.ts), index('ix_requests_domain_ts').on(t.domain, t.ts)],
);

// Per-minute rollup used for charts and KPIs over long ranges.
export const minuteStats = sqliteTable(
  'minute_stats',
  {
    minute: integer('minute').notNull(),
    domain: text('domain').notNull(),
    c2: integer('c2').notNull().default(0),
    c3: integer('c3').notNull().default(0),
    c4: integer('c4').notNull().default(0),
    c5: integer('c5').notNull().default(0),
    durSum: real('dur_sum').notNull().default(0),
  },
  t => [primaryKey({ columns: [t.minute, t.domain] })],
);

export const domains = sqliteTable('domains', {
  domain: text('domain').primaryKey(),
  service: text('service').notNull().default(''),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// Where the collector stopped reading the access log.
export const logCursor = sqliteTable('log_cursor', {
  path: text('path').primaryKey(),
  ino: text('ino').notNull(),
  offset: integer('offset').notNull(),
});
