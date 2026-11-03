import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** A titled white panel, as in the Refugee Data Portal. */
export function Panel({ id, title, label, note, legend, children, className = '' }: {
  id?: string;
  title?: string;
  /** Accessible name when the panel shows no title. */
  label?: string;
  note?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-label={title ?? label} className={`flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(20,40,60,0.04)] sm:p-6 ${className}`}>
      {(title || note || legend) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          {(title || note) && (
            <div className="min-w-0">
              {title && <h2 className="text-[16px] font-bold leading-tight">{title}</h2>}
              {note && <p className="mt-1 text-[13px] text-muted-foreground">{note}</p>}
            </div>
          )}
          {legend && <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">{legend}</div>}
        </header>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** A small trend line. */
export function Spark({ values, className = 'h-8 w-24' }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 96 + 2, 30 - (v / max) * 26] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 100 32" className={className} aria-hidden="true" preserveAspectRatio="none">
      <path d={`${d} L98,32 L2,32 Z`} fill="var(--color-primary-soft)" />
      <path d={d} fill="none" stroke="var(--color-primary)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.2} fill="var(--color-primary)" />
    </svg>
  );
}

/** A headline figure, as in the portal's year-at-a-glance cards. */
export function Figure({ label, value, note, trend }: { label: string; value: ReactNode; note?: ReactNode; trend?: number[] }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(20,40,60,0.04)]">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0 truncate text-[26px] font-extrabold leading-none tracking-[-0.01em]">{value}</div>
        {trend && <Spark values={trend} />}
      </div>
      {note && <div className="mt-2 truncate text-[12px] text-muted-foreground">{note}</div>}
    </div>
  );
}

/** A filter as a pill holding a native select, as in the portal's filter bar. */
export function SelectPill<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const current = options.find((o) => o.value === value)?.label ?? '';
  return (
    <label className="relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-white pl-3 pr-8 text-[13px] shadow-[0_1px_1px_rgba(20,40,60,0.04)] focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring hover:border-primary/40">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[12rem] truncate font-bold">{current}</span>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground" aria-hidden="true" />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block size-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
