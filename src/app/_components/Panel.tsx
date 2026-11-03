'use client';

import { useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { displayName } from '@/lib/gazetteer';
import { hueFor, plural, timeAgo } from '@/lib/format';
import type { Article, CountryCount } from '@/lib/types';

export type Tab = 'headlines' | 'countries';

interface Props {
  articles: Article[];
  countries: CountryCount[];
  loading: boolean;
  selected: string | null;
  onSelect: (name: string | null) => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
}

function Tabs({ tab, onTab, headlines, countries }: { tab: Tab; onTab: (t: Tab) => void; headlines: number; countries: number }) {
  const items: { id: Tab; label: string; n: number }[] = [
    { id: 'headlines', label: 'Headlines', n: headlines },
    { id: 'countries', label: 'Countries', n: countries },
  ];
  return (
    <div role="tablist" aria-label="Panel" className="flex gap-1 rounded-xl bg-cream-dark p-1">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={tab === it.id}
          onClick={() => onTab(it.id)}
          className={`flex-1 rounded-[9px] px-3 py-1.5 text-[13px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-plum ${
            tab === it.id ? 'bg-white text-plum shadow-sm' : 'text-[#8B8580] hover:text-charcoal'
          }`}
        >
          {it.label} <span className="ml-1 font-normal tabular-nums opacity-70">{it.n}</span>
        </button>
      ))}
    </div>
  );
}

function Avatar({ domain }: { domain: string }) {
  const hue = hueFor(domain);
  return (
    <span
      aria-hidden="true"
      className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{ background: `linear-gradient(140deg, hsl(${hue} 38% 52%), hsl(${(hue + 30) % 360} 40% 38%))` }}
    >
      {domain[0]?.toUpperCase()}
    </span>
  );
}

function Thumb({ src }: { src: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setOk(false)}
      className="size-[72px] shrink-0 rounded-xl border border-rose/20 object-cover"
    />
  );
}

function HeadlineCard({ a, onSelect }: { a: Article; onSelect: (name: string) => void }) {
  return (
    <article className="group relative rounded-2xl border border-rose/25 bg-white p-3.5 transition-all hover:-translate-y-px hover:border-plum/30 hover:shadow-[0_14px_30px_-20px_rgba(92,48,68,0.55)]">
      <div className="flex items-center gap-2 text-[11.5px] text-[#8B8580]">
        <Avatar domain={a.domain} />
        <span className="truncate font-semibold text-[#6B6560]">{a.domain}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={a.date} className="shrink-0">{timeAgo(a.date)}</time>
      </div>
      <div className="mt-2 flex gap-3">
        <a
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug text-charcoal after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-2 focus-visible:outline-plum"
        >
          <span className="line-clamp-3 group-hover:text-plum">{a.title}</span>
        </a>
        {a.image && <Thumb src={a.image} />}
      </div>
      <div className="relative z-10 mt-2.5 flex flex-wrap items-center gap-1.5">
        {a.countries.slice(0, 3).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onSelect(c)}
            className="rounded-full bg-cream-dark px-2.5 py-0.5 text-[11px] font-semibold text-plum transition-colors hover:bg-plum hover:text-white"
          >
            {displayName(c)}
          </button>
        ))}
        <ArrowUpRight size={14} className="ml-auto text-rose transition-colors group-hover:text-plum" aria-hidden="true" />
      </div>
    </article>
  );
}

function Skeletons() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="rounded-2xl border border-rose/20 bg-white p-3.5">
          <div className="capsule-skeleton h-3 w-2/5 rounded-full" />
          <div className="capsule-skeleton mt-3 h-3.5 w-full rounded-full" />
          <div className="capsule-skeleton mt-2 h-3.5 w-4/5 rounded-full" />
          <div className="capsule-skeleton mt-4 h-5 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function Ranking({ countries, selected, onSelect }: { countries: CountryCount[]; selected: string | null; onSelect: (n: string | null) => void }) {
  const max = countries[0]?.count ?? 1;
  return (
    <ol className="space-y-1">
      {countries.slice(0, 25).map((c, i) => {
        const on = c.name === selected;
        return (
          <li key={c.name}>
            <button
              type="button"
              onClick={() => onSelect(on ? null : c.name)}
              aria-pressed={on}
              className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-plum ${on ? 'bg-white shadow-sm ring-1 ring-plum/30' : 'hover:bg-white'}`}
            >
              <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-rose/20 transition-all duration-500" style={{ width: `${(c.count / max) * 100}%` }} />
              <span className="relative w-5 text-[11px] tabular-nums text-[#8B8580]">{i + 1}</span>
              <span className="relative flex-1 truncate text-[13.5px] font-semibold text-charcoal">{displayName(c.name)}</span>
              <span className="relative text-[13px] font-semibold tabular-nums text-plum">{c.count}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default function Panel({ articles, countries, loading, selected, onSelect, tab, onTab }: Props) {
  const shown = selected ? articles.filter((a) => a.countries.includes(selected)) : articles;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-rose/20 p-4">
        <Tabs tab={tab} onTab={onTab} headlines={shown.length} countries={countries.length} />
        {selected && (
          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-plum/20">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8B8580]">Showing</div>
              <div className="truncate font-heading text-[16px] text-charcoal">{displayName(selected)}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-plum">{plural(shown.length, 'headline')}</span>
              <button
                type="button"
                onClick={() => onSelect(null)}
                aria-label="Clear country"
                className="flex size-7 items-center justify-center rounded-full text-[#8B8580] transition-colors hover:bg-cream-dark hover:text-plum"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="capsule-scroll min-h-0 flex-1 overflow-y-auto p-4" role="tabpanel">
        {loading && articles.length === 0 ? (
          <Skeletons />
        ) : tab === 'countries' ? (
          <Ranking countries={countries} selected={selected} onSelect={onSelect} />
        ) : shown.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#8B8580]">No headlines name this country in this period.</div>
        ) : (
          <div className="space-y-3">
            {shown.map((a) => (
              <HeadlineCard key={a.url} a={a} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
