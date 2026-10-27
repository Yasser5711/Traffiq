import type { RangeKey } from './prefs';

export type Page = 'overview' | 'requests' | 'map' | 'domains' | 'settings';

export interface Filters {
  domain: string;
  method: string;
  status: string;
  path: string;
  ip: string;
  minDur: string;
  country: string; // ISO code, '-' = unknown location, '' = any
}

export const EMPTY_FILTERS: Filters = { domain: 'all', method: 'all', status: 'all', path: '', ip: '', minDur: '', country: '' };

export type SortKey = 'ts' | 'domain' | 'status' | 'dur' | 'ip' | 'size';
export interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

/** Everything a page needs to know about the current dashboard scope. */
export interface Scope {
  tz: string;
  rangeKey: RangeKey | 'custom';
  start: number; // charts/KPIs
  end: number;
  tableStart: number; // request log follows "now" while live
  tableEnd: number;
  domains: string[]; // selected domains, empty = all
  scopeKey: string; // changes when the user changes range/domains (not on refresh)
  longRange: boolean;
}

export const DUR_MIN: Record<RangeKey, number> = { '15m': 15, '1h': 60, '24h': 1440, '7d': 10080 };
export const RANGE_LABEL: Record<RangeKey | 'custom', string> = { '15m': 'Last 15 minutes', '1h': 'Last hour', '24h': 'Last 24 hours', '7d': 'Last 7 days', custom: 'Custom range' };
export const PREV_LABEL: Record<RangeKey | 'custom', string> = { '15m': 'prev. 15 min', '1h': 'prev. hour', '24h': 'prev. 24 h', '7d': 'prev. 7 days', custom: 'prev. period' };

export function scopeParams(s: Scope) {
  return { start: s.start, end: s.end, domains: s.domains.join(',') };
}
