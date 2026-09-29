import { beforeAll, describe, expect, it } from 'vitest';
import { applyListing, type ListingCard } from '@/components/catalogue/listing-filters';
import { demoDataset } from '@/fixtures/index.ts';
import type { RawDoc } from '@/fixtures/helpers.ts';
import {
  assembleGraph,
  forProduction,
  type ContentGraph,
  type RawContent,
} from '@/lib/content/repository';
import { buildSearchIndex } from '@/lib/search/build-index';
import { loadGraph, runGroq } from '@/test/graph-loader';
import {
  BRANDS_QUERY,
  CATEGORIES_QUERY,
  COMPARISONS_QUERY,
  GOALS_QUERY,
  GUIDES_QUERY,
  INGREDIENTS_QUERY,
  PRODUCT_GOALS_QUERY,
  PRODUCTS_QUERY,
  REVIEWERS_QUERY,
} from '@/lib/content/queries';
import { ingredientListing, listingIngredients, productDimensions } from './consumer';

let graph: ContentGraph;
beforeAll(async () => {
  graph = await loadGraph(demoDataset as RawDoc[]);
});
const now = new Date('2026-09-29T12:00:00Z');
const mg = () =>
  ingredientListing(
    graph,
    graph.ingredients.find((i) => i.slug === 'magnesium')!,
    now,
  );
const card = (part: string) => mg().cards.find((c) => c.slug.includes(part))!;

describe('ingredient listing (consumer comparison)', () => {
  it('lists every published product containing the ingredient, and only those', () => {
    expect(
      mg()
        .cards.map((c) => c.slug)
        .sort(),
    ).toEqual([
      'sampleworks-magnesium-oxide-400mg-tablets',
      'specimen-nutrition-electrolyte-drink-mix-lemon',
      'specimen-nutrition-magnesium-citrate-b6-capsules',
      'testbed-sports-magnesium-bisglycinate-capsules',
    ]);
    expect(listingIngredients(graph).every((i) => i.products.length > 0)).toBe(true);
  });

  it('facets are data-driven: only filters that split these products', () => {
    const f = mg().facets;
    expect(f.forms).toEqual(['Magnesium bisglycinate', 'Magnesium citrate', 'Magnesium oxide']);
    expect(f.elemental).toEqual({ unit: 'mg', range: { min: 50, max: 140 }, sortable: true });
    // Oxide, citrate and bisglycinate: compound weights of different forms are
    // not comparable, so no compound sort or filter is offered.
    expect(f.compound).toMatchObject({
      kind: 'compound',
      sortable: false,
      range: null,
      form: null,
    });
    expect(f).toMatchObject({ veg: true, verified: true, price: true, single: true });
    expect(f.brands.length).toBeGreaterThanOrEqual(2);
    // A single-product ingredient offers no nonsensical filters.
    const d3 = ingredientListing(
      graph,
      graph.ingredients.find((i) => i.slug === 'vitamin-d3')!,
      now,
    ).facets;
    expect(d3).toMatchObject({
      forms: [],
      elemental: null,
      veg: false,
      verified: false,
      brands: [],
      single: false,
    });
  });

  it('never compares a compound weight with an elemental amount', () => {
    // Oxide declares only a compound weight → no comparable (elemental) amount.
    expect(card('oxide').elementalValue).toBeNull();
    expect(card('oxide').compoundValue).toBe(400);
    expect(card('bisglycinate').elementalValue).toBe(140);
    const order = applyListing(mg().cards.map(toListing), { ...base, sort: 'elemental' });
    expect(order.at(-1)).toBe('sampleworks-magnesium-oxide-400mg-tablets');
    expect(order[0]).toBe('testbed-sports-magnesium-bisglycinate-capsules');
  });

  it('match is explained by named factors; no score', () => {
    const bis = card('bisglycinate').match;
    expect(bis.level).toBe('Strong match');
    expect(bis.factors.map((f) => [f.ok, f.text])).toEqual([
      [true, 'Contains magnesium'],
      [true, 'Amount disclosed'],
      [true, 'Label verified'],
      [true, 'Price observed'],
      [true, 'Vegetarian'],
    ]);
    expect(card('citrate').match).toMatchObject({ level: 'Good match' });
    expect(card('citrate').match.factors).toContainEqual({ ok: false, text: 'No price observed' });
    expect(card('citrate').match.factors).toContainEqual({
      ok: null,
      text: 'Also contains Vitamin B6',
    });
    expect(card('oxide').match.factors).toContainEqual({
      ok: false,
      text: 'Label not verified (artwork only)',
    });
    expect(JSON.stringify(mg())).not.toMatch(/"score"|\/10|\bbest\b|\bworst\b|#1/i);
  });

  it('primary amount: elemental says elemental; compound names its form; missing says Not disclosed', () => {
    expect(card('bisglycinate').amounts).toEqual([
      { kind: 'compound', label: 'Magnesium (compound)', value: '1,000 mg magnesium bisglycinate' },
      { kind: 'elemental', label: 'Elemental magnesium', value: '140 mg' },
    ]);
    expect(card('oxide').amounts).toContainEqual({
      kind: 'elemental',
      label: 'Elemental magnesium',
      value: 'Not disclosed',
    });
  });

  it('price: observed with date, never invented', () => {
    expect(card('bisglycinate').price).toMatchObject({
      perServing: '₹29.97',
      observedAt: '22 Sept 2026',
    });
    expect(card('citrate').price).toBeNull();
  });

  it('buy links: merchant, affiliate marked, missing merchant → none', () => {
    expect(card('electrolyte').buy.map((b) => [b.merchant, b.affiliate])).toEqual([
      ['Specimen Nutrition store', false],
      ['Amazon.in', true],
    ]);
    expect(card('citrate').buy).toEqual([]);
  });

  it('no marketing copy or image URLs on cards', () => {
    const json = JSON.stringify(mg());
    expect(json).not.toContain('unauthorized-marketing-shot');
    // Cards carry no product description field at all.
    expect(mg().cards.every((c) => !('description' in c))).toBe(true);
  });
});

const toListing = (c: ReturnType<typeof mg>['cards'][number]): ListingCard => ({
  slug: c.slug,
  brand: c.brand,
  name: c.name,
  forms: c.forms,
  elemental: c.elementalValue,
  compound: c.compoundValue,
  veg: c.vegStatus === 'VEGETARIAN' || c.vegStatus === 'VEGAN',
  verified: c.labelVerified,
  evidence: c.claimsChecked > 0,
  single: c.others.length === 0,
  perServing: c.price?.perServingValue ?? null,
  matchRank: c.match.rank,
  verifiedAt: c.verifiedAt,
});
const base = {
  form: '',
  minElemental: null,
  maxElemental: null,
  minCompound: null,
  maxCompound: null,
  veg: false,
  verified: false,
  evidence: false,
  single: false,
  brand: '',
  maxPrice: null,
  sort: 'match' as const,
};

describe('listing filters & sorts', () => {
  const all = () => mg().cards.map(toListing);
  it('form filter', () =>
    expect(applyListing(all(), { ...base, form: 'Magnesium citrate' }).sort()).toEqual([
      'specimen-nutrition-electrolyte-drink-mix-lemon',
      'specimen-nutrition-magnesium-citrate-b6-capsules',
    ]));
  it('elemental range excludes products without a stated elemental amount', () => {
    expect(applyListing(all(), { ...base, minElemental: 100 }).sort()).toEqual([
      'specimen-nutrition-magnesium-citrate-b6-capsules',
      'testbed-sports-magnesium-bisglycinate-capsules',
    ]);
  });
  it('vegetarian / verified / single-ingredient', () => {
    expect(applyListing(all(), { ...base, veg: true })).not.toContain(
      'sampleworks-magnesium-oxide-400mg-tablets',
    );
    expect(applyListing(all(), { ...base, verified: true })).not.toContain(
      'sampleworks-magnesium-oxide-400mg-tablets',
    );
    expect(applyListing(all(), { ...base, single: true }).sort()).toEqual([
      'sampleworks-magnesium-oxide-400mg-tablets',
      'testbed-sports-magnesium-bisglycinate-capsules',
    ]);
  });
  it('price sort: lowest first, unknown last', () => {
    const order = applyListing(all(), { ...base, sort: 'price' });
    expect(order[0]).toBe('sampleworks-magnesium-oxide-400mg-tablets');
    expect(order.at(-1)).toBe('specimen-nutrition-magnesium-citrate-b6-capsules');
  });
  it('name sort: A–Z by product name', () => {
    const order = applyListing(all(), { ...base, sort: 'name' });
    const names = order.map((s) => all().find((c) => c.slug === s)!.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
  it('match sort: strong, then good, then limited; A–Z within', () => {
    const ranks = applyListing(all(), base).map((s) => all().find((c) => c.slug === s)!.matchRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe('amount sorts: explicit dimensions, missing values last', () => {
  const c = (slug: string, o: Partial<ListingCard>): ListingCard => ({
    slug,
    brand: 'B',
    name: slug,
    forms: [],
    elemental: null,
    compound: null,
    veg: false,
    verified: false,
    evidence: false,
    single: true,
    perServing: null,
    matchRank: 1,
    verifiedAt: null,
    ...o,
  });
  const set = [
    c('a', { elemental: 100, compound: 500 }),
    c('b', { elemental: null, compound: 1000 }),
    c('c', { elemental: 200, compound: null }),
    c('d', { elemental: 0, compound: 250, perServing: 5 }),
    c('e', { perServing: 2 }),
  ];
  it('elemental: highest first, a stated 0 is a value, missing last', () => {
    expect(applyListing(set, { ...base, sort: 'elemental' })).toEqual(['c', 'a', 'd', 'b', 'e']);
  });
  it('compound: highest first, missing last; never uses elemental figures', () => {
    expect(applyListing(set, { ...base, sort: 'compound' })).toEqual(['b', 'a', 'd', 'c', 'e']);
  });
  it('price: lowest first, missing last', () => {
    expect(applyListing(set, { ...base, sort: 'price' })).toEqual(['e', 'd', 'a', 'b', 'c']);
  });
  it('compound range filter only uses compound values', () => {
    expect(applyListing(set, { ...base, minCompound: 400 }).sort()).toEqual(['a', 'b']);
    expect(applyListing(set, { ...base, maxElemental: 150 }).sort()).toEqual(['a', 'd']);
  });
});

describe('decomposed dimensions (no overall score)', () => {
  it('each dimension has its own factual value', () => {
    const bis = graph.products.find((p) => p.slug.includes('bisglycinate'))!;
    expect(productDimensions(bis, now).map((d) => [d.label, d.value])).toEqual([
      ['Ingredient disclosure', 'Full'],
      ['Label verification', 'Verified'],
      ['Evidence review', 'No claims reviewed yet'],
      ['Serving clarity', 'Clear'],
      ['Price transparency', 'Observed 22 Sept 2026'],
      ['Open discrepancies', '0'],
      ['Vegetarian status', 'Vegetarian'],
      ['Source freshness', 'Label captured 22 Sept 2026'],
    ]);
  });
  it('stale prices and open discrepancies are flagged, not scored', () => {
    const whey = graph.products.find((p) => p.slug.includes('whey-protein-concentrate'))!;
    const later = productDimensions(whey, new Date('2026-12-31T00:00:00Z'));
    expect(later.find((d) => d.key === 'price')).toMatchObject({
      state: 'attention',
      value: expect.stringContaining('older than 30 days'),
    });
    expect(later.find((d) => d.key === 'discrepancies')).toMatchObject({
      value: '1',
      state: 'attention',
    });
    expect(JSON.stringify(later)).not.toMatch(/score|\/10|grade|rank/i);
  });
});

describe('production read model: demo can never leak', () => {
  let raw: RawContent;
  beforeAll(async () => {
    const q = <T>(query: string) => runGroq<T>(query, demoDataset as RawDoc[]);
    raw = {
      products: await q(PRODUCTS_QUERY),
      ingredients: await q(INGREDIENTS_QUERY),
      guides: await q(GUIDES_QUERY),
      comparisons: await q(COMPARISONS_QUERY),
      brands: await q(BRANDS_QUERY),
      categories: await q(CATEGORIES_QUERY),
      reviewers: await q(REVIEWERS_QUERY),
      goals: await q(GOALS_QUERY),
      productGoals: await q(PRODUCT_GOALS_QUERY),
    } as RawContent;
  });
  it('strips every demo document from every collection', () => {
    const g = assembleGraph(forProduction(raw));
    expect(g.products).toEqual([]);
    expect(g.ingredients).toEqual([]);
    expect(g.goals).toEqual([]);
    expect(g.brands).toEqual([]);
    expect(g.reviewers.some((r) => r.isPlaceholder)).toBe(false);
    expect(buildSearchIndex(g)).toEqual([]);
  });
  it('a real product reviewed only by the placeholder reviewer is not published', () => {
    const realButPlaceholderReviewed = raw.products.map((p) => ({ ...p, isDemo: false }));
    const brands = raw.brands.map((b) => ({ ...b, isDemo: false }));
    const g = assembleGraph(
      forProduction({ ...raw, products: realButPlaceholderReviewed, brands }),
    );
    expect(g.products).toEqual([]);
  });
  it('real, really-reviewed products survive', () => {
    const products = raw.products.map((p) => ({
      ...p,
      isDemo: false,
      reviews: p.reviews.map((r) => ({ ...r, reviewer: { ...r.reviewer, isPlaceholder: false } })),
    }));
    const brands = raw.brands.map((b) => ({ ...b, isDemo: false }));
    const g = assembleGraph(forProduction({ ...raw, products, brands }));
    expect(g.products.length).toBe(raw.products.filter((p) => p.reviews.length).length);
  });
});
