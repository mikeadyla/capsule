import type { Article, Range } from './types';

export type Topic = 'all' | 'refugees' | 'asylum' | 'displacement';

export const TOPICS: { value: Topic; label: string; match?: RegExp }[] = [
  { value: 'all', label: 'All topics' },
  { value: 'refugees', label: 'Refugees', match: /\brefugees?\b/i },
  { value: 'asylum', label: 'Asylum', match: /\basylum\b|\bUNHCR\b/i },
  { value: 'displacement', label: 'Displacement', match: /\bdisplac(?:ed|ement)\b|\bfle(?:e|d|eing)\b/i },
];

export const byTopic = (articles: Article[], topic: Topic) => {
  const match = TOPICS.find((t) => t.value === topic)?.match;
  return match ? articles.filter((a) => match.test(a.title)) : articles;
};

/** Headline counts per hour (last 24 hours) or per day (7 or 30 days), oldest first. */
export function buckets(articles: Article[], range: Range, now = Date.now()): { start: number; label: string; count: number }[] {
  const hourly = range === '24h';
  const size = hourly ? 3_600_000 : 86_400_000;
  const n = range === '24h' ? 24 : range === '7d' ? 7 : 30;
  const end = hourly ? Math.ceil(now / size) * size : new Date(new Date(now).toDateString()).getTime() + size;
  const out = Array.from({ length: n }, (_, i) => {
    const start = end - (n - i) * size;
    const d = new Date(start);
    return {
      start,
      label: hourly ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      count: 0,
    };
  });
  for (const a of articles) {
    const i = Math.floor((new Date(a.date).getTime() - (end - n * size)) / size);
    if (i >= 0 && i < n) out[i].count++;
  }
  return out;
}
