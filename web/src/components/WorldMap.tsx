import { useMemo, useState } from 'react';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { GeoStats } from '../../../shared/types';
import { flag, fmtInt } from '../lib/format';

const W = 960, H = 470;

// Country shapes are static: project them once per page load.
const geometry = (() => {
  const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
  const all = feature(topo, topo.objects.countries);
  const countries = { ...all, features: all.features.filter(f => f.id !== '010') }; // drop Antarctica
  const projection = geoEqualEarth().fitExtent([[4, 4], [W - 4, H - 4]], countries);
  const path = geoPath(projection);
  return {
    projection,
    land: path(countries) ?? '',
    borders: path(mesh(topo, topo.objects.countries, (a, b) => a !== b)) ?? '',
    graticule: path({ type: 'Sphere' }) ?? '',
  };
})();

type Point = GeoStats['points'][number];

export function WorldMap({ points, onPick }: { points: Point[]; onPick: (p: Point) => void }) {
  const [hover, setHover] = useState<number | null>(null);

  const dots = useMemo(() => {
    const max = Math.max(1, ...points.map(p => p.count));
    return points
      .map(p => {
        const xy = geometry.projection([p.lon, p.lat]);
        if (!xy) return null;
        const errRate = p.count ? p.errors / p.count : 0;
        return { p, x: xy[0], y: xy[1], r: 2.5 + 17 * Math.sqrt(p.count / max), bad: errRate >= 0.25 };
      })
      .filter(d => d !== null)
      .sort((a, b) => b.r - a.r); // small dots on top so they stay clickable
  }, [points]);

  const h = hover != null ? dots[hover] : null;

  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of request origins" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <path d={geometry.graticule} fill="var(--panel2)" opacity={0.5} />
        <path d={geometry.land} fill="var(--hover)" />
        <path d={geometry.borders} fill="none" stroke="var(--border2)" strokeWidth={0.5} />
        {dots.map((d, i) => (
          <circle
            key={d.p.country + d.p.city}
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill={d.bad ? 'var(--err)' : 'var(--accent)'}
            fillOpacity={hover === i ? 0.7 : 0.35}
            stroke={d.bad ? 'var(--err)' : 'var(--accent)'}
            strokeWidth={1}
            style={{ cursor: 'pointer', transition: 'fill-opacity .15s' }}
            onMouseEnter={() => setHover(i)}
            onClick={() => onPick(d.p)}
          />
        ))}
      </svg>
      {h && (
        <div
          className="tip"
          style={{
            left: `${(h.x / W) * 100}%`,
            top: `${(h.y / H) * 100}%`,
            transform: `translate(${h.x / W < 0.6 ? '14px' : 'calc(-100% - 14px)'}, -50%)`,
            minWidth: 170,
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {flag(h.p.country)} {h.p.city || 'Unknown city'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--muted)' }}>Requests</span>
            <span className="mono">{fmtInt(h.p.count)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--muted)' }}>Errors</span>
            <span className="mono">{fmtInt(h.p.errors)} · {((h.p.errors / h.p.count) * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
