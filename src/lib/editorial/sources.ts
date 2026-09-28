import type { SourceData } from '@/lib/content/types';

/** Best outbound link for a source: explicit URL, then DOI, then PubMed. */
export function sourceHref(s: SourceData): string | null {
  if (s.url) return s.url;
  if (s.doi) return `https://doi.org/${s.doi}`;
  if (s.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/`;
  return null;
}

/** Short author string: "Kreider RB, Kalman DS, et al." */
export function formatAuthors(authors: string[] | null): string | null {
  if (!authors?.length) return null;
  const named = authors.filter((a) => a !== 'et al.');
  const hasMore = named.length > 2 || authors.includes('et al.');
  return named.slice(0, 2).join(', ') + (hasMore ? ', et al.' : '');
}

/** Collect unique sources from any number of lists, preserving first-seen order. */
export function collectSources(
  ...lists: Array<Array<SourceData | null> | undefined>
): SourceData[] {
  const seen = new Map<string, SourceData>();
  for (const list of lists) {
    for (const s of list ?? []) if (s && !seen.has(s._id)) seen.set(s._id, s);
  }
  return [...seen.values()];
}
