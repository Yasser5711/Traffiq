import { useEffect, useMemo, useRef, useState } from 'react';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import countries from 'i18n-iso-countries';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { GeoStats } from '../../../shared/types';
import { flag, fmtInt } from '../lib/format';
import { Icon } from './Icon';

const W = 960, H = 470;
const MAX_ZOOM = 12;
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// Country shapes are static: project them once per page load.
const geometry = (() => {
  const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
  const all = feature(topo, topo.objects.countries);
  const features = all.features.filter(f => f.id !== '010'); // drop Antarctica
  const projection = geoEqualEarth().fitExtent([[4, 4], [W - 4, H - 4]], { ...all, features });
  const path = geoPath(projection);
  return {
    projection,
    shapes: features.map(f => ({
      code: (f.id != null && countries.numericToAlpha2(String(f.id))) || '',
      name: String((f.properties as { name?: string })?.name ?? ''),
      d: path(f) ?? '',
    })),
    borders: path(mesh(topo, topo.objects.countries, (a, b) => a !== b)) ?? '',
    sphere: path({ type: 'Sphere' }) ?? '',
  };
})();

type Point = GeoStats['points'][number];
type Country = GeoStats['countries'][number];
type Hover = { kind: 'point'; i: number } | { kind: 'country'; code: string; x: number; y: number } | null;

interface Props {
  points: Point[];
  countries: Country[];
  onPick: (country: string) => void;
}

export function WorldMap({ points, countries: byCountry, onPick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<Hover>(null);
  const [hint, setHint] = useState(false);

  // Cooperative gestures (as on Google Maps): plain scrolling scrolls the page; Ctrl/⌘ +
  // scroll, trackpad pinch, two-finger touch, drag and double-click move the map.
  useEffect(() => {
    const svg = svgRef.current!;
    let hintTimer: ReturnType<typeof setTimeout>;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .translateExtent([[0, 0], [W, H]])
      .filter(e => {
        if (e.type === 'wheel') return e.ctrlKey || e.metaKey;
        if (e.type === 'touchstart') return e.touches.length > 1;
        return !e.button;
      })
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => setT(e.transform));
    zoomRef.current = z;
    const sel = select(svg).call(z);
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      setHint(true);
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => setHint(false), 1400);
    };
    svg.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      sel.on('.zoom', null);
      svg.removeEventListener('wheel', onWheel);
      clearTimeout(hintTimer);
    };
  }, []);

  const zoomBy = (k: number) => zoomRef.current && select(svgRef.current!).transition().duration(250).call(zoomRef.current.scaleBy, k);
  const reset = () => zoomRef.current && select(svgRef.current!).transition().duration(400).call(zoomRef.current.transform, zoomIdentity);

  // Choropleth: log scale so one huge country doesn't wash out the rest.
  const fills = useMemo(() => {
    const max = Math.max(1, ...byCountry.map(c => c.count));
    const m = new Map<string, number>();
    for (const c of byCountry) m.set(c.country, Math.log1p(c.count) / Math.log1p(max));
    return m;
  }, [byCountry]);
  const countryInfo = useMemo(() => new Map(byCountry.map(c => [c.country, c])), [byCountry]);

  const dots = useMemo(() => {
    const max = Math.max(1, ...points.map(p => p.count));
    return points
      .map(p => {
        const xy = geometry.projection([p.lon, p.lat]);
        if (!xy) return null;
        return { p, x: xy[0], y: xy[1], r: 2.5 + 15 * Math.sqrt(p.count / max), bad: p.count ? p.errors / p.count >= 0.25 : false };
      })
      .filter(d => d !== null)
      .sort((a, b) => b.r - a.r); // small dots on top so they stay clickable
  }, [points]);

  // Bubbles keep their on-screen size while zooming, growing only slightly.
  const rScale = 1 / Math.pow(t.k, 0.75);

  let tip: { x: number; y: number; title: string; rows: [string, string][] } | null = null;
  if (hover?.kind === 'point') {
    const d = dots[hover.i];
    if (d) tip = {
      x: t.applyX(d.x), y: t.applyY(d.y),
      title: `${flag(d.p.country)} ${d.p.city || 'Unknown city'}`,
      rows: [['Requests', fmtInt(d.p.count)], ['Errors', `${fmtInt(d.p.errors)} · ${((d.p.errors / d.p.count) * 100).toFixed(1)}%`]],
    };
  } else if (hover?.kind === 'country') {
    const c = countryInfo.get(hover.code);
    const shape = geometry.shapes.find(s => s.code === hover.code);
    tip = {
      x: hover.x, y: hover.y,
      title: `${flag(hover.code)} ${c?.name ?? shape?.name ?? hover.code}`,
      rows: c ? [['Requests', fmtInt(c.count)], ['Errors', `${fmtInt(c.errors)} · ${((c.errors / c.count) * 100).toFixed(1)}%`]] : [['Requests', '0']],
    };
  }

  const localXY = (e: React.MouseEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Map of request origins"
        style={{ width: '100%', height: 'auto', display: 'block', cursor: t.k > 1 ? 'grab' : 'default', touchAction: 'pan-y' }}
      >
        <path d={geometry.sphere} fill="var(--panel2)" opacity={0.5} />
        <g transform={t.toString()}>
          {geometry.shapes.map((s, i) => {
            const v = s.code ? fills.get(s.code) : undefined;
            return (
              <path
                key={i}
                d={s.d}
                fill={v == null ? 'var(--hover)' : `color-mix(in srgb, var(--accent) ${Math.round(12 + v * 48)}%, var(--hover))`}
                style={{ cursor: v != null ? 'pointer' : undefined }}
                onMouseMove={v != null ? e => setHover({ kind: 'country', code: s.code, ...localXY(e) }) : undefined}
                onMouseLeave={() => setHover(null)}
                onClick={v != null ? () => onPick(s.code) : undefined}
              />
            );
          })}
          <path d={geometry.borders} fill="none" stroke="var(--border2)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          {dots.map((d, i) => (
            <circle
              key={d.p.country + d.p.city}
              cx={d.x}
              cy={d.y}
              r={d.r * rScale}
              fill={d.bad ? 'var(--err)' : 'var(--accent-strong)'}
              fillOpacity={hover?.kind === 'point' && hover.i === i ? 0.85 : 0.55}
              stroke={d.bad ? 'var(--err)' : 'var(--accent)'}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover({ kind: 'point', i })}
              onMouseMove={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onPick(d.p.country); }}
            />
          ))}
        </g>
      </svg>

      <div className="mapctl" role="group" aria-label="Map zoom">
        <button className="btn icon" aria-label="Zoom in" onClick={() => zoomBy(2)} disabled={t.k >= MAX_ZOOM}><Icon name="plus" /></button>
        <button className="btn icon" aria-label="Zoom out" onClick={() => zoomBy(0.5)} disabled={t.k <= 1}><Icon name="minus" /></button>
        <button className="btn icon" aria-label="Reset zoom" onClick={reset} disabled={t.k === 1 && t.x === 0 && t.y === 0}><Icon name="expand" /></button>
      </div>

      {hint && <div className="maphint" role="status">Use {IS_MAC ? '⌘' : 'Ctrl'} + scroll to zoom the map</div>}

      {tip && (
        <div
          className="tip"
          style={{
            left: `${(tip.x / W) * 100}%`,
            top: `${(tip.y / H) * 100}%`,
            transform: `translate(${tip.x / W < 0.6 ? '14px' : 'calc(-100% - 14px)'}, -50%)`,
            minWidth: 170,
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>{tip.title}</div>
          {tip.rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: 'var(--muted)' }}>{k}</span>
              <span className="mono">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
