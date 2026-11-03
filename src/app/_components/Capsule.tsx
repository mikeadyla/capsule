'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { displayName } from '@/lib/gazetteer';
import { plural, timeAgo } from '@/lib/format';
import { RANGES, type Feed, type Range } from '@/lib/types';
import Panel, { type Tab } from './Panel';

const CapsuleMap = dynamic(() => import('./CapsuleMap'), {
  ssr: false,
  loading: () => <div className="capsule-skeleton h-full w-full" />,
});

function Status({ feed, loading }: { feed: Feed | null; loading: boolean }) {
  if (!feed) {
    return <span className="text-xs text-[#8B8580]">{loading ? 'Connecting to GDELT…' : ''}</span>;
  }
  if (!feed.live) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800" title="GDELT did not answer, so this is built-in sample data.">
        <span className="size-1.5 rounded-full bg-amber-500" /> Sample data · live feed unavailable
      </span>
    );
  }
  if (feed.stale) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800" title="GDELT is busy; these are the last headlines we had.">
        <span className="size-1.5 rounded-full bg-amber-500" /> Last update {timeAgo(feed.fetchedAt)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F3EB] px-2.5 py-1 text-[11px] font-semibold text-[#2F6B45]">
      <span className="capsule-live-dot size-1.5 rounded-full bg-[#4C9A66]" /> Live · updated {timeAgo(feed.fetchedAt)}
    </span>
  );
}

export default function Capsule() {
  const params = useSearchParams();
  const [range, setRange] = useState<Range>('7d');
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(params.get('panel') === 'countries' ? 'countries' : 'headlines');
  const [reload, setReload] = useState(0);

  // Opened from the Flordanis OS sidebar with ?panel=headlines: give the list more room on small screens.
  const focusHeadlines = params.get('panel') === 'headlines';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    fetch(`/api/gdelt?range=${range}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Feed>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        setFeed(data);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setFailed(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [range, reload]);

  const latestFor = useCallback(
    (name: string) => feed?.articles.find((a) => a.countries.includes(name))?.title,
    [feed],
  );

  const top = feed?.countries[0];
  const stats = useMemo(
    () => [
      { label: 'Headlines', value: feed ? feed.articles.length.toLocaleString('en-US') : '–' },
      { label: 'Countries named', value: feed ? String(feed.countries.length) : '–' },
      { label: 'Most named', value: top ? displayName(top.name) : '–' },
    ],
    [feed, top],
  );

  return (
    <div className="flex h-dvh max-h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rose/25 bg-white/80 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full border-[1.5px] border-plum font-heading text-[17px] text-plum">C</div>
          <div className="leading-tight">
            <h1 className="font-heading text-[20px] font-medium text-charcoal">Capsule</h1>
            <p className="hidden text-[11.5px] text-[#8B8580] sm:block">Displacement in the news</p>
          </div>
        </div>

        <Status feed={feed} loading={loading} />

        <div className="ml-auto flex items-center gap-3">
          <div role="group" aria-label="Time range" className="flex gap-1 rounded-xl bg-cream-dark p-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={range === r.id}
                onClick={() => setRange(r.id)}
                className={`rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-plum ${
                  range === r.id ? 'bg-white text-plum shadow-sm' : 'text-[#8B8580] hover:text-charcoal'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            aria-label="Refresh"
            title="Refresh"
            className="flex size-9 items-center justify-center rounded-xl border border-rose/30 bg-white text-[#6B6560] transition-colors hover:text-plum focus-visible:outline-2 focus-visible:outline-plum"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section aria-label="Map" className={`relative min-h-0 md:flex-1 ${focusHeadlines ? 'h-[34svh]' : 'h-[48svh]'} md:h-auto`}>
          <CapsuleMap
            countries={feed?.countries ?? []}
            selected={selected}
            onSelect={setSelected}
            latestFor={latestFor}
          />

          <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-wrap gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-rose/30 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur last:hidden sm:px-3.5 sm:py-2 sm:last:block">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8B8580]">{s.label}</div>
                <div className="font-heading text-[19px] leading-tight text-charcoal">{s.value}</div>
              </div>
            ))}
          </div>

          {failed && (
            <div role="alert" className="absolute inset-x-4 top-20 z-20 mx-auto max-w-sm rounded-2xl border border-[#E5B8B3] bg-white p-4 text-center text-sm text-[#8E3F4C] shadow-lg">
              Capsule could not reach its news feed.{' '}
              <button type="button" onClick={() => setReload((n) => n + 1)} className="font-semibold underline">Try again</button>
            </div>
          )}
        </section>

        <aside aria-label="Headlines" className="min-h-0 flex-1 border-t border-rose/25 bg-[#FDFAF7] md:w-[390px] md:flex-none md:border-l md:border-t-0">
          <Panel
            articles={feed?.articles ?? []}
            countries={feed?.countries ?? []}
            loading={loading}
            selected={selected}
            onSelect={setSelected}
            tab={tab}
            onTab={setTab}
          />
        </aside>
      </div>

      <footer className="border-t border-rose/20 bg-white/70 px-5 py-1.5 text-[11px] text-[#8B8580]">
        {feed ? `${plural(feed.articles.length, 'English-language headline')} ` : ''}from the GDELT Project, matched to the countries they name. Headlines, not casualties or arrivals.
      </footer>
    </div>
  );
}
