export type Range = '24h' | '7d' | '30d';

export const RANGES: { id: Range; label: string }[] = [
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
];

export interface Article {
  title: string;
  url: string;
  /** The publisher's website, e.g. bbc.com. */
  domain: string;
  /** ISO 8601. */
  date: string;
  image: string | null;
  /** Atlas names of the countries the headline names. */
  countries: string[];
}

export interface CountryCount {
  /** Atlas name (see lib/gazetteer.ts). */
  name: string;
  count: number;
}

export interface Feed {
  range: Range;
  /** True when the rows came from GDELT (now or earlier); false for the built-in sample. */
  live: boolean;
  /** The live feed could not be reached just now, so these are the last rows we had. */
  stale: boolean;
  fetchedAt: string;
  articles: Article[];
  countries: CountryCount[];
}
