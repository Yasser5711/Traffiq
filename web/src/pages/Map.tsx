import type { GeoStats, GeoStatus } from '../../../shared/types';
import { qs, useQuery } from '../lib/api';
import { RANGE_LABEL, scopeParams, type Scope } from '../lib/ctx';
import { flag, fmtInt } from '../lib/format';
import { WorldMap } from '../components/WorldMap';

interface Props {
  scope: Scope;
  geoStatus: GeoStatus | undefined;
  onCountry: (code: string) => void;
}

export function MapPage({ scope, geoStatus, onCountry }: Props) {
  const { data, loading } = useQuery<GeoStats>(`/geo${qs(scopeParams(scope))}`, 'geo|' + scope.scopeKey);
  const located = data ? data.total - data.unknown - data.pending : 0;
  const pct = data && data.total ? (located / data.total) * 100 : 0;
  const topCountries = data?.countries.slice(0, 10) ?? [];
  const topCities = data?.points.slice(0, 10) ?? [];
  const cMax = topCountries[0]?.count || 1;
  const ciMax = topCities[0]?.count || 1;

  const kpis = [
    { label: 'Located requests', value: data ? fmtInt(located) : '', sub: data ? `${pct.toFixed(1)}% of ${fmtInt(data.total)}` : '' },
    { label: 'Countries', value: data ? fmtInt(data.countries.length) : '', sub: data ? `${fmtInt(data.points.length)} cities` : '' },
    { label: 'Top country', value: data?.countries[0] ? `${flag(data.countries[0].country)} ${data.countries[0].name}` : data ? '—' : '', sub: data?.countries[0] ? `${fmtInt(data.countries[0].count)} requests` : '' },
    { label: 'Unknown location', value: data ? fmtInt(data.unknown + data.pending) : '', sub: 'Private or proxy addresses' },
  ];

  return (
    <>
      {geoStatus && !geoStatus.loaded && (
        <div className={'banner ' + (geoStatus.error && !geoStatus.downloading ? 'bad' : 'warn')} role="status" style={{ borderRadius: 10, border: '1px solid var(--border)' }}>
          <span style={{ flex: 1 }}>
            {!geoStatus.enabled
              ? 'Geolocation is turned off (GEOIP=false).'
              : geoStatus.downloading
                ? 'Downloading the GeoIP database (about 60 MB). The map fills in automatically once it is ready.'
                : geoStatus.error
                  ? `GeoIP database unavailable: ${geoStatus.error}`
                  : 'Loading the GeoIP database…'}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <section key={k.label} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 96 }}>
            <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 500 }}>{k.label}</span>
            {loading || !data ? (
              <span className="skel" style={{ height: 26, width: '55%' }} />
            ) : (
              <>
                <span className="num ell" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{k.value}</span>
                <span className="lbl num">{k.sub}</span>
              </>
            )}
          </section>
        ))}
      </div>

      <section className="card" aria-label="Request origins" style={{ padding: '16px 16px 10px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Where requests come from</h2>
            <div className="lbl" style={{ marginTop: 2 }}>{RANGE_LABEL[scope.rangeKey]} · bubble size = requests · red = 25%+ errors · click to filter</div>
          </div>
        </div>
        <div style={{ position: 'relative', opacity: loading ? 0.3 : 1, transition: 'opacity .2s' }}>
          <WorldMap points={data?.points ?? []} onPick={p => onCountry(p.country)} />
        </div>
        <div className="lbl" style={{ fontSize: 11, textAlign: 'right', marginTop: 4 }}>
          <a href="https://db-ip.com" target="_blank" rel="noreferrer">IP Geolocation by DB-IP</a>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 12 }}>
        <ListCard title="Top countries" empty={!loading && !topCountries.length}>
          {topCountries.map(c => (
            <button key={c.country} className="irow" onClick={() => onCountry(c.country)} title={`Show requests from ${c.name}`}>
              <span style={{ fontSize: 16, width: 22, textAlign: 'center' }} aria-hidden="true">{flag(c.country)}</span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="ell" style={{ fontSize: 12.5 }}>{c.name}</span>
                  <span className="mono" style={{ fontSize: 12.5 }}>{fmtInt(c.count)}</span>
                </div>
                <div className="bar"><span style={{ width: (c.count / cMax) * 100 + '%' }} /></div>
              </div>
            </button>
          ))}
        </ListCard>
        <ListCard title="Top cities" empty={!loading && !topCities.length}>
          {topCities.map(c => (
            <button key={c.country + c.city} className="irow" onClick={() => onCountry(c.country)}>
              <span style={{ fontSize: 16, width: 22, textAlign: 'center' }} aria-hidden="true">{flag(c.country)}</span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="ell" style={{ fontSize: 12.5 }}>{c.city || 'Unknown city'}</span>
                  <span className="mono" style={{ fontSize: 12.5 }}>{fmtInt(c.count)}</span>
                </div>
                <div className="bar"><span style={{ width: (c.count / ciMax) * 100 + '%' }} /></div>
              </div>
            </button>
          ))}
        </ListCard>
      </div>

      {data && data.total > 0 && (data.unknown + data.pending) / data.total > 0.5 && (
        <div className="card lbl" style={{ padding: '12px 16px', lineHeight: 1.6 }}>
          Most requests have no location. If your apps sit behind Cloudflare or a tunnel, Traefik only sees the proxy’s
          private address. Keep the <span className="mono">Cf-Connecting-Ip</span> and <span className="mono">X-Forwarded-For</span> headers
          in Traefik’s access log (see DEPLOY.md) so Traffiq can locate the real visitors.
        </div>
      )}
    </>
  );
}

function ListCard({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) {
  return (
    <section className="card" style={{ padding: '14px 8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 6px' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{title}</h3>
        <span className="lbl">Requests</span>
      </div>
      {children}
      {empty && <div className="lbl" style={{ padding: '18px 8px' }}>No located requests in this range.</div>}
    </section>
  );
}
