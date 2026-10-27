// The dashboard's view lives in the URL hash ("#/requests?range=24h&status=5xx"), so a
// reload, a bookmark or a shared link reopens exactly the same view.

import { EMPTY_FILTERS, type Filters, type Page, type Sort, type SortKey } from './ctx';
import type { RangeKey } from './prefs';

export interface ViewState {
  page: Page;
  range: RangeKey | 'custom';
  custom: { start: number; end: number } | null;
  domains: string[];
  filters: Filters;
  sort: Sort;
}

const PAGES: Page[] = ['overview', 'requests', 'map', 'domains', 'settings'];
const RANGES = ['15m', '1h', '24h', '7d'];
const SORTS: SortKey[] = ['ts', 'domain', 'status', 'dur', 'ip', 'size'];
const FILTER_KEYS = Object.keys(EMPTY_FILTERS) as (keyof Filters)[];

export function readView(defRange: RangeKey, hash = location.hash): ViewState {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const q = new URLSearchParams(query);
  const page = PAGES.includes(path as Page) ? (path as Page) : 'overview';

  const from = Number(q.get('from')), to = Number(q.get('to'));
  const custom = from > 0 && to > from ? { start: from, end: to } : null;
  const r = q.get('range') ?? '';
  const range: ViewState['range'] = custom ? 'custom' : RANGES.includes(r) ? (r as RangeKey) : defRange;

  const filters = { ...EMPTY_FILTERS };
  for (const k of FILTER_KEYS) {
    const v = q.get(k);
    if (v != null) filters[k] = v;
  }
  const sk = q.get('sort') as SortKey;
  const sort: Sort = SORTS.includes(sk) ? { key: sk, dir: q.get('dir') === 'asc' ? 'asc' : 'desc' } : { key: 'ts', dir: 'desc' };

  return { page, range, custom, domains: (q.get('domains') ?? '').split(',').filter(Boolean), filters, sort };
}

export function viewHash(v: ViewState, defRange: RangeKey): string {
  const q = new URLSearchParams();
  if (v.custom) {
    q.set('from', String(Math.round(v.custom.start)));
    q.set('to', String(Math.round(v.custom.end)));
  } else if (v.range !== defRange) q.set('range', v.range);
  if (v.domains.length) q.set('domains', v.domains.join(','));
  // Filters and sorting only matter on the pages that show the request log.
  if (v.page === 'overview' || v.page === 'requests') {
    for (const k of FILTER_KEYS) if (v.filters[k] !== EMPTY_FILTERS[k]) q.set(k, v.filters[k]);
    if (v.sort.key !== 'ts' || v.sort.dir !== 'desc') {
      q.set('sort', v.sort.key);
      q.set('dir', v.sort.dir);
    }
  }
  const s = q.toString();
  return `#/${v.page}${s ? '?' + s : ''}`;
}
