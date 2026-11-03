'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { geoArea, geoCentroid, geoEqualEarth, geoGraticule10, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { interpolateRgb } from 'd3-interpolate';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import topology from 'world-atlas/countries-110m.json';
import { displayName } from '@/lib/gazetteer';
import type { CountryCount } from '@/lib/types';

type Country = Feature<Geometry, { name: string }>;

const WORLD = (feature(topology as unknown as Topology, (topology as unknown as Topology).objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>).features.filter(
  (f) => f.properties.name !== 'Antarctica',
);

const SPHERE: GeoPermissibleObjects = { type: 'Sphere' };
const GRATICULE = geoGraticule10();

const LAND_EMPTY = '#EFE6DC';
const STOPS = ['#F2D6CA', '#D9A894', '#B06F80', '#7E4560', '#4F2539'];

/** Fill for a headline count: pale blush to deep plum, easing so small counts still show. */
function fillFor(count: number, max: number): string {
  if (count <= 0 || max <= 0) return LAND_EMPTY;
  const t = Math.min(1, Math.pow(count / max, 0.6)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(t));
  return interpolateRgb(STOPS[i], STOPS[i + 1])(t - i);
}

/** The centre of a country's largest piece (France's centroid should not sit in the Atlantic). */
function anchor(f: Country): [number, number] {
  if (f.geometry.type !== 'MultiPolygon') return geoCentroid(f);
  const parts = (f.geometry as MultiPolygon).coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }) as Polygon);
  const biggest = parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  return geoCentroid(biggest);
}

interface Props {
  countries: CountryCount[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  /** The latest headline naming a country, for the hover card. */
  latestFor: (name: string) => string | undefined;
}

const Lands = memo(function Lands({
  shapes, counts, max, selected, hovered, onSelect, onHover,
}: {
  shapes: { name: string; d: string }[];
  counts: Map<string, number>;
  max: number;
  selected: string | null;
  hovered: string | null;
  onSelect: (name: string | null) => void;
  onHover: (name: string | null, e?: React.PointerEvent) => void;
}) {
  return (
    <g>
      {shapes.map(({ name, d }) => {
        const count = counts.get(name) ?? 0;
        const active = name === selected;
        const hot = name === hovered;
        return (
          <path
            key={name}
            d={d}
            fill={fillFor(count, max)}
            stroke={active ? '#2D1621' : hot ? '#5C3044' : '#FFFFFF'}
            strokeWidth={active ? 1.6 : hot ? 1.2 : 0.6}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            className={count > 0 ? 'cursor-pointer' : undefined}
            style={{ transition: 'fill 400ms ease, stroke-width 120ms ease' }}
            onPointerEnter={(e) => onHover(name, e)}
            onPointerMove={(e) => onHover(name, e)}
            onPointerLeave={() => onHover(null)}
            onClick={(e) => {
              e.stopPropagation();
              if (count > 0) onSelect(active ? null : name);
            }}
          />
        );
      })}
    </g>
  );
});

export default function CapsuleMap({ countries, selected, onSelect, latestFor }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const counts = useMemo(() => new Map(countries.map((c) => [c.name, c.count])), [countries]);
  const max = countries[0]?.count ?? 0;

  const geo = useMemo(() => {
    if (!size.w || !size.h) return null;
    const pad = Math.min(28, size.w * 0.03);
    const projection = geoEqualEarth().fitExtent(
      [[pad, pad + 8], [size.w - pad, size.h - pad]],
      SPHERE,
    );
    const path = geoPath(projection);
    const shapes = WORLD.map((f) => ({ name: f.properties.name, d: path(f) ?? '' }));
    const centres = new Map<string, [number, number]>();
    for (const f of WORLD) {
      const p = projection(anchor(f));
      if (p) centres.set(f.properties.name, p);
    }
    return { path, shapes, centres, sphere: path(SPHERE) ?? '', graticule: path(GRATICULE) ?? '' };
  }, [size.w, size.h]);

  // Pan and zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !size.w) return;
    const behaviour = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 9])
      .translateExtent([[0, 0], [size.w, size.h]])
      .extent([[0, 0], [size.w, size.h]])
      .on('zoom', (e) => setT(e.transform));
    zoomRef.current = behaviour;
    select(svg).call(behaviour).on('dblclick.zoom', null);
    return () => {
      select(svg).on('.zoom', null);
    };
  }, [size.w, size.h]);

  // Fly to the selected country, or back out.
  useEffect(() => {
    const svg = svgRef.current;
    const behaviour = zoomRef.current;
    if (!svg || !behaviour || !geo) return;
    const target = selected ? WORLD.find((f) => f.properties.name === selected) : null;
    let next = zoomIdentity;
    if (target) {
      const [[x0, y0], [x1, y1]] = geo.path.bounds(target);
      const k = Math.min(4.5, 0.7 / Math.max((x1 - x0) / size.w, (y1 - y0) / size.h));
      next = zoomIdentity.translate(size.w / 2 - (k * (x0 + x1)) / 2, size.h / 2 - (k * (y0 + y1)) / 2).scale(k);
    }
    select(svg).transition().duration(750).call(behaviour.transform, next);
  }, [selected, geo, size.w, size.h]);

  const zoomBy = (factor: number) => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) select(svg).transition().duration(300).call(zoomRef.current.scaleBy, factor);
  };

  const onHover = (name: string | null, e?: React.PointerEvent) => {
    setHovered((prev) => (prev === name ? prev : name));
    const tip = tipRef.current;
    const box = boxRef.current;
    if (tip && box && e) {
      const r = box.getBoundingClientRect();
      const x = Math.min(e.clientX - r.left + 16, r.width - 280);
      tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, e.clientY - r.top + 16)}px)`;
    }
  };

  const hotspots = useMemo(() => countries.slice(0, 8), [countries]);

  // Name the biggest hotspots, skipping any label that would sit on one already placed.
  const labelled = useMemo(() => {
    const names = new Set<string>();
    if (!geo) return names;
    const placed: [number, number][] = [];
    for (const c of hotspots.slice(0, 6)) {
      const at = geo.centres.get(c.name);
      if (!at) continue;
      const x = t.applyX(at[0]);
      const y = t.applyY(at[1]);
      if (placed.some(([px, py]) => Math.abs(px - x) < 84 && Math.abs(py - y) < 22)) continue;
      placed.push([x, y]);
      names.add(c.name);
    }
    return names;
  }, [geo, hotspots, t]);
  const hoveredCount = hovered ? counts.get(hovered) ?? 0 : 0;
  const latest = hovered ? latestFor(hovered) : undefined;

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden" style={{ background: 'radial-gradient(120% 90% at 50% 40%, #FFFBF6 0%, #F7EFE6 100%)' }}>
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        role="img"
        aria-label="World map shaded by the number of headlines naming each country"
        className="block touch-none select-none"
        onClick={() => onSelect(null)}
      >
        {geo && (
          <>
            <g transform={t.toString()}>
              <path d={geo.sphere} fill="#FFFDFA" stroke="rgba(92,48,68,0.12)" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 18px 36px rgba(92,48,68,0.10))' }} />
              <path d={geo.graticule} fill="none" stroke="rgba(92,48,68,0.06)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
              <Lands shapes={geo.shapes} counts={counts} max={max} selected={selected} hovered={hovered} onSelect={onSelect} onHover={onHover} />
            </g>

            {/* Hotspots keep their size on screen while the map zooms beneath them. */}
            <g pointerEvents="none">
              {hotspots.map((c, i) => {
                const at = geo.centres.get(c.name);
                if (!at) return null;
                const x = t.applyX(at[0]);
                const y = t.applyY(at[1]);
                const r = 5 + Math.sqrt(c.count / max) * 11;
                return (
                  <g key={c.name} transform={`translate(${x},${y})`}>
                    <circle r={r} className="capsule-pulse" fill="none" stroke="#E39A2D" strokeWidth={1.8} />
                    <circle r={r} fill="#EBA43A" fillOpacity={0.95} stroke="#FFFFFF" strokeWidth={1.6} />
                    {labelled.has(c.name) && (
                      <text
                        y={-r - 7}
                        textAnchor="middle"
                        fontSize={12}
                        fontWeight={600}
                        fill="#2D1621"
                        stroke="#FFFBF6"
                        strokeWidth={3.5}
                        paintOrder="stroke"
                        style={{ fontFamily: 'var(--font-heading)' }}
                      >
                        {displayName(c.name)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </>
        )}
      </svg>

      {/* Hover card */}
      <div
        ref={tipRef}
        className="pointer-events-none absolute left-0 top-0 z-20 w-[264px] rounded-2xl border border-rose/30 bg-white/95 p-3.5 shadow-[0_18px_40px_-16px_rgba(92,48,68,0.45)] backdrop-blur transition-opacity duration-150"
        style={{ opacity: hovered ? 1 : 0 }}
        aria-hidden="true"
      >
        {hovered && (
          <>
            <div className="font-heading text-[17px] leading-tight text-charcoal">{displayName(hovered)}</div>
            <div className="mt-0.5 text-xs font-semibold" style={{ color: hoveredCount ? '#5C3044' : '#8B8580' }}>
              {hoveredCount ? `${hoveredCount} ${hoveredCount === 1 ? 'headline' : 'headlines'}` : 'No headlines in this period'}
            </div>
            {latest && <div className="mt-2 line-clamp-3 border-t border-rose/20 pt-2 text-[12.5px] leading-snug text-[#6B6560]">{latest}</div>}
          </>
        )}
      </div>

      {/* Zoom */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col overflow-hidden rounded-xl border border-rose/30 bg-white/90 shadow-sm backdrop-blur">
        {[
          { label: 'Zoom in', icon: Plus, run: () => zoomBy(1.6) },
          { label: 'Zoom out', icon: Minus, run: () => zoomBy(1 / 1.6) },
          { label: 'Reset view', icon: Maximize2, run: () => onSelect(null) },
        ].map(({ label, icon: Icon, run }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onClick={run}
            className="flex size-9 items-center justify-center text-[#6B6560] transition-colors hover:bg-cream-dark hover:text-plum focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-plum"
          >
            <Icon size={16} strokeWidth={1.8} />
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 w-[210px] rounded-2xl border border-rose/30 bg-white/90 p-3.5 shadow-sm backdrop-blur">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8B8580]">Headlines naming a country</div>
        <div className="mt-2 h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${STOPS.join(',')})` }} />
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-[#6B6560]">
          <span>1</span>
          <span>{max || '–'}</span>
        </div>
      </div>
    </div>
  );
}
