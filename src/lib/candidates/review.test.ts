import { describe, expect, it } from 'vitest';
import { buildFeedImportDocuments, type RegisteredSource } from '@/lib/ingestion/feed-import';
import { extractShopifyFeed, type ShopifyProduct } from '@/lib/ingestion/shopify-feed';
import { SOURCES } from '@/lib/sources/policy';
import { MemoryDocStore, type Doc, type WriteOp } from '@/lib/submissions/store';
import {
  draftProductId,
  draftReferenceId,
  filterRows,
  LIST_QUERY,
  loadCandidate,
  parseAction,
  parseFilters,
  planCandidateAction,
  priceRange,
  runCandidateAction,
  studioUrl,
  summarise,
  type ActionContext,
  type Candidate,
} from './review';

/**
 * Internal candidate review over realistic FITLIX-shaped imports (synthetic
 * listings through the real feed pipeline; no network, no Sanity).
 */
const fitlix = SOURCES.find((s) => s.id === 'fitlix')! as unknown as RegisteredSource;
const AT = '2026-09-30T00:00:00Z';
const NOW = '2026-10-01T10:00:00Z';
const ACTOR = 'reviewer@example.com';

const listing = (o: Partial<ShopifyProduct>): ShopifyProduct => ({
  id: 1,
  title: 'MB CreaPRO Creatine – 100g | 3g Creatine per serving | Magnesium 1880mg',
  handle: 'mb-creapro-100g',
  body_html: '<p>Magnesium Glycinate 1880mg in every pack.</p>',
  vendor: 'MuscleBlaze',
  product_type: 'Creatine',
  tags: ['Muscle Gain'],
  variants: [
    { id: 11, title: 'Unflavoured', price: '1999.00', compare_at_price: '2499.00', sku: null },
    { id: 12, title: '250g / Unflavoured', price: '3499.00', compare_at_price: null, sku: null },
  ],
  images: [{ src: 'https://cdn.shopify.com/x.jpg' }],
  ...o,
});
const importDocs = () =>
  buildFeedImportDocuments(
    extractShopifyFeed(
      {
        products: [
          listing({}),
          listing({
            id: 3,
            handle: 'hyde-30',
            vendor: 'ProSupps',
            title: 'ProSupps HYDE | 30 Servings',
          }),
          listing({
            id: 4,
            handle: 'hyde-15',
            vendor: 'ProSupps',
            title: 'ProSupps HYDE | 15 Servings',
          }),
        ],
      },
      fitlix,
      AT,
    ),
    fitlix,
    { contentHash: 'sha256:test' },
  ) as Doc[];

const ID = 'candidate.fitlix.1';
const submissionCandidate: Doc = {
  _id: 'candidate.sub-abc',
  _type: 'ingestionCandidate',
  title: 'Submitted',
  submission: { _type: 'reference', _ref: 'sub-abc' },
  status: 'needs_verification',
};
const existingProduct: Doc = {
  _id: 'product.existing',
  _type: 'product',
  name: 'Existing',
  slug: {
    _type: 'slug',
    current: 'mb-creapro-creatine-100g-3g-creatine-per-serving-magnesium-1880mg',
  },
  workflowStatus: 'DRAFT',
};
const brand: Doc = {
  _id: 'brand.muscleblaze',
  _type: 'brand',
  name: 'MuscleBlaze',
  workflowStatus: 'DRAFT',
};
const category: Doc = { _id: 'category.creatine', _type: 'category', name: 'Creatine' };

function setup(extra: Doc[] = []) {
  const store = new MemoryDocStore();
  for (const d of [...importDocs(), submissionCandidate, ...extra])
    store.docs.set(d._id, structuredClone(d));
  return store;
}
const run = (
  store: MemoryDocStore,
  fields: Record<string, string>,
  actor: string | null = ACTOR,
  id = ID,
) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return runCandidateAction(store, id, parseAction(fd), actor, NOW);
};
const snapshotOf = (store: MemoryDocStore) => JSON.stringify([...store.docs.entries()]);

describe('list summaries and filters', () => {
  it('summarises every requested column from the real import shape', async () => {
    const rows = (await setup().query<Parameters<typeof summarise>[0][]>(LIST_QUERY)).map(
      summarise,
    );
    expect(rows.map((r) => r._id).sort()).toEqual([
      'candidate.fitlix.1',
      'candidate.fitlix.3',
      'candidate.fitlix.4',
    ]); // the submission candidate is not listed
    const r = rows.find((x) => x._id === ID)!;
    expect(r).toMatchObject({
      title: 'MB CreaPRO Creatine – 100g | 3g Creatine per serving | Magnesium 1880mg',
      brand: 'MuscleBlaze',
      source: 'FITLIX (retailer)',
      price: '₹1,999–₹3,499',
      mrp: '₹2,499',
      status: 'needs_verification',
      fetchedAt: AT,
      duplicate: false,
    });
    expect(r.ingredientAmounts).toBeGreaterThan(0);
    expect(r.basisNotStated).toBeGreaterThan(0); // "Magnesium Glycinate 1880mg"
    expect(rows.find((x) => x._id === 'candidate.fitlix.3')!.duplicate).toBe(true);
  });

  it('filters by brand, status, amounts, basis-not-stated and duplicate flag', async () => {
    const rows = (await setup().query<Parameters<typeof summarise>[0][]>(LIST_QUERY)).map(
      summarise,
    );
    const f = (q: string) =>
      filterRows(rows, parseFilters(new URLSearchParams(q)))
        .map((r) => r._id)
        .sort();
    expect(f('')).toHaveLength(3);
    expect(f('brand=ProSupps')).toEqual(['candidate.fitlix.3', 'candidate.fitlix.4']);
    expect(f('duplicate=1')).toEqual(['candidate.fitlix.3', 'candidate.fitlix.4']);
    expect(f('amounts=1')).toEqual([ID]);
    expect(f('basis=1')).toContain(ID);
    expect(f('status=rejected')).toEqual([]);
    expect(f('status=bogus')).toHaveLength(3); // unknown status is ignored
  });

  it('price ranges: single value, range, none, unparseable ignored', () => {
    expect(priceRange([{ field: 'price', value: '₹999.00' }], 'price')).toBe('₹999');
    expect(priceRange([{ field: 'price', value: 'call us' }], 'price')).toBeNull();
    expect(priceRange([], 'mrp')).toBeNull();
  });
});

describe('detail loads only private ingestion candidates', () => {
  it('loads a feed candidate', async () => {
    expect((await loadCandidate(setup(), ID))?._id).toBe(ID);
  });
  it.each([
    ['a submission candidate', 'candidate.sub-abc'],
    ['a draft ID', `drafts.${ID}`],
    ['a snapshot', 'snapshot.fitlix.1'],
    ['a data source', 'dataSource.fitlix'],
    ['a product', 'product.existing'],
    ['a missing candidate', 'candidate.fitlix.999'],
    ['a malformed ID', 'candidate./../x'],
  ])('refuses %s', async (_label, id) => {
    const store = setup([existingProduct, { ...(await setup().get(ID))!, _id: `drafts.${ID}` }]);
    expect(await loadCandidate(store, id)).toBeNull();
    expect(await run(store, { action: 'mark_in_review' }, ACTOR, id)).toEqual({ status: 404 });
  });
});

describe('actions', () => {
  it('rejects unauthenticated actions (no actor) without writing', async () => {
    const store = setup();
    const before = snapshotOf(store);
    expect(await run(store, { action: 'mark_in_review' }, null)).toEqual({ status: 401 });
    expect(await run(store, { action: 'mark_in_review' }, '')).toEqual({ status: 401 });
    expect(snapshotOf(store)).toBe(before);
  });

  it('mark in review: records actor and time; repeat is a no-op', async () => {
    const store = setup();
    expect(await run(store, { action: 'mark_in_review' })).toMatchObject({ ok: true });
    const c = (await store.get<Candidate>(ID))!;
    expect(c).toMatchObject({
      status: 'in_review',
      reviewedBy: ACTOR,
      reviewedAt: NOW,
      matchStatus: 'unmatched',
    });
    const after = snapshotOf(store);
    expect(await run(store, { action: 'mark_in_review' })).toEqual({
      ok: true,
      message: 'Already in review.',
    });
    expect(snapshotOf(store)).toBe(after);
  });

  it.each(['not_a_product', 'out_of_scope', 'duplicate'])(
    'reject with reason %s',
    async (reason) => {
      const store = setup();
      expect(await run(store, { action: 'reject', reason })).toMatchObject({ ok: true });
      const c = (await store.get<Candidate>(ID))!;
      expect(c).toMatchObject({
        status: 'rejected',
        rejectionReason: reason,
        reviewedBy: ACTOR,
        reviewedAt: NOW,
      });
      expect(c.matchStatus).toBe(reason === 'not_a_product' ? 'not_a_product' : 'unmatched');
      // Same again: no-op. A different reason: refused, not overwritten.
      const after = snapshotOf(store);
      expect(await run(store, { action: 'reject', reason })).toMatchObject({ ok: true });
      const other = reason === 'duplicate' ? 'out_of_scope' : 'duplicate';
      expect(await run(store, { action: 'reject', reason: other })).toMatchObject({ ok: false });
      expect(await run(store, { action: 'mark_in_review' })).toMatchObject({ ok: false });
      expect(snapshotOf(store)).toBe(after);
    },
  );

  it('reject requires a known reason', async () => {
    const store = setup();
    for (const reason of ['', 'spam', 'NOT_A_PRODUCT'])
      expect(await run(store, { action: 'reject', reason })).toMatchObject({ ok: false });
    expect((await store.get<Candidate>(ID))!.status).toBe('needs_verification');
  });

  it('create draft: identity only, linked back to the candidate', async () => {
    const store = setup([brand, category, existingProduct]);
    const candidateBefore = structuredClone((await store.get<Candidate>(ID))!);
    expect(
      await run(store, { action: 'create_draft', brandId: brand._id, categoryId: category._id }),
    ).toMatchObject({ ok: true });
    const pid = draftProductId(ID);
    expect(pid).toBe('product.candidate-fitlix.1');
    const p = (await store.get<Doc>(pid))!;
    const { _createdAt: _a, _updatedAt: _b, ...fields } = p;
    expect(fields).toEqual({
      _id: pid,
      _type: 'product',
      name: candidateBefore.title,
      // The existing product already uses the plain slug: made unique.
      slug: {
        _type: 'slug',
        current: 'mb-creapro-creatine-100g-3g-creatine-per-serving-magnesium-1880mg-2',
      },
      brand: { _type: 'reference', _ref: brand._id },
      category: { _type: 'reference', _ref: category._id },
      workflowStatus: 'DRAFT',
      isDemo: false,
    });
    // Source reference: URL + data source only (no GTIN, price or pack size).
    const refDoc = (await store.get<Doc>(draftReferenceId(ID)))!;
    expect(refDoc).toMatchObject({
      _type: 'productReference',
      product: { _ref: pid },
      dataSource: { _ref: 'dataSource.fitlix' },
      url: candidateBefore.sourceUrl,
      matchedBy: ACTOR,
      matchedAt: NOW,
    });
    for (const k of ['gtin', 'packSize', 'variantLabel', 'price'])
      expect(refDoc[k], k).toBeUndefined();
    // Candidate links to it; its facts and provenance are untouched.
    const c = (await store.get<Candidate>(ID))!;
    expect(c).toMatchObject({
      status: 'in_review',
      matchStatus: 'new_product',
      resolvedProduct: { _ref: pid },
      reviewedBy: ACTOR,
      reviewedAt: NOW,
    });
    for (const k of [
      'facts',
      'dataSource',
      'snapshot',
      'sourceUrl',
      'extractedAt',
      'extractor',
      'goalSuggestions',
      'notes',
      'title',
    ])
      expect(c[k], k).toEqual(candidateBefore[k]);
    // The existing product is untouched.
    expect(await store.get('product.existing')).toEqual(existingProduct);
  });

  it('the draft does not inherit any listing fact', async () => {
    const store = setup();
    await run(store, { action: 'create_draft' });
    const p = (await store.get<Doc>(draftProductId(ID)))!;
    for (const k of [
      'ingredients',
      'ingredientAmounts',
      'serving',
      'servingSize',
      'servingSizeText',
      'servingsPerContainer',
      'elementalAmounts',
      'vegStatus',
      'vegStatusReason',
      'labelImages',
      'labelFacts',
      'claims',
      'gtin',
      'price',
      'mrp',
      'format',
      'variant',
      'packSize',
      'lastVerifiedAt',
      'brand',
      'category',
    ])
      expect(p[k], k).toBeUndefined();
    // The listing title is the product name (identity); nothing else is copied.
    const { name: _n, slug: _s, ...rest } = p;
    const text = JSON.stringify(rest);
    for (const listed of [
      '1999',
      '2499',
      '3499',
      '1880',
      '3 g',
      '250g',
      'Unflavoured',
      'MuscleBlaze',
    ])
      expect(text, listed).not.toContain(listed);
  });

  it('create draft is idempotent (repeat and double submit)', async () => {
    const store = setup();
    await run(store, { action: 'create_draft' });
    const after = snapshotOf(store);
    expect(await run(store, { action: 'create_draft' })).toMatchObject({
      ok: true,
      message: 'Draft product already created.',
    });
    expect(snapshotOf(store)).toBe(after);
    expect([...store.docs.values()].filter((d) => d._type === 'product')).toHaveLength(1);
  });

  it('create draft links (does not duplicate) a draft that already exists', async () => {
    const pre = { _id: draftProductId(ID), _type: 'product', name: 'x', workflowStatus: 'DRAFT' };
    const store = setup([pre]);
    expect(await run(store, { action: 'create_draft' })).toMatchObject({ ok: true });
    expect(await store.get(draftProductId(ID))).toEqual(pre);
    expect((await store.get<Candidate>(ID))!.resolvedProduct?._ref).toBe(pre._id);
  });

  it('create draft refuses unknown brand/category', async () => {
    const store = setup();
    const before = snapshotOf(store);
    expect(await run(store, { action: 'create_draft', brandId: 'brand.nope' })).toMatchObject({
      ok: false,
    });
    expect(await run(store, { action: 'create_draft', categoryId: 'category.nope' })).toMatchObject(
      { ok: false },
    );
    expect(snapshotOf(store)).toBe(before);
  });

  it('link existing: links only, no fact copying, product untouched; idempotent', async () => {
    const store = setup([existingProduct]);
    const candidateBefore = structuredClone((await store.get<Candidate>(ID))!);
    expect(
      await run(store, { action: 'link_existing', productId: 'product.existing' }),
    ).toMatchObject({ ok: true });
    expect(await store.get('product.existing')).toEqual(existingProduct);
    const c = (await store.get<Candidate>(ID))!;
    expect(c).toMatchObject({
      status: 'in_review',
      matchStatus: 'confirmed',
      resolvedProduct: { _type: 'reference', _ref: 'product.existing' },
      reviewedBy: ACTOR,
    });
    expect(c.facts).toEqual(candidateBefore.facts);
    const after = snapshotOf(store);
    expect(
      await run(store, { action: 'link_existing', productId: 'product.existing' }),
    ).toMatchObject({ ok: true });
    expect(snapshotOf(store)).toBe(after);
    // Conflicting actions on a linked candidate are refused.
    expect(await run(store, { action: 'create_draft' })).toMatchObject({ ok: false });
    expect(await run(store, { action: 'reject', reason: 'duplicate' })).toMatchObject({
      ok: false,
    });
    expect(snapshotOf(store)).toBe(after);
  });

  it('link existing refuses unknown, draft-prefixed or non-product IDs', async () => {
    const store = setup([existingProduct]);
    for (const productId of [
      '',
      'product.nope',
      'drafts.product.existing',
      'brand.muscleblaze',
      ID,
    ])
      expect(await run(store, { action: 'link_existing', productId }), productId).toMatchObject({
        ok: false,
      });
  });

  it('unknown actions are refused', async () => {
    const store = setup();
    for (const action of ['', 'publish', 'approve', 'verify', 'accept'])
      expect(await run(store, { action })).toEqual({ ok: false, errors: ['Unknown action.'] });
  });
});

describe('no action can publish, approve or verify', () => {
  const base = async () => (await setup().get<Candidate>(ID))!;
  const ctx: ActionContext = {
    actor: ACTOR,
    now: NOW,
    productIds: ['product.existing'],
    brandIds: [brand._id],
    categoryIds: [category._id],
    productSlugs: [],
    draftExists: false,
  };
  const all = [
    { action: 'mark_in_review' as const },
    ...['not_a_product', 'out_of_scope', 'duplicate'].map((reason) => ({
      action: 'reject' as const,
      reason,
    })),
    { action: 'create_draft' as const, brandId: brand._id, categoryId: category._id },
    { action: 'link_existing' as const, productId: 'product.existing' },
  ];

  it('only writes candidate review fields and a DRAFT product + source reference', async () => {
    const c = await base();
    for (const a of all) {
      const plan = planCandidateAction(c, a, ctx);
      expect(plan.ok, a.action).toBe(true);
      if (!plan.ok) continue;
      for (const op of plan.ops as WriteOp[]) {
        if ('patch' in op) {
          expect(op.patch.id).toBe(ID); // never an existing product, brand or review
          expect(Object.keys(op.patch.set).sort()).toEqual(
            expect.arrayContaining(['reviewedAt', 'reviewedBy', 'status']),
          );
          for (const k of Object.keys(op.patch.set))
            expect(
              [
                'status',
                'matchStatus',
                'resolvedProduct',
                'rejectionReason',
                'reviewedBy',
                'reviewedAt',
              ],
              k,
            ).toContain(k);
          expect(op.patch.set.status).not.toBe('accepted');
        } else {
          expect(['product', 'productReference']).toContain(op.create._type);
          expect(op.create._id).not.toMatch(/^drafts\./);
          if (op.create._type === 'product') expect(op.create.workflowStatus).toBe('DRAFT');
        }
        const text = JSON.stringify(op);
        expect(text).not.toMatch(/"(APPROVED|PUBLISHED|NEEDS_REVIEW|FACT_CHECK|verified)"/);
        expect(text).not.toMatch(/editorialReview|publishedAt|verifiedBy|verificationStatus/);
      }
    }
  });

  it('leaves every fact unverified and provenance intact after any sequence', async () => {
    const store = setup([existingProduct]);
    const before = structuredClone((await store.get<Candidate>(ID))!);
    await run(store, { action: 'mark_in_review' });
    await run(store, { action: 'create_draft' });
    await run(store, { action: 'link_existing', productId: 'product.existing' });
    const c = (await store.get<Candidate>(ID))!;
    expect(c.facts!.every((f) => f.verificationStatus === 'unverified')).toBe(true);
    expect(c.facts).toEqual(before.facts);
    for (const k of ['dataSource', 'snapshot', 'sourceUrl', 'extractedAt', 'extractor'])
      expect(c[k], k).toEqual(before[k]);
    expect(await store.get('snapshot.fitlix.1')).toEqual(
      importDocs().find((d) => d._id === 'snapshot.fitlix.1'),
    );
    expect(await store.get('dataSource.fitlix')).toEqual(importDocs()[0]);
    expect([...store.docs.values()].some((d) => d._type === 'editorialReview')).toBe(false);
    expect(
      [...store.docs.values()]
        .filter((d) => d._type === 'product')
        .every((p) => p.workflowStatus === 'DRAFT'),
    ).toBe(true);
  });
});

describe('Studio links', () => {
  it('builds edit intent URLs', () => {
    expect(studioUrl('http://localhost:3333/', ID, 'ingestionCandidate')).toBe(
      'http://localhost:3333/intent/edit/id=candidate.fitlix.1;type=ingestionCandidate/',
    );
  });
});
