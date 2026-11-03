'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, Search, Star, X } from 'lucide-react';
import { displayName } from '@/lib/gazetteer';
import { timeAgo } from '@/lib/format';
import { byTopic, TOPICS, type Topic } from '@/lib/topics';
import { RANGES, type Article, type Feed, type Range } from '@/lib/types';
import { Panel, SelectPill, Swatch } from './ui';
import { NONE, STEPS } from './CapsuleMap';

const CapsuleMap = dynamic(() => import('./CapsuleMap'), {
  ssr: false,
  loading: () => <div className="capsule-skeleton h-full w-full rounded-lg" />,
});

/** How often an open page looks for new headlines. */
const POLL_MS = 5 * 60 * 1000;
const FOLLOWING_KEY = 'capsule.following';
const LAST_SEEN_KEY = 'capsule.lastSeen';

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: following and "new" markers last for this visit only
  }
}

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

/** Today, Yesterday, then "Monday 2 November". */
function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-gold-soft px-0.5 text-foreground">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

function CountryList({ counts, selected, onSelect, following, onFollow }: {
  counts: [string, number][];
  selected: string | null;
  onSelect: (n: string | null) => void;
  following: string[];
  onFollow: (n: string) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? counts.filter(([name]) => displayName(name).toLowerCase().includes(q)) : counts;
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
      <ol className="mt-2 min-h-0 flex-1 overflow-y-auto" aria-label="Countries in the news">
        {shown.map(([name, n]) => {
          const on = name === selected;
          const followed = following.includes(name);
          return (
            <li key={name} className={`flex items-center rounded-md ${on ? 'bg-primary-soft' : 'hover:bg-muted'}`}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(on ? null : name)}
                className={`flex min-w-0 flex-1 items-center justify-between gap-3 px-2.5 py-1.5 text-left text-[13px] focus-visible:outline-2 focus-visible:outline-ring ${on ? 'font-bold text-primary' : ''}`}
              >
                <span className="truncate">{displayName(name)}</span>
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </button>
              <button
                type="button"
                onClick={() => onFollow(name)}
                aria-pressed={followed}
                aria-label={followed ? `Stop following ${displayName(name)}` : `Follow ${displayName(name)}`}
                title={followed ? 'Following' : 'Follow'}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Star className="size-4" fill={followed ? 'currentColor' : 'none'} style={followed ? { color: 'var(--color-primary)' } : undefined} />
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2.5 py-6 text-center text-[13px] text-muted-foreground">No headline names that country.</li>}
      </ol>
    </div>
  );
}

function Feedlist({ articles, query, lastSeen, onSelect, empty }: {
  articles: Article[];
  query: string;
  lastSeen: number | null;
  onSelect: (n: string) => void;
  empty: ReactNode;
}) {
  const [limit, setLimit] = useState(40);
  if (!articles.length) return <div className="py-14 text-center text-[14px] text-muted-foreground">{empty}</div>;

  const groups: { label: string; items: Article[] }[] = [];
  for (const a of articles.slice(0, limit)) {
    const label = dayLabel(a.date);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1)!.items.push(a);
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="sticky top-[calc(var(--spacing-header)+53px)] z-10 -mx-1 bg-card/95 px-1 py-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">{g.label}</h3>
          <ul className="divide-y">
            {g.items.map((a) => {
              const isNew = lastSeen !== null && new Date(a.date).getTime() > lastSeen;
              return (
                <li key={a.url} className="py-3">
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    {isNew && <span className="rounded bg-teal/15 px-1.5 py-px text-[11px] font-bold text-teal-deep">New</span>}
                    <time dateTime={a.date}>{new Date(a.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{a.domain}</span>
                  </div>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="group mt-1 block text-[15px] font-bold leading-snug hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
                    <Highlight text={a.title} query={query} />
                    <ArrowUpRight className="ml-1 inline size-3.5 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                  </a>
                  {a.countries.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {a.countries.slice(0, 4).map((c) => (
                        <button key={c} type="button" onClick={() => onSelect(c)} className="rounded-md bg-muted px-2 py-0.5 text-[12px] font-semibold text-muted-foreground hover:bg-primary-soft hover:text-primary">
                          {displayName(c)}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {articles.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + 40)} className="rounded-lg border py-2 text-[13px] font-bold text-primary hover:bg-primary-soft">
          Show older headlines ({articles.length - limit} more)
        </button>
      )}
    </div>
  );
}

export default function Capsule() {
  const params = useSearchParams();
  const [range, setRange] = useState<Range>('7d');
  const [topic, setTopic] = useState<Topic>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [followedOnly, setFollowedOnly] = useState(false);
  const [following, setFollowing] = useState<string[]>([]);
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [waiting, setWaiting] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const jumped = useRef(false);

  // What you follow, and when you last looked (the headlines since then are marked new).
  useEffect(() => {
    setFollowing(readStore<string[]>(FOLLOWING_KEY, []));
    setLastSeen(readStore<number | null>(LAST_SEEN_KEY, null));
    const mark = () => writeStore(LAST_SEEN_KEY, Date.now());
    window.addEventListener('pagehide', mark);
    return () => {
      mark();
      window.removeEventListener('pagehide', mark);
    };
  }, []);
  const toggleFollow = useCallback((name: string) => {
    setFollowing((list) => {
      const next = list.includes(name) ? list.filter((n) => n !== name) : [...list, name];
      writeStore(FOLLOWING_KEY, next);
      return next;
    });
  }, []);

  const load = useCallback((signal?: AbortSignal) => {
    return fetch(`/api/gdelt?range=${range}`, { signal }).then((r) =>
      r.ok ? (r.json() as Promise<Feed>) : Promise.reject(new Error(String(r.status))),
    );
  }, [range]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setWaiting(null);
    load(controller.signal)
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
  }, [load, reload]);

  // Look for new headlines every few minutes; offer them rather than moving the list under the reader.
  useEffect(() => {
    const id = window.setInterval(() => {
      load()
        .then((data) => setWaiting(data))
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);
  const known = useMemo(() => new Set(feed?.articles.map((a) => a.url)), [feed]);
  const fresh = waiting ? waiting.articles.filter((a) => !known.has(a.url)).length : 0;
  const showWaiting = () => {
    if (waiting) setFeed(waiting);
    setWaiting(null);
  };

  // Opened from the Flordanis OS sidebar as "Headlines": start at the list.
  useEffect(() => {
    if (feed && !jumped.current && params.get('panel') === 'headlines') {
      jumped.current = true;
      feedRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [feed, params]);

  const topical = useMemo(() => byTopic(feed?.articles ?? [], topic), [feed, topic]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of topical) for (const c of a.countries) m.set(c, (m.get(c) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [topical]);
  const countMap = useMemo(() => new Map(counts), [counts]);
  const q = query.trim();
  const shown = useMemo(
    () =>
      topical.filter(
        (a) =>
          (!selected || a.countries.includes(selected)) &&
          (!followedOnly || a.countries.some((c) => following.includes(c))) &&
          (!q || a.title.toLowerCase().includes(q.toLowerCase())),
      ),
    [topical, selected, followedOnly, following, q],
  );
  const newCount = lastSeen === null ? 0 : shown.filter((a) => new Date(a.date).getTime() > lastSeen).length;
  const filtered = topic !== 'all' || selected !== null || followedOnly || q !== '';
  const clear = () => {
    setTopic('all');
    setSelected(null);
    setFollowedOnly(false);
    setQuery('');
  };

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
          <label className="relative min-w-[14rem] flex-1 sm:max-w-sm">
            <span className="sr-only">Search headlines</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search headlines"
              className="h-9 w-full rounded-lg border border-input bg-white pl-9 pr-3 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </label>
          <SelectPill label="Period" value={range} options={RANGES.map((r) => ({ value: r.id, label: `Last ${r.label}` }))} onChange={setRange} />
          <SelectPill label="Topic" value={topic} options={TOPICS.map((t) => ({ value: t.value, label: t.label }))} onChange={setTopic} />
          {following.length > 0 && (
            <button
              type="button"
              aria-pressed={followedOnly}
              onClick={() => setFollowedOnly((v) => !v)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-bold ${followedOnly ? 'border-primary bg-primary text-white' : 'border-input bg-white text-foreground hover:border-primary/40'}`}
            >
              <Star className="size-4" fill={followedOnly ? 'currentColor' : 'none'} /> Following ({following.length})
            </button>
          )}
          {filtered && (
            <button type="button" onClick={clear} className="ml-auto text-[13px] font-bold text-primary hover:underline">Clear filters</button>
          )}
        </div>
      </div>

      <main className="mx-auto grid max-w-[1240px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <div ref={feedRef} className="order-2 min-w-0 scroll-mt-[calc(var(--spacing-header)+64px)] lg:order-1">
          {failed && (
            <div role="alert" className="mb-4 rounded-xl border border-[#F1C4C8] bg-[#FDF2F3] px-4 py-3 text-[14px] text-[#A80F1C]">
              Capsule could not reach its news feed.{' '}
              <button type="button" onClick={() => setReload((n) => n + 1)} className="font-bold underline">Try again</button>
            </div>
          )}
          {fresh > 0 && (
            <button type="button" onClick={showWaiting} className="mb-4 w-full rounded-xl border border-teal/40 bg-teal/10 py-2.5 text-[14px] font-bold text-teal-deep hover:bg-teal/15">
              {fresh} new {fresh === 1 ? 'headline' : 'headlines'} · show
            </button>
          )}
          <Panel
            title={selected ? displayName(selected) : followedOnly ? 'Countries you follow' : 'Latest headlines'}
            note={
              feed
                ? `${shown.length.toLocaleString('en-US')} ${shown.length === 1 ? 'headline' : 'headlines'}${newCount ? ` · ${newCount} new since your last visit` : ''}`
                : undefined
            }
            legend={selected ? (
              <span className="inline-flex items-center gap-2">
                <button type="button" onClick={() => toggleFollow(selected)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-bold text-foreground hover:border-primary/40">
                  <Star className="size-3.5" fill={following.includes(selected) ? 'currentColor' : 'none'} style={following.includes(selected) ? { color: 'var(--color-primary)' } : undefined} />
                  {following.includes(selected) ? 'Following' : 'Follow'}
                </button>
                <button type="button" onClick={() => setSelected(null)} aria-label="Show all countries" className="flex size-7 items-center justify-center rounded-md hover:bg-muted"><X className="size-4" /></button>
              </span>
            ) : undefined}
          >
            {feed ? (
              <Feedlist
                key={`${range}-${topic}-${selected}-${followedOnly}`}
                articles={shown}
                query={q}
                lastSeen={lastSeen}
                onSelect={setSelected}
                empty={q ? <>No headline mentions &ldquo;{q}&rdquo;.</> : 'No headlines match these filters.'}
              />
            ) : (
              <div className="space-y-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="capsule-skeleton h-14 rounded-lg" />)}</div>
            )}
          </Panel>
        </div>

        <aside className="order-1 flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--spacing-header)+69px)] lg:order-2 lg:h-[calc(100dvh-var(--spacing-header)-93px)]" aria-label="Filter by country">
          <Panel label="Map" legend={<><span>Fewer</span>{STEPS.map((c) => <span key={c} className="inline-block h-2 w-3.5 rounded-sm" style={{ background: c }} />)}<span>More</span><Swatch color={NONE} label="None" /></>} className="shrink-0 !gap-3 !p-4">
            <div className="h-[190px]">
              <CapsuleMap counts={countMap} selected={selected} onSelect={setSelected} />
            </div>
          </Panel>
          <Panel title="Countries in the news" note="Star a country to follow it." className="min-h-[320px] flex-1 !p-4">
            <CountryList counts={counts} selected={selected} onSelect={setSelected} following={following} onFollow={toggleFollow} />
          </Panel>
        </aside>
      </main>
    </div>
  );
}
