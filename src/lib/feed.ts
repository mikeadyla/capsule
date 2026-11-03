import { mentionedCountries } from "@/lib/gazetteer";
import type { Article, CountryCount, Feed, Range } from "@/lib/types";

const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";

/**
 * GDELT returns only a few dozen articles per query, so Capsule asks three narrower questions and
 * merges the answers. OR needs its parentheses, or GDELT replies in plain text instead of JSON.
 */
const QUERIES = [
  "(refugee OR refugees) sourcelang:english",
  "(asylum OR UNHCR) sourcelang:english",
  "(displaced OR displacement) sourcelang:english",
];
/**
 * GDELT matches words anywhere in an article, so it also returns stories that only mention refugees in
 * passing. Capsule keeps a headline only when the headline itself is about displacement.
 */
const RELEVANT = /refugee|asylum|migra(?:nt|nts|tion)|displac|fle(?:e|es|d|eing)|deport|UNHCR|IOM|resettl|stateless|border|humanitarian|evacuat|exodus|camps?|small boats|crossings?|returnees?|internally displaced|IDPs?|smuggl|trafficking|detention|expel|exiles?/i;

const TIMESPAN: Record<Range, string> = { "24h": "24h", "7d": "7d", "30d": "1m" };

/** Fresh for this long; after that the last feed is served at once while a new one is fetched. */
const TTL_MS = 15 * 60 * 1000;
/** After a failure, GDELT is left alone for this long. */
const RETRY_AFTER_MS = 60 * 1000;
/** GDELT asks for one request every five seconds. */
const MIN_GAP_MS = 5200;

interface Store {
  cache: Map<Range, { at: number; feed: Feed }>;
  inflight: Map<Range, Promise<Feed>>;
  failedAt: Map<Range, number>;
  queue: Promise<unknown>;
  lastCall: number;
}

// One store per server process, shared by the route and the start-up warm-up.
const store: Store = ((globalThis as { __capsule?: Store }).__capsule ??= {
  cache: new Map(),
  inflight: new Map(),
  failedAt: new Map(),
  queue: Promise.resolve(),
  lastCall: 0,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs requests to GDELT one at a time, spaced out. */
function spaced<T>(job: () => Promise<T>): Promise<T> {
  const run = store.queue.then(async () => {
    const wait = store.lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    store.lastCall = Date.now();
    return job();
  });
  store.queue = run.catch(() => undefined);
  return run;
}

/** "20261103T111500Z" -> ISO 8601. */
function parseSeen(s: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : new Date().toISOString();
}

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
}

function build(range: Range, raw: GdeltArticle[], live: boolean): Feed {
  const seen = new Set<string>();
  const articles: Article[] = [];
  for (const a of raw) {
    const title = a.title?.trim();
    if (!title || !a.url || !RELEVANT.test(title)) continue;
    const key = title.toLowerCase();
    if (seen.has(key) || seen.has(a.url)) continue; // syndicated copies and repeats across queries
    seen.add(key);
    seen.add(a.url);
    articles.push({
      title,
      url: a.url,
      domain: (a.domain ?? new URL(a.url).hostname).replace(/^www\./, ""),
      date: parseSeen(a.seendate ?? ""),
      image: a.socialimage?.startsWith("https://") ? a.socialimage : null,
      countries: mentionedCountries(title),
    });
  }
  articles.sort((x, y) => y.date.localeCompare(x.date));

  const tally = new Map<string, number>();
  for (const a of articles) for (const c of a.countries) tally.set(c, (tally.get(c) ?? 0) + 1);
  const countries: CountryCount[] = [...tally]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { range, live, stale: false, fetchedAt: new Date().toISOString(), articles, countries };
}

async function ask(query: string, range: Range): Promise<GdeltArticle[]> {
  const params = new URLSearchParams({
    query,
    mode: "ArtList",
    maxrecords: "250",
    format: "json",
    timespan: TIMESPAN[range],
    sort: "DateDesc",
  });
  const res = await spaced(() => fetch(`${GDELT_DOC_API}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(25_000) }));
  if (!res.ok) throw new Error(`GDELT ${res.status}`);
  const data = JSON.parse(await res.text()) as { articles?: GdeltArticle[] }; // throws on its plain-text errors
  return data.articles ?? [];
}

/** Asks every query; succeeds when at least one answers. */
async function fetchFeed(range: Range): Promise<Feed> {
  const answers = await Promise.allSettled(QUERIES.map((q) => ask(q, range)));
  const ok = answers.filter((a): a is PromiseFulfilledResult<GdeltArticle[]> => a.status === "fulfilled");
  if (ok.length === 0) throw new Error("GDELT did not answer");
  return build(range, ok.flatMap((a) => a.value), true);
}

/** Starts a refresh unless one is running; remembers the result or the failure. */
function refresh(range: Range): Promise<Feed> {
  let pending = store.inflight.get(range);
  if (!pending) {
    pending = fetchFeed(range)
      .then((feed) => {
        store.failedAt.delete(range);
        store.cache.set(range, { at: Date.now(), feed });
        return feed;
      })
      .catch((e) => {
        store.failedAt.set(range, Date.now());
        throw e;
      })
      .finally(() => store.inflight.delete(range));
    store.inflight.set(range, pending);
  }
  return pending;
}

export async function loadFeed(range: Range): Promise<Feed> {
  const hit = store.cache.get(range);
  const failed = store.failedAt.get(range);
  const resting = failed !== undefined && Date.now() - failed < RETRY_AFTER_MS;

  if (hit) {
    // Serve what we have at once; fetch a newer one behind it when it has gone stale.
    if (Date.now() - hit.at >= TTL_MS && !resting) refresh(range).catch(() => undefined);
    return { ...hit.feed, stale: Date.now() - hit.at >= TTL_MS && resting };
  }
  if (resting) return sample(range);
  try {
    return await refresh(range);
  } catch {
    return sample(range);
  }
}

/** Fetches the default period when the server starts, so the first visitor does not wait. */
export function warm() {
  refresh("7d").catch(() => undefined);
}

/** Shown only when GDELT has never answered since the server started; the page says so. */
function sample(range: Range): Feed {
  const now = Date.now();
  const rows: GdeltArticle[] = SAMPLE.map(([title, domain], i) => ({
    title,
    url: `https://${domain}/sample-${i}`,
    domain,
    seendate: new Date(now - i * 3_600_000 * 5).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"),
  }));
  return { ...build(range, rows, false), live: false };
}

const SAMPLE: [string, string][] = [
  ["UNHCR warns of growing displacement crisis in Sudan as fighting nears El Fasher", "reuters.com"],
  ["Refugee resettlement in the United States falls to a historic low", "theguardian.com"],
  ["Turkey hosts one of the world's largest refugee populations for a tenth year", "aljazeera.com"],
  ["EU agrees timeline for new asylum pact as Greece and Italy brace for arrivals", "politico.eu"],
  ["Lebanon deepens strain as Syrian refugees face new pressures", "apnews.com"],
  ["Germany debates integration policy overhaul as asylum applications fall", "dw.com"],
  ["Rohingya refugees in Bangladesh camps face flooding after heavy rain", "bbc.com"],
  ["Kenya's Dadaab camp marks 35 years of operation", "nation.africa"],
  ["UNHCR calls for emergency funding as Sudan displacement crosses new threshold", "france24.com"],
  ["Ukraine refugees in Poland weigh return as winter approaches", "euronews.com"],
  ["Afghan returnees from Iran and Pakistan strain aid agencies", "reliefweb.int"],
  ["Venezuelan migrants cross the Darien Gap in smaller numbers", "reuters.com"],
  ["Haiti violence displaces thousands more families, UN says", "apnews.com"],
  ["Yemen displacement worsens as funding gaps widen", "unocha.org"],
  ["Eritrean asylum seekers reach Italy after Libya crossing", "ansa.it"],
  ["DR Congo: fighting near Goma forces tens of thousands to flee", "bbc.com"],
];
