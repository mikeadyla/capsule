'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import topology from 'world-atlas/countries-110m.json';
import { displayName } from '@/lib/gazetteer';

type Country = Feature<Geometry, { name: string }>;

const WORLD: Country[] = (
  feature(topology as unknown as Topology, (topology as unknown as Topology).objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>
).features.filter((f) => f.properties.name !== 'Antarctica');

/** Five flat steps from a pale tint to Flordanis plum; grey for countries no headline names. */
export const STEPS = ['#F2E4EA', '#DDB9C8', '#BF8AA1', '#93587A', '#5C3044'];
export const NONE = '#E9EDF1';

export function fillFor(count: number, max: number) {
  if (!count || !max) return NONE;
  const t = Math.pow(count / max, 0.6);
  return STEPS[Math.min(STEPS.length - 1, Math.floor(t * STEPS.length))];
}

const Lands = memo(function Lands({ shapes, counts, max, selected, hovered, onSelect, onHover }: {
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
        const on = name === selected;
        const hot = name === hovered && count > 0;
        return (
          <path
            key={name}
            d={d}
            fill={fillFor(count, max)}
            stroke={on ? '#14283C' : hot ? '#5C3044' : '#FFFFFF'}
            strokeWidth={on ? 1.8 : hot ? 1.3 : 0.6}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            className={count > 0 ? 'cursor-pointer' : undefined}
            onPointerEnter={(e) => onHover(name, e)}
            onPointerMove={(e) => onHover(name, e)}
            onPointerLeave={() => onHover(null)}
            onClick={(e) => {
              e.stopPropagation();
              if (count > 0) onSelect(on ? null : name);
            }}
          />
        );
      })}
    </g>
  );
});

export default function CapsuleMap({ counts, selected, onSelect }: {
  counts: Map<string, number>;
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(0, ...counts.values());

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (!size.w || !size.h) return null;
    const projection = geoEqualEarth().fitExtent([[4, 4], [size.w - 4, size.h - 4]], { type: 'FeatureCollection', features: WORLD });
    const path = geoPath(projection);
    return { path, shapes: WORLD.map((f) => ({ name: f.properties.name, d: path(f) ?? '' })) };
  }, [size.w, size.h]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !size.w) return;
    const behaviour = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .translateExtent([[0, 0], [size.w, size.h]])
      .extent([[0, 0], [size.w, size.h]])
      .filter((e) => e.type !== 'wheel' || e.ctrlKey || e.metaKey) // page scrolls; pinch or ctrl+wheel zooms
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
      const k = Math.min(4, 0.6 / Math.max((x1 - x0) / size.w, (y1 - y0) / size.h));
      next = zoomIdentity.translate(size.w / 2 - (k * (x0 + x1)) / 2, size.h / 2 - (k * (y0 + y1)) / 2).scale(Math.max(1, k));
    }
    select(svg).transition().duration(650).call(behaviour.transform, next);
  }, [selected, geo, size.w, size.h]);

  const zoomBy = (factor: number) => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) select(svg).transition().duration(250).call(zoomRef.current.scaleBy, factor);
  };

  const onHover = (name: string | null, e?: React.PointerEvent) => {
    setHovered((prev) => (prev === name ? prev : name));
    const tip = tipRef.current;
    const box = boxRef.current;
    if (tip && box && e) {
      const r = box.getBoundingClientRect();
      tip.style.transform = `translate(${Math.min(e.clientX - r.left + 14, r.width - 190)}px, ${e.clientY - r.top + 14}px)`;
    }
  };

  const count = hovered ? counts.get(hovered) ?? 0 : 0;

  return (
    <div ref={boxRef} className="relative h-full min-h-[300px] w-full overflow-hidden rounded-lg">
      <svg ref={svgRef} width={size.w} height={size.h} role="img" aria-label="Map of countries named in headlines" className="block touch-none select-none" onClick={() => onSelect(null)}>
        {geo && (
          <g transform={t.toString()}>
            <Lands shapes={geo.shapes} counts={counts} max={max} selected={selected} hovered={hovered} onSelect={onSelect} onHover={onHover} />
          </g>
        )}
      </svg>

      <div
        ref={tipRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-10 w-[180px] rounded-lg border bg-white px-3 py-2 text-[13px] shadow-[0_6px_20px_-8px_rgba(20,40,60,0.35)]"
        style={{ opacity: hovered ? 1 : 0 }}
      >
        {hovered && (
          <>
            <div className="font-bold">{displayName(hovered)}</div>
            <div className="text-muted-foreground">{count ? `${count} ${count === 1 ? 'headline' : 'headlines'}` : 'Not named'}</div>
          </>
        )}
      </div>

      <div className="absolute bottom-2 right-2 flex overflow-hidden rounded-lg border bg-white shadow-[0_1px_2px_rgba(20,40,60,0.06)]">
        {[
          { label: 'Zoom in', Icon: Plus, run: () => zoomBy(1.6) },
          { label: 'Zoom out', Icon: Minus, run: () => zoomBy(1 / 1.6) },
          { label: 'Reset map', Icon: RotateCcw, run: () => onSelect(null) },
        ].map(({ label, Icon, run }) => (
          <button key={label} type="button" aria-label={label} title={label} onClick={run} className="flex size-8 items-center justify-center border-l text-muted-foreground first:border-l-0 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            <Icon className="size-4" />
          </button>
        ))}
      </div>
      {!geo && <div className="capsule-skeleton absolute inset-0" />}
    </div>
  );
}
