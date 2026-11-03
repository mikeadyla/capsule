import type { Article } from './types';

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
