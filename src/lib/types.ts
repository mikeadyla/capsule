export interface Article {
  title: string;
  url: string;
  /** The organisation that published it, e.g. UN High Commissioner for Refugees. */
  source: string;
  /** ISO 8601. */
  date: string;
  image: string | null;
  /** ReliefWeb's content type, e.g. Situation Report. */
  kind: string | null;
  /** Atlas names of the countries it covers (see lib/gazetteer.ts). */
  countries: string[];
}

export interface CountryCount {
  /** Atlas name (see lib/gazetteer.ts). */
  name: string;
  count: number;
}

export interface Feed {
  /** True when the items came from ReliefWeb (now or earlier); false for the built-in sample. */
  live: boolean;
  /** ReliefWeb could not be reached just now, so these are the last items we had. */
  stale: boolean;
  fetchedAt: string;
  articles: Article[];
  countries: CountryCount[];
}

/** ReliefWeb's content types, in the order Capsule lists them. */
export const KINDS = [
  "News and Press Release",
  "Situation Report",
  "Analysis",
  "Assessment",
  "Appeal",
  "Map",
  "Infographic",
  "UN Document",
  "Evaluation and Lessons Learned",
  "Manual and Guideline",
  "Interactive",
  "Other",
];
