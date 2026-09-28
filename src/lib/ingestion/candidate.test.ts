import { describe, expect, it } from 'vitest';
import { ProvenanceError, parseAmount, suggestMatches, toCandidateDocument } from './candidate';
import type { ExtractedProduct } from './types';

const extracted = (over: Partial<ExtractedProduct> = {}): ExtractedProduct => ({
  provenance: {
    dataSourceId: 'dataSource.demo-brand',
    snapshotId: 'snapshot.x',
    sourceUrl: 'https://specimen.example/p/magnesium',
    fetchedAt: '2026-09-28T10:00:00Z',
  },
  title: 'Magnesium Glycinate 60 tablets',
  extractedAt: '2026-09-28T10:01:00Z',
  extractor: 'test@1',
  facts: [
    { field: 'brand', value: 'Specimen Nutrition', method: 'structured_data' },
    {
      field: 'ingredient_amount',
      label: 'Magnesium glycinate',
      value: '2,000 mg',
      method: 'ai',
      confidence: 1.4,
    },
    { field: 'price', value: '₹1,799', method: 'parser' },
  ],
  ...over,
});

describe('ingestion boundary', () => {
  it('preserves provenance through normalisation', () => {
    const doc = toCandidateDocument(extracted());
    expect(doc.dataSource._ref).toBe('dataSource.demo-brand');
    expect(doc.snapshot._ref).toBe('snapshot.x');
    expect(doc.sourceUrl).toBe('https://specimen.example/p/magnesium');
    expect(doc.extractedAt).toBe('2026-09-28T10:01:00Z');
    const amount = doc.facts.find((f) => f.field === 'ingredient_amount')!;
    // Layer A keeps the source's exact wording alongside the parsed value.
    expect(amount.value).toBe('2,000 mg');
    expect(amount).toMatchObject({ amount: 2000, unit: 'mg', method: 'ai', confidence: 1 });
  });

  it('creates every fact unverified, even if an extractor claims otherwise', () => {
    const tampered = extracted();
    (tampered.facts[1] as unknown as Record<string, unknown>).verificationStatus = 'verified';
    const doc = toCandidateDocument(tampered);
    expect(doc.status).toBe('needs_verification');
    expect(doc.facts.every((f) => f.verificationStatus === 'unverified')).toBe(true);
  });

  it('fails safely when provenance is missing', () => {
    const noSnapshot = extracted({
      provenance: {
        dataSourceId: 'd',
        snapshotId: '',
        sourceUrl: 'https://x.example',
        fetchedAt: 't',
      },
    });
    expect(() => toCandidateDocument(noSnapshot)).toThrow(ProvenanceError);
    const relativeUrl = extracted({
      provenance: { dataSourceId: 'd', snapshotId: 's', sourceUrl: '/p/1', fetchedAt: 't' },
    });
    expect(() => toCandidateDocument(relativeUrl)).toThrow(ProvenanceError);
    expect(() => toCandidateDocument(extracted({ extractedAt: '' }))).toThrow(ProvenanceError);
  });

  it('suggests matches but never confirms one', () => {
    const products = [
      { _id: 'product.a', name: 'Magnesium Glycinate 60 tablets', brand: 'Specimen Nutrition' },
      { _id: 'product.b', name: 'Whey Protein', brand: 'Specimen Nutrition' },
    ];
    const doc = toCandidateDocument(extracted(), products);
    expect(doc.matchStatus).toBe('possible_match');
    expect(doc.possibleMatches[0]?.product._ref).toBe('product.a');
    expect(doc).not.toHaveProperty('resolvedProduct');
    expect(suggestMatches('Unrelated Omega 3', 'Other Brand', products)).toHaveLength(0);
  });

  it('parses Indian price and unit formats', () => {
    expect(parseAmount('₹1,799')).toEqual({ amount: 1799, unit: null });
    expect(parseAmount('Net wt. 1 kg')).toEqual({ amount: 1, unit: 'kg' });
    expect(parseAmount('50 µg')).toEqual({ amount: 50, unit: 'mcg' });
  });
});
