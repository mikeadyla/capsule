import type { NextRequest } from "next/server";
import { mentionedCountries } from "@/lib/gazetteer";
import type { Article, CountryCount, Feed, Range } from "@/lib/types";

const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";
// OR needs its parentheses, or GDELT answers with plain text instead of JSON.
const QUERY = "(refugee OR refugees OR asylum OR UNHCR OR displaced OR displacement) sourcelang:english";
const TIMESPAN: Record<Range, string> = { "24h": "24h", "7d": "7d", "30d": "1m" };

const TTL_MS = 15 * 60 * 1000;
/** GDELT asks for one request every five seconds. */
const MIN_GAP_MS = 5200;

/** After a failure, GDELT is left alone for this long and visitors get the last rows (or the sample) at once. */
const RETRY_AFTER_MS = 60 * 1000;

const cache = new Map<Range, { at: number; feed: Feed }>();
const failedAt = new Map<Range, number>();
const inflight = new Map<Range, Promise<Feed>>();
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs requests to GDELT one at a time, spaced out. */
function spaced<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return job();
  });
  queue = run.catch(() => undefined);
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
    if (!title || !a.url) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue; // syndicated copies
    seen.add(key);
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

async function fetchFeed(range: Range): Promise<Feed> {
  const params = new URLSearchParams({
    query: QUERY,
    mode: "ArtList",
    maxrecords: "250",
    format: "json",
    timespan: TIMESPAN[range],
    sort: "DateDesc",
  });
  const res = await spaced(() => fetch(`${GDELT_DOC_API}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(25_000) }));
  if (!res.ok) throw new Error(`GDELT ${res.status}`);
  const data = JSON.parse(await res.text()) as { articles?: GdeltArticle[] }; // throws on its plain-text errors
  return build(range, data.articles ?? [], true);
}

async function load(range: Range): Promise<Feed> {
  const hit = cache.get(range);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.feed;

  const failed = failedAt.get(range);
  if (failed && Date.now() - failed < RETRY_AFTER_MS) return hit ? { ...hit.feed, stale: true } : sample(range);

  let pending = inflight.get(range);
  if (!pending) {
    pending = fetchFeed(range)
      .then((feed) => {
        failedAt.delete(range);
        cache.set(range, { at: Date.now(), feed });
        return feed;
      })
      .finally(() => inflight.delete(range));
    inflight.set(range, pending);
  }

  try {
    return await pending;
  } catch {
    failedAt.set(range, Date.now());
    // The live feed is unreachable or rate limited: keep showing the last rows we had, marked as such.
    if (hit) return { ...hit.feed, stale: true };
    return sample(range);
  }
}

export async function GET(request: NextRequest) {
  const asked = request.nextUrl.searchParams.get("range");
  const range: Range = asked === "24h" || asked === "30d" ? asked : "7d";
  return Response.json(await load(range), { headers: { "Cache-Control": "no-store" } });
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
  const feed = build(range, rows, false);
  return { ...feed, live: false };
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
