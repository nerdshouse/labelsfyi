import { readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { RESERVED_GOAL_SLUGS } from '../../../sanity/lib/constants';
import { applyFilters, type CardData } from '@/components/goals/goal-filters';
import { demoDataset } from '@/fixtures/index.ts';
import type { RawDoc } from '@/fixtures/helpers.ts';
import { offerHref } from '@/lib/affiliates';
import type { ContentGraph } from '@/lib/content/repository';
import type { ImageData } from '@/lib/content/types';
import { isDisplayableProductImage } from '@/lib/editorial/assets';
import {
  extractShopifyFeed,
  titleAmounts,
  type ShopifyProduct,
} from '@/lib/ingestion/shopify-feed';
import { buildSearchIndex } from '@/lib/search/build-index';
import { loadGraph } from '@/test/graph-loader';
import { findGoal, goalCard, goalSitemapPaths, goalView, normalizeGoalSlug } from './goals';
import { RESERVED_TOP_LEVEL } from './reserved';
import { goalCandidatesFromSuggestions, planGoalDecision } from './review';

let graph: ContentGraph;
beforeAll(async () => {
  graph = await loadGraph(demoDataset as RawDoc[]);
});
const goal = (slug: string) => graph.goals.find((g) => g.slug === slug)!;
const view = (slug: string, g = graph) =>
  goalView(
    g,
    g.goals.find((x) => x.slug === slug)!,
    new Date('2026-09-29T12:00:00Z'),
  );
const card = (goalSlug: string, productSlugPart: string, g = graph) =>
  view(goalSlug, g).cards.find((c) => c.slug.includes(productSlugPart))!;
const withDocs = async (patch: (docs: RawDoc[]) => RawDoc[]) =>
  loadGraph(patch(structuredClone(demoDataset as RawDoc[])));

// ─── Goals ───────────────────────────────────────────────────────────────

describe('goals', () => {
  it('normalises goal slugs', () => {
    expect(normalizeGoalSlug('Hair & Skin')).toBe('hair-skin');
    expect(normalizeGoalSlug('  Gut   Health ')).toBe('gut-health');
    expect(normalizeGoalSlug('SLEEP')).toBe('sleep');
    expect(normalizeGoalSlug('Énergie!')).toBe('energie');
    expect(normalizeGoalSlug('../etc')).toBe('etc');
  });

  it('looks up published goals by slug or name', () => {
    expect(findGoal(graph, 'stress')?.slug).toBe('stress');
    expect(findGoal(graph, 'Hair & Skin')?.slug).toBe('hair-skin');
    expect(findGoal(graph, 'gut health')?.slug).toBe('gut-health');
    expect(findGoal(graph, 'magnesium')).toBeNull();
  });

  it('only published, reviewed goals exist in the graph', () => {
    expect(graph.goals.map((g) => g.slug)).toEqual([
      'sleep',
      'stress',
      'immunity',
      'hydration',
      'energy',
      'gut-health',
      'joint-health',
      'hair-skin',
      'heart-health',
    ]);
    expect(findGoal(graph, 'focus')).toBeNull(); // DRAFT
  });

  it('a published goal without an approved review is dropped', async () => {
    const g = await withDocs((d) =>
      d.filter(
        (x) =>
          !(
            x._type === 'editorialReview' &&
            String((x.content as { _ref: string })._ref) === 'goal.sleep'
          ),
      ),
    );
    expect(g.goals.some((x) => x.slug === 'sleep')).toBe(false);
  });

  it('an empty goal renders but is not indexable', () => {
    const v = view('energy');
    expect(v.cards).toHaveLength(0);
    expect(v.indexable).toBe(false);
    expect(view('stress').indexable).toBe(true);
  });

  it('goal → ingredients, with product counts per chip', () => {
    const v = view('stress');
    expect(v.chips.map((c) => [c.name, c.count])).toEqual([
      ['Ashwagandha', 1],
      ['L-theanine', 0],
      ['Magnesium', 1],
      ['Saffron', 0],
      ['Rhodiola', 0],
      ['Vitamin B6', 1],
    ]);
    expect(v.chips.find((c) => c.name === 'Magnesium')!.href).toBe('/ingredients/magnesium');
    expect(v.chips.find((c) => c.name === 'Saffron')!.href).toBeNull();
    expect(v.chips.every((c) => c.relation === 'COMMONLY_FOUND')).toBe(true);
  });

  it('EDITORIALLY_REVIEWED needs a live, publishable evidence record; otherwise shown as commonly found', async () => {
    const claimId = (demoDataset as RawDoc[]).find(
      (d) => d._type === 'claim' && d.workflowStatus === 'PUBLISHED',
    )!._id;
    const mark = (evidence: string) => (docs: RawDoc[]) =>
      docs.map((d) =>
        d._id === 'goal.stress'
          ? {
              ...d,
              ingredients: (d.ingredients as Array<Record<string, unknown>>).map((i, n) =>
                n === 0
                  ? {
                      ...i,
                      relation: 'EDITORIALLY_REVIEWED',
                      evidence: { _type: 'reference', _ref: evidence },
                    }
                  : i,
              ),
            }
          : d,
      );
    const ok = await withDocs(mark(claimId));
    expect(ok.goals.find((g) => g.slug === 'stress')!.ingredients[0]!.relation).toBe(
      'EDITORIALLY_REVIEWED',
    );
    const missing = await withDocs(mark('claim.does-not-exist'));
    expect(missing.goals.find((g) => g.slug === 'stress')!.ingredients[0]!.relation).toBe(
      'COMMONLY_FOUND',
    );
  });

  it('product → goal only through approved relationships to published products', () => {
    const sleep = view('sleep').cards.map((c) => c.slug);
    expect(sleep).toContain('testbed-sports-magnesium-bisglycinate-capsules');
    expect(sleep).toContain('specimen-nutrition-magnesium-citrate-b6-capsules');
    // CANDIDATE (ingredient match) is not shown…
    expect(sleep).not.toContain('sampleworks-magnesium-oxide-400mg-tablets');
    // …nor an approved link to a DRAFT product.
    expect(JSON.stringify(view('sleep'))).not.toMatch(
      /draft-sleep-gummies|Unpublished Sleep Gummies/,
    );
  });

  it('never infers membership from ingredients', () => {
    // Magnesium products exist that are not linked to hydration; only the linked one appears.
    expect(view('hydration').cards.map((c) => c.slug)).toEqual([
      'specimen-nutrition-electrolyte-drink-mix-lemon',
    ]);
  });

  it('a relationship without a source or reviewer is ignored', async () => {
    const g = await withDocs((docs) =>
      docs.map((d) =>
        d._id === 'productGoal.ashwagandha-stress'
          ? { ...d, source: undefined, sourceUrl: undefined }
          : d._id === 'productGoal.d3-immunity'
            ? { ...d, reviewedBy: undefined }
            : d,
      ),
    );
    expect(view('stress', g).cards.map((c) => c.slug)).not.toContain(
      'testbed-sports-ashwagandha-root-extract-600mg-capsules',
    );
    expect(view('immunity', g).cards).toHaveLength(0);
  });

  it('goal slugs can never shadow an existing route', () => {
    for (const s of RESERVED_GOAL_SLUGS) expect(RESERVED_TOP_LEVEL.has(s), s).toBe(true);
    const top = readdirSync('src/pages')
      .map((f) => f.replace(/\.(astro|ts)$/, '').replace(/\.(json|xml|txt)$/, ''))
      .filter((f) => !f.startsWith('['));
    for (const f of top) expect(RESERVED_TOP_LEVEL.has(f), f).toBe(true);
    for (const g of graph.goals) expect(RESERVED_TOP_LEVEL.has(g.slug)).toBe(false);
  });
});

// ─── Catalogue cards ─────────────────────────────────────────────────────

describe('goal cards', () => {
  it('missing price → null, never an invented figure', () => {
    expect(card('stress', 'citrate-b6').price).toBeNull();
  });

  it('price present: amount, per serving and the observation date', () => {
    expect(card('hydration', 'electrolyte').price).toMatchObject({
      amount: '₹479',
      perServing: '₹23.95',
      merchant: 'Amazon.in',
      observedAt: '27 Sept 2026',
    });
  });

  it('goal ingredient missing from a label: no amount line, chip count 0', () => {
    const c = card('stress', 'ashwagandha');
    expect(c.ingredientKeys).toEqual(['ashwagandha']);
    expect(c.amounts.map((a) => a.label)).toEqual(['Ashwagandha (compound)']);
  });

  it('compound and elemental lines stay separate; elemental never computed', () => {
    const bis = card('sleep', 'bisglycinate');
    expect(bis.amounts).toEqual([
      { kind: 'compound', label: 'Magnesium (compound)', value: '1,000 mg magnesium bisglycinate' },
      { kind: 'elemental', label: 'Elemental magnesium', value: '140 mg' },
    ]);
  });

  it('missing elemental amount says "Not disclosed"', async () => {
    const g = await withDocs((docs) =>
      docs.map((d) =>
        d._id === 'productGoal.oxide-sleep'
          ? { ...d, status: 'APPROVED', reviewedBy: 'Test', reviewedAt: '2026-09-28T00:00:00Z' }
          : d,
      ),
    );
    const oxide = card('sleep', 'oxide', g);
    expect(oxide.amounts).toContainEqual({
      kind: 'elemental',
      label: 'Elemental magnesium',
      value: 'Not disclosed',
    });
    expect(JSON.stringify(oxide)).not.toMatch(/400 mg (elemental )?magnesium(?! oxide)/);
  });

  it('no "elemental" line for non-mineral actives (e.g. an extract)', () => {
    expect(card('stress', 'ashwagandha').amounts.some((a) => a.kind === 'elemental')).toBe(false);
  });

  it('why this appears: sourced basis with locator and date', () => {
    expect(card('stress', 'ashwagandha').why).toEqual([
      'Label lists ashwagandha, commonly found in products marketed for stress support.',
      'Marketed by the brand for stress support: “Everyday stress support” (Front label, observed 25 Sept 2026).',
    ]);
  });

  it('default order is alphabetical by brand, then product', () => {
    const names = view('sleep').cards.map((c) => `${c.brand} ${c.name}`);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('receipt link only for receipt-eligible products', () => {
    expect(card('sleep', 'bisglycinate').receiptHref).toBe(
      '/receipt/testbed-sports-magnesium-bisglycinate-capsules',
    );
  });
});

// ─── Images ──────────────────────────────────────────────────────────────

describe('product images', () => {
  const ctx = {
    productId: 'product.x',
    brandId: 'brand.y',
    now: Date.parse('2026-09-29T00:00:00Z'),
  };
  const img = (o: Partial<ImageData>): ImageData => ({
    url: '/x.jpg',
    alt: '',
    width: null,
    height: null,
    lqip: null,
    caption: null,
    ...o,
  });
  const perm = (o = {}) => ({
    status: 'AUTHORIZED' as const,
    assetType: 'PRODUCT_IMAGE' as const,
    grantedAt: '2026-01-01',
    expiresAt: null,
    scope: ['IMAGES'],
    verifiedAt: '2026-01-02',
    brand: 'brand.y',
    product: null,
    ...o,
  });

  it('missing image → neutral tile', () => {
    expect(isDisplayableProductImage(null, ctx)).toBe(false);
    expect(card('sleep', 'bisglycinate').image).toBeNull();
  });
  it('authorized image (brand-wide or product-specific, unexpired) is shown', () => {
    expect(
      isDisplayableProductImage(img({ provenance: 'AUTHORIZED', permission: perm() }), ctx),
    ).toBe(true);
    expect(
      isDisplayableProductImage(
        img({ provenance: 'AUTHORIZED', permission: perm({ product: 'product.x' }) }),
        ctx,
      ),
    ).toBe(true);
    expect(card('hydration', 'electrolyte').image?.url).toBe('/demo/specimen-electrolyte-pack.svg');
  });
  it('authorization for another brand/product, expired, revoked or missing → hidden', () => {
    for (const p of [
      perm({ brand: 'brand.other' }),
      perm({ product: 'product.other' }),
      perm({ expiresAt: '2026-09-01T00:00:00Z' }),
      perm({ status: 'REVOKED' }),
      perm({ assetType: 'BRAND_LOGO' }),
      perm({ scope: ['FACTUAL_DATA'] }), // written permission does not cover images
      perm({ scope: [] }),
      perm({ verifiedAt: null }), // nobody has checked the written permission
    ])
      expect(
        isDisplayableProductImage(img({ provenance: 'AUTHORIZED', permission: p as never }), ctx),
      ).toBe(false);
    expect(
      isDisplayableProductImage(img({ provenance: 'AUTHORIZED', permission: null }), ctx),
    ).toBe(false);
  });
  it('user-submitted images stay private; restricted/unknown/not-requested never shown', () => {
    for (const provenance of [
      'USER_SUBMITTED',
      'RESTRICTED',
      'REVOKED',
      'UNKNOWN',
      'NOT_REQUESTED',
    ] as const)
      expect(isDisplayableProductImage(img({ provenance }), ctx), provenance).toBe(false);
    expect(isDisplayableProductImage(img({}), ctx)).toBe(false); // no provenance at all
  });
  it('editorial label photos are shown', () => {
    expect(isDisplayableProductImage(img({ provenance: 'EDITORIAL_LABEL_PHOTO' }), ctx)).toBe(true);
  });
  it('the unauthorized marketing image never reaches the graph', () => {
    const p = graph.products.find((x) => x.slug.includes('ashwagandha'))!;
    expect(p.labelImages).toEqual([]);
    expect(JSON.stringify(graph)).not.toContain('unauthorized-marketing-shot');
  });
});

// ─── Commerce ────────────────────────────────────────────────────────────

describe('commerce', () => {
  const buy = () => card('hydration', 'electrolyte').buy;
  it('official store first: "Buy from brand", plain link, no affiliate marking', () => {
    expect(buy()[0]).toMatchObject({
      label: 'Buy from brand',
      official: true,
      affiliate: false,
      href: 'https://specimen.example/products/electrolyte-lemon',
      rel: 'nofollow noopener',
      price: '₹499',
      observedAt: '27 Sept 2026',
    });
  });
  it('affiliate offer uses the affiliate URL, is marked, and has rel=sponsored', () => {
    expect(buy()[1]).toMatchObject({
      label: 'Buy at Amazon.in',
      affiliate: true,
      rel: 'sponsored nofollow noopener',
      href: 'https://example.com/demo/amazon/specimen-electrolyte?tag=labelsfyi-demo',
    });
  });
  it('multiple merchants each keep their own dated price', () => {
    expect(buy().map((b) => [b.merchant, b.price])).toEqual([
      ['Specimen Nutrition store', '₹499'],
      ['Amazon.in', '₹479'],
    ]);
  });
  it('no merchant record → no buy link (nothing invented)', () => {
    expect(card('stress', 'citrate-b6').buy).toEqual([]);
  });
  it('stale offers (not checked in 45 days) are hidden', () => {
    const p = graph.products.find((x) => x.slug.includes('electrolyte'))!;
    const later = goalCard(p, goal('hydration'), { now: new Date('2026-12-31T00:00:00Z') });
    expect(later.buy).toEqual([]);
    expect(later.price?.observedAt).toBe('27 Sept 2026'); // the price still shows its date
  });
  it('affiliate URLs are outbound only; the product canonical is the decoder path', () => {
    const p = graph.products.find((x) => x.slug.includes('electrolyte'))!;
    for (const o of p.offers) {
      expect(offerHref(o)).toMatch(/^https:\/\//);
      expect(offerHref(o)).not.toMatch(/labels\.fyi/);
    }
    expect(card('hydration', 'electrolyte').href).toBe(
      '/products/specimen-nutrition-electrolyte-drink-mix-lemon',
    );
  });
});

// ─── Wording ─────────────────────────────────────────────────────────────

describe('goal wording', () => {
  const MEDICAL = /\b(treats?|cures?|prevents?|diagnos\w*|heals?)\b/i;
  const RANKING =
    /\b(best|#1|winner|top pick|highest quality|recommended|score|ranking|better|worse)\b/i;
  it('goal copy and generated card text make no medical or ranking claims', () => {
    for (const g of graph.goals) {
      const v = goalView(graph, g);
      const text = [
        g.name,
        g.shortDescription,
        g.discoveryDescription,
        ...v.cards.flatMap((c) => [
          ...c.why,
          ...c.amounts.map((a) => a.value),
          ...c.buy.map((b) => b.label),
        ]),
      ].join('\n');
      expect(text, g.slug).not.toMatch(MEDICAL);
      expect(text, g.slug).not.toMatch(RANKING);
    }
  });
  it('goal descriptions say "marketed for … support", not efficacy', () => {
    for (const g of graph.goals)
      expect(g.shortDescription).toMatch(/^Supplements marketed for .+ support\.$/);
  });
});

// ─── Filters ─────────────────────────────────────────────────────────────

describe('goal filters', () => {
  const c = (o: Partial<CardData> & { slug: string }): CardData => ({
    brand: 'B',
    name: o.slug,
    ingredients: [],
    veg: true,
    verified: true,
    evidence: false,
    perServing: null,
    ...o,
  });
  const cards = [
    c({ slug: 'a', brand: 'Zed', ingredients: ['magnesium'], perServing: 10 }),
    c({ slug: 'b', brand: 'Alpha', ingredients: ['ashwagandha'], veg: false, perServing: 30 }),
    c({ slug: 'c', brand: 'Mid', ingredients: ['magnesium'], verified: false, evidence: true }),
  ];
  const base = {
    ingredient: '',
    veg: false,
    verified: false,
    evidence: false,
    max: null,
    sort: 'az' as const,
  };
  it('default: all, alphabetical by brand', () =>
    expect(applyFilters(cards, base)).toEqual(['b', 'c', 'a']));
  it('ingredient', () =>
    expect(applyFilters(cards, { ...base, ingredient: 'magnesium' })).toEqual(['c', 'a']));
  it('vegetarian', () => expect(applyFilters(cards, { ...base, veg: true })).toEqual(['c', 'a']));
  it('label verified', () =>
    expect(applyFilters(cards, { ...base, verified: true })).toEqual(['b', 'a']));
  it('claims checked', () =>
    expect(applyFilters(cards, { ...base, evidence: true })).toEqual(['c']));
  it('max price excludes unknown prices', () =>
    expect(applyFilters(cards, { ...base, max: 20 })).toEqual(['a']));
  it('price sort only when chosen; unknown prices last', () =>
    expect(applyFilters(cards, { ...base, sort: 'price' })).toEqual(['a', 'b', 'c']));
});

// ─── Review & ingestion ──────────────────────────────────────────────────

describe('goal review', () => {
  const rel = (o: Record<string, unknown> = {}) => ({
    _id: 'productGoal.x',
    _type: 'productGoal',
    status: 'CANDIDATE',
    sourceUrl: 'https://example.com',
    goal: { _ref: 'goal.sleep' },
    ...o,
  });
  const ctx = {
    goalIds: ['goal.sleep', 'goal.stress'],
    reviewer: 'Editor',
    now: '2026-09-29T00:00:00Z',
  };
  it('approve needs a reviewer and a source; only candidates', () => {
    expect(planGoalDecision(rel(), { action: 'approve' }, { ...ctx, reviewer: ' ' }).ok).toBe(
      false,
    );
    expect(planGoalDecision(rel({ sourceUrl: undefined }), { action: 'approve' }, ctx).ok).toBe(
      false,
    );
    expect(planGoalDecision(rel({ status: 'REJECTED' }), { action: 'approve' }, ctx).ok).toBe(
      false,
    );
    expect(planGoalDecision(rel(), { action: 'approve' }, ctx)).toEqual({
      ok: true,
      ops: [
        {
          patch: {
            id: 'productGoal.x',
            set: { status: 'APPROVED', reviewedBy: 'Editor', reviewedAt: ctx.now },
          },
        },
      ],
    });
  });
  it('change goal re-assigns as an editorial classification', () => {
    const p = planGoalDecision(rel(), { action: 'change', goalId: 'goal.stress' }, ctx);
    expect(p.ok && p.ops[0]).toMatchObject({
      patch: {
        set: {
          status: 'APPROVED',
          basis: 'EDITORIAL_CLASSIFICATION',
          goal: { _ref: 'goal.stress' },
        },
      },
    });
    expect(planGoalDecision(rel(), { action: 'change', goalId: 'goal.nope' }, ctx).ok).toBe(false);
  });
  it('reject needs a reason', () => {
    expect(planGoalDecision(rel(), { action: 'reject', reason: '' }, ctx).ok).toBe(false);
    expect(
      planGoalDecision(
        rel({ status: 'APPROVED' }),
        { action: 'reject', reason: 'Not marketed for this' },
        ctx,
      ).ok,
    ).toBe(true);
  });
  it('research goal suggestions become CANDIDATES, never approved', () => {
    const docs = goalCandidatesFromSuggestions(
      {
        _id: 'candidate.x',
        _type: 'ingestionCandidate',
        sourceUrl: 'https://brand.example/p',
        goalSuggestions: [
          {
            goalSlug: 'sleep',
            basis: 'BRAND_MARKETING',
            statement: 'Sleep Support',
            sourceLocator: 'Store product tag',
          },
          { goalSlug: 'pcos' },
        ],
      },
      'product.x',
      { sleep: 'goal.sleep' },
    );
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      status: 'CANDIDATE',
      basis: 'BRAND_MARKETING',
      goal: { _ref: 'goal.sleep' },
    });
    expect(docs[0]!.reviewedBy).toBeUndefined();
  });
});

describe('research feed adapter', () => {
  const feed = {
    products: [
      {
        id: 1,
        title: 'Melatonin 3 mg Chewables | Tablets | Sleep',
        handle: 'melatonin',
        body_html: '<p>Contains 3mg of melatonin per tablet.</p>',
        vendor: 'Brand',
        product_type: 'Sleep Support',
        tags: ['Sleep Support'],
        variants: [
          { id: 1, title: 'Default Title', price: '285.00', compare_at_price: '345.00', sku: null },
        ],
        images: [{ src: 'https://cdn.example/m.jpg' }],
      },
      {
        id: 2,
        title: 'Magnesium Glycinate 1000 mg',
        handle: 'mg',
        body_html: '',
        vendor: 'Brand',
        product_type: 'Hormonal Balance',
        tags: [],
        variants: [
          { id: 2, title: 'Pack of 1', price: '499.00', compare_at_price: null, sku: null },
        ],
        images: [],
      },
      {
        id: 3,
        title: 'Sleep Bundle',
        handle: 'bundle',
        body_html: '',
        vendor: 'Brand',
        product_type: '',
        tags: [],
        variants: [],
        images: [],
      },
    ] as ShopifyProduct[],
  };
  const src = {
    id: 'demo',
    name: 'Demo brand',
    domain: 'brand.example',
    accessMode: 'BRAND_PERMISSION',
    permissionVerified: true,
    permissionRecord: 'assetPermission.demo',
  };
  it('refuses a permitted mode whose written permission is not verified', () => {
    expect(() =>
      extractShopifyFeed(feed, { ...src, permissionVerified: false }, '2026-09-29T00:00:00Z'),
    ).toThrow(/not verified/);
  });
  it('refuses sources whose terms do not permit collection', () => {
    for (const accessMode of ['NOT_PERMITTED', 'MANUAL_RESEARCH', 'USER_SUBMITTED_LABEL'])
      expect(() =>
        extractShopifyFeed(feed, { ...src, accessMode }, '2026-09-29T00:00:00Z'),
      ).toThrow(/does not permit/);
  });
  it('extracts unverified facts with provenance; no elemental computed; bundles skipped', () => {
    const out = extractShopifyFeed(feed, src, '2026-09-29T00:00:00Z');
    expect(out.products).toHaveLength(2);
    expect(out.skipped.map((s) => s.handle)).toEqual(['bundle']);
    const [mel, mg] = out.products.map((p) => p.candidate);
    expect(mel!.sourceUrl).toBe('https://brand.example/products/melatonin');
    expect(mel!.facts.every((f) => f.verificationStatus === 'unverified')).toBe(true);
    expect(mel!.facts.filter((f) => f.field === 'mrp').map((f) => f.value)).toEqual(['₹345.00']);
    expect(mel!.goalSuggestions.map((g) => g.goalSlug)).toEqual(['sleep']);
    // "1000 mg magnesium glycinate" stays a compound figure; no elemental anywhere.
    expect(
      mg!.facts.filter((f) => f.field === 'ingredient_amount').map((f) => [f.label, f.value]),
    ).toEqual([['Magnesium Glycinate', '1000 mg']]);
    expect(JSON.stringify(out)).not.toMatch(/elemental/i);
    // Sensitive category → no goal suggestion.
    expect(mg!.goalSuggestions).toEqual([]);
    // Images are references only.
    expect(out.products[0]!.snapshot.images).toEqual([
      expect.objectContaining({
        sourceUrl: 'https://cdn.example/m.jpg',
        depictsExactProduct: 'UNCONFIRMED',
      }),
    ]);
  });
  it('title amounts are read exactly as stated', () => {
    expect(titleAmounts('CoQ10 100 mg + Omega-3 Fish Oil')).toEqual([
      { label: 'CoQ10', value: '100 mg' },
    ]);
    expect(titleAmounts('Vitamin D3 2000 IU Chewables')).toEqual([
      { label: 'Vitamin D3', value: '2000 IU' },
    ]);
  });
});

describe('goal sitemap', () => {
  it('only published, reviewed, non-demo goals with a non-demo published product', async () => {
    // Demo data never enters the sitemap.
    expect(goalSitemapPaths(graph)).toEqual([]);
    const real = await withDocs((docs) =>
      docs.map((d) =>
        [
          'goal.hydration',
          'goal.energy',
          'product.specimen-electrolyte',
          'brand.specimen',
        ].includes(d._id)
          ? { ...d, isDemo: false }
          : d,
      ),
    );
    expect(goalSitemapPaths(real).map((x) => x.path)).toEqual(['/hydration']); // energy is empty
  });
});

describe('search', () => {
  it('published goals are searchable; drafts are not', () => {
    const idx = buildSearchIndex(graph);
    const goals = idx.filter((d) => d.type === 'goal');
    expect(goals.map((d) => d.url)).toContain('/sleep');
    expect(goals.map((d) => d.url)).not.toContain('/focus');
    expect(goals.find((d) => d.url === '/hair-skin')!.keywords).toContain('hair skin');
  });
});
