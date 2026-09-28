import { describe, expect, it } from 'vitest';
import type { SearchDocument } from '@/lib/content/types';
import { createLocalEngine } from './engine';

const docs: SearchDocument[] = [
  {
    id: '1',
    type: 'ingredient',
    title: 'Creatine monohydrate',
    subtitle: 'Ingredient',
    url: '/i/c',
    keywords: ['micronised creatine'],
  },
  {
    id: '2',
    type: 'product',
    title: 'Micronised Creatine, Lemon',
    subtitle: 'Sampleworks · Powder',
    url: '/p/1',
    keywords: ['creatine monohydrate'],
  },
  {
    id: '3',
    type: 'product',
    title: 'Whey Protein Concentrate',
    subtitle: 'Specimen Nutrition',
    url: '/p/2',
    keywords: ['whey protein'],
  },
  {
    id: '4',
    type: 'guide',
    title: 'How to compare protein powders',
    subtitle: 'Guide',
    url: '/g/1',
    keywords: [],
  },
];

describe('local search engine', () => {
  const engine = createLocalEngine(docs);
  it('ranks title matches first', () => {
    const hits = engine.search('creatine');
    expect(
      hits
        .map((h) => h.doc.id)
        .slice(0, 2)
        .sort(),
    ).toEqual(['1', '2']);
  });
  it('supports prefix matching and brand keywords', () => {
    expect(engine.search('spec')[0]?.doc.id).toBe('3');
  });
  it('requires all terms to match', () => {
    expect(engine.search('whey lemon')).toHaveLength(0);
  });
  it('ignores punctuation and case', () => {
    expect(engine.search('PROTEIN-powders')[0]?.doc.id).toBe('4');
  });
  it('filters by type', () => {
    expect(engine.search('protein', { type: 'guide' }).map((h) => h.doc.id)).toEqual(['4']);
  });
});
