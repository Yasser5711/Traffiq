// Shapes exchanged between the API (server/) and the dashboard (web/).

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | string;

export interface RequestRow {
  id: number;
  ts: number; // epoch ms
  domain: string;
  method: Method;
  path: string;
  status: number;
  dur: number; // ms
  size: number; // bytes
  ip: string;
}

export interface RequestDetail extends RequestRow {
  route: string;
  proto: string;
  scheme: string;
  ua: string;
  router: string;
  service: string;
  upstream: string;
  entrypoint: string;
  overhead: number;
  origin: number;
  reqId: string;
}

export interface Totals {
  total: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
  avg: number; // ms
}

export interface Series {
  bucketMs: number;
  start: number; // start of first bucket
  // one entry per bucket: counts by status class + mean duration
  c2: number[];
  c3: number[];
  c4: number[];
  c5: number[];
}

export interface EndpointStat {
  domain: string;
  method: string;
  route: string;
  count: number;
  code?: number; // most frequent error code
  avg?: number;
}

export interface Overview {
  range: { start: number; end: number };
  totals: Totals;
  prev: Totals;
  series: Series;
  topDomains: { domain: string; count: number }[];
  failing: EndpointStat[];
  slowest: EndpointStat[];
  topIps: { ip: string; count: number; errors: number }[];
}

export interface DomainStat {
  domain: string;
  service: string;
  totals: Totals;
  prev: Totals;
  spark: number[];
}

export interface RequestPage {
  rows: RequestRow[];
  total: number;
  groups: { all: number; '2xx': number; '3xx': number; '4xx': number; '5xx': number };
  newest: number; // ts of newest row matching (for "fresh" highlighting)
}

export type ConnState = 'connected' | 'reconnecting' | 'disconnected';

export interface Status {
  serverName: string;
  logPath: string;
  state: ConnState;
  lastEvent: number | null;
  lastError: string | null;
  linesTotal: number;
  retention: string;
  authEnabled: boolean;
  version: string;
}
