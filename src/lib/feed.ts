import { mentionedCountries } from "@/lib/gazetteer";
import { KINDS, type Article, type CountryCount, type Feed } from "@/lib/types";

/**
 * Capsule's news comes from ReliefWeb, the UN's humanitarian information service. Its public RSS
 * feeds need no key; each returns the latest 20 updates for a search, so Capsule runs a few searches
 * and merges them. Every update is tagged by ReliefWeb with the countries it covers.
 */
const SEARCHES = ["refugees", "asylum", "displacement", "internally displaced", "migrants", "returnees"];
const RSS = "https://reliefweb.int/updates/rss.xml";
const USER_AGENT = "Mozilla/5.0 (compatible; Capsule/1.0; +https://capsule.flordanis.com)";

/** Fresh for this long; after that the last feed is served at once while a new one is fetched. */
const TTL_MS = 10 * 60 * 1000;
/** After a failure, ReliefWeb is left alone for this long. */
const RETRY_AFTER_MS = 60 * 1000;
/** A polite pause between the searches. */
const GAP_MS = 1200;


interface Store {
  cached: { at: number; feed: Feed } | null;
  inflight: Promise<Feed> | null;
  failedAt: number | null;
}

// One store per server process, shared by the route and the start-up warm-up.
const store: Store = ((globalThis as { __capsuleFeed?: Store }).__capsuleFeed ??= { cached: null, inflight: null, failedAt: null });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m,
    );
}

const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decode(m[1]).trim() : "";
};

/** ReliefWeb's country names -> the map's countries (atlas names). */
function countriesOf(list: string, title: string): string[] {
  const found = new Set<string>();
  for (const name of list.split(",").map((s) => s.trim()).filter(Boolean)) {
    for (const c of mentionedCountries(name)) found.add(c);
  }
  if (found.size === 0) for (const c of mentionedCountries(title)) found.add(c);
  return [...found];
}

function parse(xml: string): Article[] {
  const items = xml.split("<item>").slice(1).map((chunk) => chunk.split("</item>")[0]);
  return items.flatMap((item) => {
    const title = tag(item, "title");
    const url = tag(item, "link");
    if (!title || !url) return [];
    const description = tag(item, "description");
    const countryList = /class="tag country">\s*Countr(?:y|ies):\s*([^<]+)</.exec(description)?.[1] ?? "";
    const source = /class="tag source">\s*Sources?:\s*([^<]+)</.exec(description)?.[1]?.trim() || tag(item, "author") || "ReliefWeb";
    const categories = [...item.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((m) => decode(m[1]).trim());
    const kind = categories.find((c) => KINDS.includes(c)) ?? null;
    const image = /<img src="(https:\/\/reliefweb\.int\/[^"]+)"/.exec(description)?.[1] ?? null;
    const published = Date.parse(tag(item, "pubDate"));
    return [{
      title,
      url,
      source: decode(source),
      date: Number.isFinite(published) ? new Date(published).toISOString() : new Date().toISOString(),
      image,
      kind,
      countries: countriesOf(decode(countryList), title),
    }];
  });
}

function build(articles: Article[], live: boolean): Feed {
  const seen = new Set<string>();
  const unique = articles.filter((a) => (seen.has(a.url) ? false : (seen.add(a.url), true)));
  unique.sort((x, y) => y.date.localeCompare(x.date));
  const tally = new Map<string, number>();
  for (const a of unique) for (const c of a.countries) tally.set(c, (tally.get(c) ?? 0) + 1);
  const countries: CountryCount[] = [...tally].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { live, stale: false, fetchedAt: new Date().toISOString(), articles: unique, countries };
}

async function search(term: string): Promise<Article[]> {
  const res = await fetch(`${RSS}?search=${encodeURIComponent(term)}`, {
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ReliefWeb ${res.status}`);
  const xml = await res.text();
  if (!xml.includes("<rss")) throw new Error("ReliefWeb did not send a feed");
  return parse(xml);
}

/**
 * ReliefWeb's API, used when Capsule has an approved app name (RELIEFWEB_APPNAME, requested at
 * https://apidoc.reliefweb.int/parameters#appname). It is the sanctioned route for automated access;
 * ReliefWeb's bot protection may refuse the RSS feeds to a server.
 */
const API = "https://api.reliefweb.int/v2/reports";

interface ApiReport {
  fields: {
    title?: string;
    url_alias?: string;
    url?: string;
    date?: { created?: string };
    source?: { name?: string; shortname?: string }[];
    country?: { name?: string }[];
    format?: { name?: string }[];
  };
}

async function fetchFromApi(appname: string): Promise<Feed> {
  const res = await fetch(`${API}?appname=${encodeURIComponent(appname)}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      query: { value: SEARCHES.map((s) => `"${s}"`).join(" OR ") },
      fields: { include: ["title", "url", "url_alias", "date.created", "source.name", "source.shortname", "country.name", "format.name"] },
      sort: ["date.created:desc"],
      limit: 200,
    }),
  });
  if (!res.ok) throw new Error(`ReliefWeb API ${res.status}`);
  const data = (await res.json()) as { data?: ApiReport[] };
  const articles: Article[] = (data.data ?? []).flatMap(({ fields: f }) => {
    const url = f.url_alias || f.url;
    if (!f.title || !url) return [];
    const countries = (f.country ?? []).map((c) => c.name ?? "").join(", ");
    return [{
      title: f.title,
      url,
      source: f.source?.[0]?.name ?? "ReliefWeb",
      date: f.date?.created ?? new Date().toISOString(),
      image: null,
      kind: f.format?.[0]?.name ?? null,
      countries: countriesOf(countries, f.title),
    }];
  });
  return build(articles, true);
}

/** The API when Capsule has an app name; otherwise the RSS searches, one after the other. */
async function fetchFeed(): Promise<Feed> {
  const appname = process.env.RELIEFWEB_APPNAME;
  if (appname) return fetchFromApi(appname);

  const all: Article[] = [];
  let answered = 0;
  for (const [i, term] of SEARCHES.entries()) {
    if (i) await sleep(GAP_MS);
    try {
      all.push(...(await search(term)));
      answered++;
    } catch {
      // one search failing leaves the others
    }
  }
  if (!answered) throw new Error("ReliefWeb did not answer");
  return build(all, true);
}

function refresh(): Promise<Feed> {
  store.inflight ??= fetchFeed()
    .then((feed) => {
      store.failedAt = null;
      store.cached = { at: Date.now(), feed };
      return feed;
    })
    .catch((e) => {
      store.failedAt = Date.now();
      throw e;
    })
    .finally(() => {
      store.inflight = null;
    });
  return store.inflight;
}

export async function loadFeed(): Promise<Feed> {
  const hit = store.cached;
  const resting = store.failedAt !== null && Date.now() - store.failedAt < RETRY_AFTER_MS;
  if (hit) {
    const old = Date.now() - hit.at >= TTL_MS;
    if (old && !resting) refresh().catch(() => undefined);
    return { ...hit.feed, stale: old && resting };
  }
  if (resting) return sample();
  try {
    return await refresh();
  } catch {
    return sample();
  }
}

/** Fetches the feed when the server starts, so the first visitor does not wait. */
export function warm() {
  refresh().catch(() => undefined);
}

/** Shown only when ReliefWeb has never answered since the server started; the page says so. */
function sample(): Feed {
  const now = Date.now();
  const rows: Article[] = SAMPLE.map(([title, source, countries, kind], i) => ({
    title,
    url: `https://reliefweb.int/sample-${i}`,
    source,
    date: new Date(now - i * 3_600_000 * 4).toISOString(),
    image: null,
    kind,
    countries: countriesOf(countries, title),
  }));
  return { ...build(rows, false), live: false };
}

const SAMPLE: [string, string, string, string][] = [
  ["Sudan: Displacement Situation Update", "International Organization for Migration", "Sudan, Chad", "Situation Report"],
  ["UNHCR Türkiye Monthly Operational Update", "UN High Commissioner for Refugees", "Türkiye, Syrian Arab Republic", "Situation Report"],
  ["Lebanon: Flash Update on displacement", "UN Office for the Coordination of Humanitarian Affairs", "Lebanon", "Situation Report"],
  ["Rohingya refugee response: joint response plan", "UN High Commissioner for Refugees", "Bangladesh, Myanmar", "Appeal"],
  ["Democratic Republic of the Congo: Humanitarian snapshot, North Kivu", "UN Office for the Coordination of Humanitarian Affairs", "Democratic Republic of the Congo", "Infographic"],
  ["Ukraine: Returnees and internally displaced people, round 20", "International Organization for Migration", "Ukraine", "Assessment"],
  ["Afghanistan: Returns from Iran and Pakistan", "UN High Commissioner for Refugees", "Afghanistan, Iran (Islamic Republic of), Pakistan", "News and Press Release"],
  ["Venezuela situation: regional refugee and migrant response", "R4V", "Venezuela (Bolivarian Republic of), Colombia, Peru", "Analysis"],
];
