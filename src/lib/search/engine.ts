import type { SearchDocument } from '@/lib/content/types';

/**
 * Search engine abstraction. The MVP implementation is an in-memory scorer
 * over a static JSON index (a few KB for hundreds of documents). To move to
 * Pagefind, Orama, Typesense or Algolia later, implement SearchEngine and
 * swap it in src/components/search/search-client.ts; the UI does not change.
 */
export interface SearchEngine {
  search(query: string, opts?: { limit?: number; type?: SearchDocument['type'] }): SearchHit[];
}

export interface SearchHit {
  doc: SearchDocument;
  score: number;
}

const TYPE_BOOST: Record<SearchDocument['type'], number> = {
  product: 1.2,
  ingredient: 1.15,
  brand: 1.1,
  comparison: 1,
  guide: 0.95,
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Prepared {
  doc: SearchDocument;
  title: string;
  titleWords: string[];
  rest: string;
}

export function createLocalEngine(docs: SearchDocument[]): SearchEngine {
  const prepared: Prepared[] = docs.map((doc) => {
    const title = normalize(doc.title);
    return {
      doc,
      title,
      titleWords: title.split(' '),
      rest: normalize([doc.subtitle, ...doc.keywords].join(' ')),
    };
  });

  return {
    search(query, opts = {}) {
      const q = normalize(query);
      if (!q) return [];
      const terms = q.split(' ');
      const hits: SearchHit[] = [];
      for (const p of prepared) {
        if (opts.type && p.doc.type !== opts.type) continue;
        let score = 0;
        let matched = 0;
        for (const term of terms) {
          let s = 0;
          if (p.titleWords.some((w) => w === term)) s = 10;
          else if (p.titleWords.some((w) => w.startsWith(term))) s = 7;
          else if (p.title.includes(term)) s = 4;
          else if (p.rest.split(' ').some((w) => w.startsWith(term))) s = 3;
          else if (p.rest.includes(term)) s = 1.5;
          if (s > 0) matched++;
          score += s;
        }
        // Every term must match somewhere (AND semantics).
        if (matched < terms.length) continue;
        if (p.title === q) score += 15;
        else if (p.title.startsWith(q)) score += 8;
        hits.push({ doc: p.doc, score: score * TYPE_BOOST[p.doc.type] });
      }
      hits.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
      return hits.slice(0, opts.limit ?? 50);
    },
  };
}
