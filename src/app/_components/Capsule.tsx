'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, Search } from 'lucide-react';
import { displayName } from '@/lib/gazetteer';
import { timeAgo } from '@/lib/format';
import { buckets, byTopic, TOPICS, type Topic } from '@/lib/topics';
import { RANGES, type Article, type Feed, type Range } from '@/lib/types';
import { Figure, Panel, SelectPill, Swatch } from './ui';
import { NONE, STEPS } from './CapsuleMap';

const CapsuleMap = dynamic(() => import('./CapsuleMap'), {
  ssr: false,
  loading: () => <div className="capsule-skeleton h-full w-full rounded-lg" />,
});

const PERIOD: Record<Range, string> = { '24h': 'in the last 24 hours', '7d': 'in the last 7 days', '30d': 'in the last 30 days' };

function Status({ feed, loading }: { feed: Feed | null; loading: boolean }) {
  if (!feed) return <span className="text-[13px] text-muted-foreground">{loading ? 'Loading the news feed…' : ''}</span>;
  if (!feed.live) {
    return <span className="rounded-md bg-gold-soft px-2 py-1 text-[12px] font-bold text-gold-ink" title="GDELT did not answer, so these are built-in examples.">Sample data · live feed unavailable</span>;
  }
  if (feed.stale) {
    return <span className="rounded-md bg-gold-soft px-2 py-1 text-[12px] font-bold text-gold-ink" title="GDELT is busy; these are the last headlines we had.">Last updated {timeAgo(feed.fetchedAt)}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <span className="size-2 rounded-full bg-teal" aria-hidden="true" /> Live · updated {timeAgo(feed.fetchedAt)}
    </span>
  );
}

function CountryList({ counts, selected, onSelect }: { counts: [string, number][]; selected: string | null; onSelect: (n: string | null) => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? counts.filter(([name]) => displayName(name).toLowerCase().includes(q)) : counts;
  const max = counts[0]?.[1] ?? 1;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <label className="relative block">
        <span className="sr-only">Find a country</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a country"
          className="h-9 w-full rounded-lg border border-input bg-white pl-9 pr-3 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
      </label>
      <ol className="mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1" aria-label="Countries named in headlines">
        {shown.map(([name, n]) => {
          const on = name === selected;
          return (
            <li key={name}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(on ? null : name)}
                className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-3 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring ${on ? 'bg-primary-soft font-bold text-primary' : 'hover:bg-muted'}`}
              >
                <span className="truncate">{displayName(name)}</span>
                <span className="font-bold tabular-nums">{n}</span>
                <span className="col-span-2 mt-1 h-1 rounded-full bg-muted">
                  <span className="block h-1 rounded-full bg-primary/70" style={{ width: `${(n / max) * 100}%` }} />
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2.5 py-6 text-center text-[13px] text-muted-foreground">No headline names that country.</li>}
      </ol>
    </div>
  );
}

function Coverage({ articles, range }: { articles: Article[]; range: Range }) {
  const rows = buckets(articles, range);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const every = rows.length > 12 ? Math.ceil(rows.length / 6) : rows.length > 8 ? 2 : 1;
  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Headlines over time">
        {rows.map((r) => (
          <div key={r.start} className="group relative flex h-full flex-1 items-end" title={`${r.label}: ${r.count}`}>
            <div className="w-full rounded-t-[3px] bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: `${(r.count / max) * 100}%`, minHeight: r.count ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[11px] text-muted-foreground">
        {rows.map((r, i) => (
          <div key={r.start} className="flex-1 truncate text-center">{i % every === 0 ? r.label : ''}</div>
        ))}
      </div>
    </div>
  );
}

function Ranking({ counts, selected, onSelect }: { counts: [string, number][]; selected: string | null; onSelect: (n: string | null) => void }) {
  const top = counts.slice(0, 10);
  const max = top[0]?.[1] ?? 1;
  if (!top.length) return <p className="py-8 text-center text-[13px] text-muted-foreground">No country named yet.</p>;
  return (
    <ol className="space-y-2">
      {top.map(([name, n], i) => {
        const on = name === selected;
        return (
          <li key={name}>
            <button type="button" onClick={() => onSelect(on ? null : name)} className="grid w-full grid-cols-[1.25rem_8.5rem_1fr_2rem] items-center gap-2 text-left text-[13px] focus-visible:outline-2 focus-visible:outline-ring">
              <span className="text-right tabular-nums text-muted-foreground">{i + 1}</span>
              <span className={`truncate ${on ? 'font-bold text-primary' : ''}`}>{displayName(name)}</span>
              <span className="h-4 rounded-[3px] bg-muted">
                <span className={`block h-4 rounded-[3px] ${on ? 'bg-primary' : 'bg-primary/60'}`} style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="text-right font-bold tabular-nums">{n}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Headlines({ articles, onSelect }: { articles: Article[]; onSelect: (n: string) => void }) {
  const [limit, setLimit] = useState(15);
  if (!articles.length) return <p className="py-10 text-center text-[13px] text-muted-foreground">No headlines match these filters.</p>;
  return (
    <>
      <ul className="divide-y">
        {articles.slice(0, limit).map((a) => (
          <li key={a.url} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[5.5rem_1fr]">
            <time dateTime={a.date} className="text-[12px] tabular-nums text-muted-foreground sm:pt-0.5">{timeAgo(a.date)}</time>
            <div className="min-w-0">
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="group inline font-bold leading-snug hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
                {a.title}
                <ArrowUpRight className="ml-1 inline size-3.5 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
              </a>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                <span>{a.domain}</span>
                {a.countries.slice(0, 4).map((c) => (
                  <button key={c} type="button" onClick={() => onSelect(c)} className="rounded px-1 font-semibold text-primary hover:bg-primary-soft">
                    {displayName(c)}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {articles.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + 20)} className="mt-3 w-full rounded-lg border py-2 text-[13px] font-bold text-primary hover:bg-primary-soft">
          Show more ({articles.length - limit} left)
        </button>
      )}
    </>
  );
}

export default function Capsule() {
  const params = useSearchParams();
  const [range, setRange] = useState<Range>('7d');
  const [topic, setTopic] = useState<Topic>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const headlinesRef = useRef<HTMLDivElement>(null);
  const jumped = useRef(false);

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

  // Opened from the Flordanis OS sidebar as "Headlines": go straight to the list.
  useEffect(() => {
    if (feed && !jumped.current && params.get('panel') === 'headlines') {
      jumped.current = true;
      headlinesRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [feed, params]);

  const topical = useMemo(() => byTopic(feed?.articles ?? [], topic), [feed, topic]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of topical) for (const c of a.countries) m.set(c, (m.get(c) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [topical]);
  const countMap = useMemo(() => new Map(counts), [counts]);
  const shown = useMemo(() => (selected ? topical.filter((a) => a.countries.includes(selected)) : topical), [topical, selected]);

  const trend = buckets(shown, range).map((b) => b.count);
  const named = new Set(shown.flatMap((a) => a.countries));
  // With a country chosen: the country most often named in the same headlines.
  const companion = useMemo(() => {
    if (!selected) return null;
    const m = new Map<string, number>();
    for (const a of shown) for (const c of a.countries) if (c !== selected) m.set(c, (m.get(c) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [shown, selected]);
  const publishers = new Set(shown.map((a) => a.domain)).size;
  const filtered = topic !== 'all' || selected !== null;
  const where = selected ? displayName(selected) : 'all countries';

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-white px-4 lg:px-8">
        <div className="mx-auto flex h-header max-w-[1240px] items-center gap-3">
          <span className="flex size-7 items-center justify-center rounded-full border-[1.5px] border-primary font-heading text-[13px] text-primary" aria-hidden="true">C</span>
          <span className="font-heading text-[18px] text-foreground">Capsule</span>
          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
          <h1 className="hidden truncate text-[15px] font-bold sm:block">Displacement in the news</h1>
          <div className="ml-auto"><Status feed={feed} loading={loading} /></div>
        </div>
      </header>

      <div className="sticky top-header z-20 border-b bg-primary-soft px-4 shadow-[0_1px_2px_rgba(20,40,60,0.05)] lg:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-2 py-2">
          <SelectPill label="Period" value={range} options={RANGES.map((r) => ({ value: r.id, label: `Last ${r.label}` }))} onChange={setRange} />
          <SelectPill
            label="Country"
            value={selected ?? ''}
            options={[{ value: '', label: 'All countries' }, ...counts.map(([name, n]) => ({ value: name, label: `${displayName(name)} (${n})` }))]}
            onChange={(v) => setSelected(v || null)}
          />
          <SelectPill label="Topic" value={topic} options={TOPICS.map((t) => ({ value: t.value, label: t.label }))} onChange={setTopic} />
          {filtered && (
            <button type="button" onClick={() => { setTopic('all'); setSelected(null); }} className="ml-auto text-[13px] font-bold text-primary hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-6 lg:px-8 lg:py-8">
        {failed && (
          <div role="alert" className="rounded-xl border border-[#F1C4C8] bg-[#FDF2F3] px-4 py-3 text-[14px] text-[#A80F1C]">
            Capsule could not reach its news feed.{' '}
            <button type="button" onClick={() => setReload((n) => n + 1)} className="font-bold underline">Try again</button>
          </div>
        )}

        <section aria-label="At a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure label="Headlines" value={feed ? shown.length.toLocaleString('en-US') : '–'} note={`${where}, ${PERIOD[range]}`} trend={trend} />
          <Figure label={selected ? 'Other countries named' : 'Countries named'} value={feed ? Math.max(0, named.size - (selected ? 1 : 0)) : '–'} note={selected ? 'in the same headlines' : 'at least once'} />
          <Figure
            label={selected ? 'Most often named with it' : 'Most named'}
            value={feed ? (selected ? (companion ? displayName(companion) : '–') : counts[0] ? displayName(counts[0][0]) : '–') : '–'}
            note={!selected && counts[0] ? `${counts[0][1]} headlines` : undefined}
          />
          <Figure label="Publishers" value={feed ? publishers : '–'} note="different websites" />
        </section>

        <Panel
          label="Map of countries named in headlines"
          legend={<><span>Fewer</span>{STEPS.map((c) => <span key={c} className="inline-block h-2.5 w-5 rounded-sm" style={{ background: c }} />)}<span>More</span><Swatch color={NONE} label="Not named" /></>}
        >
          <div className="grid gap-5 lg:h-[440px] lg:grid-cols-[280px_1fr]">
            <div className="order-2 h-[300px] min-h-0 lg:order-1 lg:h-auto">
              <CountryList counts={counts} selected={selected} onSelect={setSelected} />
            </div>
            <div className="order-1 h-[280px] min-h-0 sm:h-[360px] lg:order-2 lg:h-auto">
              <CapsuleMap counts={countMap} selected={selected} onSelect={setSelected} />
            </div>
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Headlines over time" note={`${range === '24h' ? 'Per hour' : 'Per day'}, ${where}.`}>
            {feed ? <Coverage articles={shown} range={range} /> : <div className="capsule-skeleton h-44 rounded-lg" />}
          </Panel>
          <Panel title="Most named countries" note={topic === 'all' ? 'Headlines naming each country.' : `Headlines about ${TOPICS.find((t) => t.value === topic)?.label.toLowerCase()} naming each country.`}>
            {feed ? <Ranking counts={counts} selected={selected} onSelect={setSelected} /> : <div className="capsule-skeleton h-44 rounded-lg" />}
          </Panel>
        </div>

        <div ref={headlinesRef} className="scroll-mt-[calc(var(--spacing-header)+64px)]">
          <Panel id="headlines" title="Headlines" note={`${shown.length.toLocaleString('en-US')} ${shown.length === 1 ? 'headline' : 'headlines'}, newest first.`}>
            {feed ? (
              <Headlines key={`${range}-${topic}-${selected}`} articles={shown} onSelect={setSelected} />
            ) : (
              <div className="space-y-3">{Array.from({ length: 5 }, (_, i) => <div key={i} className="capsule-skeleton h-10 rounded-lg" />)}</div>
            )}
          </Panel>
        </div>

      </main>
    </div>
  );
}
