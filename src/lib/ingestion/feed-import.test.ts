import { describe, expect, it } from 'vitest';
import { SOURCES } from '@/lib/sources/policy';
import {
  buildFeedImportDocuments,
  checkImportDocuments,
  type ImportDoc,
  type RegisteredSource,
} from './feed-import';
import { extractShopifyFeed, type ShopifyProduct } from './shopify-feed';

/**
 * Idempotent, safe private import of feed catalogues (synthetic listings; no
 * network, no Sanity). The real import is `sanity dataset import --missing`,
 * simulated here by `importMissing` (create only when the ID is absent).
 */
const fitlix = SOURCES.find((s) => s.id === 'fitlix')! as unknown as RegisteredSource;
const AT = '2026-09-30T00:00:00Z';
const LONG_HANDLE =
  'muscleblaze-creapro-creatine-monohydrate-with-creapure®-100g-unflavoured-33-servings-3g-99-99-pure-creatine-sourced-from-alzchem-germany-micronised-for-maximum-absorption';

const listing = (o: Partial<ShopifyProduct>): ShopifyProduct => ({
  id: 1,
  title: 'Brand Whey | 1kg | 24g Protein per serving',
  handle: 'brand-whey-1kg',
  body_html: '<p>Each scoop gives 24g of protein per scoop.</p>',
  vendor: 'MuscleBlaze',
  product_type: 'Energy',
  tags: ['Energy'],
  variants: [
    { id: 11, title: 'Chocolate', price: '1999.00', compare_at_price: '2499.00', sku: null },
    { id: 12, title: '2kg / Vanilla', price: '3499.00', compare_at_price: null, sku: null },
  ],
  images: [{ src: 'https://cdn.shopify.com/brand.jpg' }],
  ...o,
});
const feed = {
  products: [
    listing({}),
    listing({
      id: 7_654_321_098_765,
      handle: LONG_HANDLE,
      title: 'MB CreaPRO Creatine – 100g | 3g Creatine',
    }),
    listing({
      id: 3,
      handle: 'hyde-30',
      vendor: 'ProSupps',
      title: 'ProSupps HYDE Xtreme | 30 Servings',
    }),
    listing({
      id: 4,
      handle: 'hyde-15',
      vendor: 'ProSupps',
      title: 'ProSupps HYDE Xtreme | 15 Servings',
    }),
    listing({
      id: 5,
      handle: 'rice-cakes',
      vendor: 'Pintola',
      title: 'Pintola Brown Rice Cakes 130g',
    }),
  ],
};
const build = (f = feed) =>
  buildFeedImportDocuments(extractShopifyFeed(f, fitlix, AT), fitlix, {
    contentHash: 'sha256:test',
  });

/** `sanity dataset import --missing`: create a document only if its ID is absent. */
function importMissing(store: Map<string, ImportDoc>, docs: ImportDoc[]): number {
  let created = 0;
  for (const d of docs)
    if (!store.has(d._id)) {
      store.set(d._id, structuredClone(d));
      created++;
    }
  return created;
}

describe('feed import documents', () => {
  it('uses valid, short, deterministic IDs (never the handle)', () => {
    const docs = build();
    for (const d of docs) expect(d._id, d._id).toMatch(/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/);
    expect(docs.map((d) => d._id)).toEqual([
      'dataSource.fitlix',
      'snapshot.fitlix.1',
      'candidate.fitlix.1',
      'snapshot.fitlix.7654321098765',
      'candidate.fitlix.7654321098765',
      'snapshot.fitlix.3',
      'candidate.fitlix.3',
      'snapshot.fitlix.4',
      'candidate.fitlix.4',
    ]);
  });

  it('is deterministic, and stable when the store renames a handle', () => {
    expect(build()).toEqual(build());
    const renamed = { products: feed.products.map((p) => ({ ...p, handle: `${p.handle}-v2` })) };
    expect(build(renamed).map((d) => d._id)).toEqual(build().map((d) => d._id));
  });

  it('has no null values and keeps provenance', () => {
    const docs = build();
    expect(JSON.stringify(docs)).not.toMatch(/:null/);
    const c = docs.find((d) => d._id === 'candidate.fitlix.1')!;
    expect(c).toMatchObject({
      dataSource: { _type: 'reference', _ref: 'dataSource.fitlix' },
      snapshot: { _type: 'reference', _ref: 'snapshot.fitlix.1' },
      sourceUrl: 'https://fitlix.co.in/products/brand-whey-1kg',
      extractedAt: AT,
      extractor: 'shopify-feed@1',
      status: 'needs_verification',
      matchStatus: 'unmatched',
      possibleMatches: [],
    });
    expect(docs.find((d) => d._id === 'snapshot.fitlix.1')).toMatchObject({
      url: 'https://fitlix.co.in/products/brand-whey-1kg',
      fetchedAt: AT,
      contentHash: 'sha256:test',
      images: [],
    });
    expect(docs[0]).toMatchObject({
      _id: 'dataSource.fitlix',
      sourceType: 'marketplace',
      active: false,
    });
    expect(String(docs[0]!.notes)).toMatch(/Skipped 1 listing.*rice-cakes/);
  });
});

describe('idempotent import (--missing semantics)', () => {
  it('importing the same file twice creates nothing the second time', () => {
    const store = new Map<string, ImportDoc>();
    const docs = build();
    expect(importMissing(store, docs)).toBe(docs.length);
    const snapshot = JSON.stringify([...store]);
    expect(importMissing(store, docs)).toBe(0);
    expect(importMissing(store, build())).toBe(0); // a re-extraction of the same feed too
    expect(JSON.stringify([...store])).toBe(snapshot);
  });

  it('never touches existing products, published content or reviewer edits', () => {
    const product = {
      _id: 'product.x',
      _type: 'product',
      name: 'Existing',
      workflowStatus: 'PUBLISHED',
    };
    const edited = { ...build()[2]!, status: 'accepted', reviewedBy: 'A Reviewer' };
    const store = new Map<string, ImportDoc>([
      [product._id, product],
      [edited._id, edited],
    ]);
    importMissing(store, build());
    expect(store.get('product.x')).toEqual(product);
    expect(store.get(edited._id)).toEqual(edited); // not overwritten
    expect([...store.values()].filter((d) => d._type === 'product')).toHaveLength(1);
    expect([...store.values()].some((d) => d._type === 'editorialReview')).toBe(false);
  });
});

describe('pre-import check', () => {
  it('accepts a real-shaped feed file and summarises it', () => {
    const r = checkImportDocuments(build());
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.summary).toMatchObject({
      documents: { dataSource: 1, sourceSnapshot: 4, ingestionCandidate: 4 },
      goalSuggestions: { RETAILER_LISTING: 4 },
      duplicateFlagged: 2,
      skippedListings: 1,
    });
    expect(r.summary.facts).toBeGreaterThan(0);
  });

  const mutate = (fn: (docs: ImportDoc[]) => void) => {
    const docs = structuredClone(build());
    fn(docs);
    return checkImportDocuments(docs);
  };
  const cand = (docs: ImportDoc[]) => docs.find((d) => d._type === 'ingestionCandidate')!;

  it.each<[string, (docs: ImportDoc[]) => void]>([
    ['a Product document', (d) => d.push({ _id: 'product.x', _type: 'product' })],
    [
      'an EditorialReview document',
      (d) => d.push({ _id: 'editorialReview.x', _type: 'editorialReview' }),
    ],
    ['a draft', (d) => (d[2]!._id = `drafts.${d[2]!._id}`)],
    ['an over-long ID', (d) => (d[2]!._id = `candidate.fitlix.${'x'.repeat(130)}`)],
    ['an ID with ®', (d) => (d[2]!._id = 'candidate.fitlix.creapure®')],
    ['a duplicate ID', (d) => d.push(structuredClone(d[2]!))],
    [
      'a verified fact',
      (d) =>
        ((cand(d).facts as Array<Record<string, unknown>>)[0]!.verificationStatus = 'verified'),
    ],
    ['an invented match', (d) => (cand(d).matchStatus = 'possible_match')],
    ['possible matches', (d) => (cand(d).possibleMatches = [{ product: { _ref: 'product.x' } }])],
    ['a resolved product', (d) => (cand(d).resolvedProduct = { _ref: 'product.x' })],
    ['an invented GTIN', (d) => (cand(d).gtin = '8901234567890')],
    ['a non-needs_verification status', (d) => (cand(d).status = 'accepted')],
    [
      'an unresolved reference',
      (d) => (cand(d).snapshot = { _type: 'reference', _ref: 'snapshot.nope' }),
    ],
    [
      'retailer image references',
      (d) => (d[1]!.images = [{ sourceUrl: 'https://cdn.shopify.com/x.jpg' }]),
    ],
    ['a null value', (d) => (d[1]!.excerpt = null)],
    [
      'a basis-less ingredient_amount',
      (d) =>
        (cand(d).facts as Array<Record<string, unknown>>).push({
          field: 'ingredient_amount',
          label: 'Protein',
          value: '24 g',
          method: 'parser',
          verificationStatus: 'unverified',
        }),
    ],
  ])('rejects %s', (_label, fn) => {
    const r = mutate(fn);
    expect(r.ok).toBe(false);
    expect(r.problems.length).toBeGreaterThan(0);
  });
});
