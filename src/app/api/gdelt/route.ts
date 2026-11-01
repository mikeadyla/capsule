import { NextResponse } from "next/server";

const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";

export async function GET() {
  const query = "UNHCR OR refugee OR refugees OR asylum";
  const params = new URLSearchParams({
    query,
    mode: "ArtList",
    maxrecords: "250",
    format: "json",
    timespan: "7d",
    sort: "DateDesc",
  });

  try {
    const res = await fetch(`${GDELT_DOC_API}?${params}`, {
      next: { revalidate: 900 },
    });

    if (res.ok) {
      const data = await res.json();
      const articles: Array<{
        title: string;
        url: string;
        source: string;
        sourcecountry: string;
        seendate: string;
      }> = data.articles ?? [];

      const countryMap: Record<string, number> = {};
      for (const a of articles) {
        const cc = a.sourcecountry?.toUpperCase();
        if (cc) countryMap[cc] = (countryMap[cc] ?? 0) + 1;
      }

      const countries = Object.entries(countryMap)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count);

      return NextResponse.json({
        total: articles.length,
        countries,
        topArticles: articles.slice(0, 20).map((a) => ({
          title: a.title,
          url: a.url,
          source: a.source,
          country: a.sourcecountry,
          date: a.seendate,
        })),
        live: true,
      });
    }
  } catch {
    // fall through to sample data
  }

  return NextResponse.json(SAMPLE_DATA);
}

const SAMPLE_DATA = {
  total: 142,
  live: false,
  countries: [
    { code: "US", count: 28 }, { code: "UK", count: 19 },
    { code: "GM", count: 12 }, { code: "FR", count: 10 },
    { code: "TU", count: 9 },  { code: "GR", count: 8 },
    { code: "IT", count: 7 },  { code: "LE", count: 7 },
    { code: "JO", count: 6 },  { code: "KE", count: 6 },
    { code: "EG", count: 5 },  { code: "AU", count: 5 },
    { code: "CA", count: 4 },  { code: "IN", count: 4 },
    { code: "PK", count: 3 },  { code: "BG", count: 3 },
    { code: "SY", count: 2 },  { code: "AF", count: 2 },
    { code: "ET", count: 2 },  { code: "UG", count: 2 },
    { code: "SU", count: 2 },  { code: "OD", count: 1 },
    { code: "CO", count: 1 },  { code: "BR", count: 1 },
    { code: "MY", count: 1 },  { code: "IR", count: 1 },
  ],
  topArticles: [
    { title: "UNHCR warns of growing displacement crisis in East Africa", url: "#", source: "Reuters", country: "UK", date: "2026-11-01" },
    { title: "Refugee resettlement numbers fall to historic low", url: "#", source: "The Guardian", country: "UK", date: "2026-11-01" },
    { title: "Turkey hosts largest refugee population for tenth year", url: "#", source: "Al Jazeera", country: "QA", date: "2026-10-31" },
    { title: "EU agrees on new asylum pact implementation timeline", url: "#", source: "Politico", country: "BE", date: "2026-10-31" },
    { title: "Lebanon crisis deepens as Syrian refugees face new pressures", url: "#", source: "AP News", country: "US", date: "2026-10-31" },
    { title: "Germany debates integration policy overhaul", url: "#", source: "DW", country: "GM", date: "2026-10-30" },
    { title: "Rohingya refugees in Bangladesh camps face flooding", url: "#", source: "BBC", country: "UK", date: "2026-10-30" },
    { title: "Kenya's Dadaab camp marks 35 years of operation", url: "#", source: "Nation Africa", country: "KE", date: "2026-10-30" },
    { title: "US admits fewer refugees than annual cap allows", url: "#", source: "NPR", country: "US", date: "2026-10-29" },
    { title: "UNHCR calls for $1.2B emergency funding for Sudan crisis", url: "#", source: "France24", country: "FR", date: "2026-10-29" },
  ],
};
