import { evaluate, parse } from 'groq-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { demoDataset } from '@/fixtures/index.ts';
import type { RawDoc } from '@/fixtures/helpers.ts';
import {
  amountPerServingFor,
  isPriceStale,
  latestPricesByMerchant,
  productCosts,
  referencePrice,
} from '@/lib/calculations';
import { productHistory } from '@/lib/editorial/product';
import { latestReview, reviewState } from '@/lib/editorial/review';
import { buildSearchIndex } from '@/lib/search/build-index';
import { createLocalEngine } from '@/lib/search/engine';
import { productPage } from '@/lib/seo/jsonld';
import {
  BRANDS_QUERY,
  CATEGORIES_QUERY,
  COMPARISONS_QUERY,
  GUIDES_QUERY,
  INGREDIENTS_QUERY,
  PRODUCTS_QUERY,
  REVIEWERS_QUERY,
} from './queries';
import { assembleGraph, type ContentGraph, type RawContent } from './repository';
import type { DoseBasis, ProductDetail } from './types';

/**
 * End-to-end tests of the content layer: the real GROQ queries evaluated by
 * groq-js over the demo dataset, then the real graph assembly.
 */

async function run<T>(query: string, dataset: RawDoc[]): Promise<T> {
  const value = await evaluate(parse(query), { dataset });
  return (await value.get()) as T;
}

async function load(dataset: RawDoc[]): Promise<ContentGraph> {
  const raw: RawContent = {
    products: await run(PRODUCTS_QUERY, dataset),
    ingredients: await run(INGREDIENTS_QUERY, dataset),
    guides: await run(GUIDES_QUERY, dataset),
    comparisons: await run(COMPARISONS_QUERY, dataset),
    brands: await run(BRANDS_QUERY, dataset),
    categories: await run(CATEGORIES_QUERY, dataset),
    reviewers: await run(REVIEWERS_QUERY, dataset),
  };
  return assembleGraph(raw);
}

let graph: ContentGraph;
const product = (id: string): ProductDetail => {
  const p = graph.products.find((x) => x._id === id);
  if (!p) throw new Error(`missing ${id}`);
  return p;
};
const NOW = new Date('2026-09-28T00:00:00Z');

beforeAll(async () => {
  graph = await load(demoDataset);
});

describe('content graph', () => {
  it('loads every live demo product and resolves relationships', () => {
    expect(graph.products).toHaveLength(11);
    const creatine = graph.ingredients.find((i) => i.slug === 'creatine-monohydrate')!;
    expect(creatine.products.map((p) => p._id).sort()).toEqual([
      'product.sampleworks-creatine',
      'product.specimen-creatine',
      'product.testbed-creatine-caps',
    ]);
    expect(product('product.specimen-creatine').comparisons.map((c) => c.slug)).toContain(
      'creatine-cost-per-5g',
    );
  });

  it('never renders content without an approved review, or not in a live status', async () => {
    const extra: RawDoc[] = [
      {
        ...(demoDataset.find((d) => d._id === 'product.specimen-creatine') as RawDoc),
        _id: 'product.unreviewed',
        slug: { _type: 'slug', current: 'unreviewed' },
      },
      {
        ...(demoDataset.find((d) => d._id === 'product.specimen-whey') as RawDoc),
        _id: 'product.draft',
        workflowStatus: 'DRAFT',
        slug: { _type: 'slug', current: 'draft' },
      },
      {
        _id: 'review.draft',
        _type: 'editorialReview',
        content: { _type: 'reference', _ref: 'product.draft', _weak: true },
        reviewer: { _type: 'reference', _ref: 'reviewer.demo' },
        reviewedAt: '2026-09-01T00:00:00Z',
        nextReviewAt: '2027-09-01T00:00:00Z',
        status: 'approved',
        scope: 'dietitian_review',
      },
      {
        _id: 'claim.unassessed',
        _type: 'claim',
        product: { _type: 'reference', _ref: 'product.specimen-creatine' },
        exactClaim: 'Unreviewed claim',
        claimType: 'other',
        assessment: 'x',
        assessmentStatus: 'supported',
        workflowStatus: 'PUBLISHED',
      },
    ];
    const g = await load([...demoDataset, ...extra]);
    const ids = g.products.map((p) => p._id);
    expect(ids).not.toContain('product.unreviewed');
    expect(ids).not.toContain('product.draft');
    const claims = g.products.find((p) => p._id === 'product.specimen-creatine')!.claims;
    expect(claims.map((c) => c.exactClaim)).not.toContain('Unreviewed claim');
  });
});

describe('label versions and reformulation', () => {
  it('keeps the superseded label and claim without affecting current values', () => {
    const p = product('product.specimen-creatine');
    expect(p.panels.filter((x) => !x.isCurrent)).toHaveLength(1);
    const basis = {
      kind: 'ingredient',
      ingredient: {
        _id: 'ingredient.creatine-monohydrate',
        name: 'Creatine monohydrate',
        slug: 'creatine-monohydrate',
      },
      nutrientKey: null,
      amount: 5,
      unit: 'g',
      label: 'per 5 g creatine',
    } satisfies DoseBasis;
    // Current label is 5 g/serving; the superseded 3 g panel must not leak in.
    expect(amountPerServingFor(p.panels, basis)).toEqual({ amount: 5, unit: 'g' });
    const old = p.claims.find((c) => c.status === 'superseded');
    expect(old?.exactClaim).toBe('3g pure creatine in every scoop');
    expect(p.keyActives.every((r) => r.amountPerServing === 5)).toBe(true);
  });

  it('records the change in the audit history, with provenance', () => {
    const history = productHistory(product('product.specimen-creatine'));
    expect(
      history.some((e) => e.kind === 'superseded' && e.text.includes('3g pure creatine')),
    ).toBe(true);
    expect(history.some((e) => e.text.startsWith('Label change'))).toBe(true);
    const obs = history.find((e) => e.kind === 'observation');
    expect(obs?.detail).toMatch(/^By /);
    // Dates are newest first.
    const dates = history.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('uses each price snapshot’s own servings, so old-pack prices stay correct', () => {
    const p = product('product.specimen-creatine');
    const june = p.prices.find((s) => s.capturedAt.startsWith('2026-06'))!;
    const cost = productCosts(p, june).perServing;
    expect(cost.ok && cost.value.amount).toBeCloseTo(849 / 83, 4);
  });
});

describe('missing data and edge states', () => {
  it('product with no price and servings not printed', () => {
    const p = product('product.sampleworks-whey');
    expect(p.prices).toHaveLength(0);
    expect(referencePrice(p)).toBeNull();
    const c = productCosts(p, null);
    expect(c.perServing).toEqual({ ok: false, reason: 'missing_price' });
    expect(c.servings).toEqual({ ok: false, reason: 'missing_servings' });
  });

  it('unknown veg status is explained, never inferred', () => {
    const p = product('product.sampleworks-whey');
    expect(p.vegStatus).toBe('UNKNOWN');
    expect(p.vegStatusReason.length).toBeGreaterThan(20);
  });

  it('every non-unknown veg status is backed by a current label observation', () => {
    for (const p of graph.products.filter((x) => x.vegStatus !== 'UNKNOWN')) {
      const support = p.observations.filter(
        (o) => (o.type === 'veg_mark' || o.type === 'ingredient_presence') && !o.supersededAt,
      );
      expect(support.length, p._id).toBeGreaterThan(0);
    }
  });

  it('overdue review is flagged', () => {
    expect(reviewState(product('product.sampleworks-whey'), NOW)).toBe('due');
    expect(reviewState(product('product.specimen-whey'), NOW)).toBe('current');
  });

  it('proprietary blend hides per-ingredient amounts from dose calculations', () => {
    const p = product('product.sampleworks-whey');
    const rows = p.panels.flatMap((x) => x.ingredients).filter((r) => r.proprietaryBlend);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.amountPerServing === null)).toBe(true);
    const whey = {
      kind: 'ingredient',
      ingredient: { _id: 'ingredient.whey-protein', name: 'Whey protein', slug: 'whey-protein' },
      nutrientKey: null,
      amount: 25,
      unit: 'g',
      label: '',
    } satisfies DoseBasis;
    expect(amountPerServingFor(p.panels, whey)).toBeNull();
    // …but the declared protein nutrient still supports cost per 25 g protein.
    const protein = {
      ...whey,
      kind: 'nutrient',
      ingredient: null,
      nutrientKey: 'protein',
    } satisfies DoseBasis;
    expect(amountPerServingFor(p.panels, protein)).toEqual({ amount: 25, unit: 'g' });
  });

  it('reference price: latest per merchant, lowest per serving, skips out-of-stock', () => {
    const p = product('product.specimen-whey');
    expect(latestPricesByMerchant(p.prices)).toHaveLength(3);
    expect(referencePrice(p)?.merchant.slug).toBe('healthkart');
  });

  it('flags stale prices', () => {
    const snap = product('product.testbed-creatine-caps').prices[0]!;
    expect(isPriceStale(snap, NOW)).toBe(true);
    expect(isPriceStale(product('product.testbed-d3').prices[0]!, NOW)).toBe(false);
  });

  it('prefers the dietitian review for "Reviewed by"', () => {
    expect(latestReview(product('product.specimen-whey'))?.scope).toBe('dietitian_review');
  });
});

describe('structured data safety', () => {
  const FORBIDDEN = [
    'aggregateRating',
    'review',
    'offers',
    'Review',
    'AggregateRating',
    'Offer',
    'MedicalCondition',
  ];
  const walk = (v: unknown, found: string[] = []): string[] => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, found));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN.includes(k)) found.push(k);
        if (k === '@type' && typeof x === 'string' && FORBIDDEN.includes(x)) found.push(x);
        walk(x, found);
      }
    }
    return found;
  };

  it('never emits ratings, reviews or offers', () => {
    for (const p of graph.products) expect(walk(productPage(p)), p._id).toEqual([]);
  });

  it('does not attribute a review to a placeholder reviewer', () => {
    const page = productPage(product('product.specimen-whey'));
    const webPage = page.find((n) => n['@type'] === 'WebPage')!;
    expect(webPage.reviewedBy).toBeUndefined();
    expect(webPage.lastReviewed).toBeUndefined();
  });

  it('emits Product only for products with a captured label', () => {
    for (const p of graph.products) {
      const hasProduct = productPage(p).some((n) => n['@type'] === 'Product');
      expect(hasProduct).toBe(p.panels.some((x) => x.isCurrent));
    }
  });
});

describe('search index', () => {
  it('indexes every entity type and finds products by ingredient', () => {
    const index = buildSearchIndex(graph);
    expect(new Set(index.map((d) => d.type))).toEqual(
      new Set(['product', 'ingredient', 'brand', 'guide', 'comparison']),
    );
    // Label names ("cholecalciferol") find both the ingredient and the product.
    const urls = createLocalEngine(index)
      .search('cholecalciferol')
      .map((h) => h.doc.url);
    expect(urls).toContain('/ingredients/vitamin-d3');
    expect(urls).toContain('/products/testbed-sports-vitamin-d3-2000-iu-softgels');
  });
});

describe('ingestion boundaries in the content graph', () => {
  it('ingested candidates and unverified extracted facts never reach published content', () => {
    // The demo candidate contains an AI-extracted claim ("Builds lean muscle fast")
    // and a rejected veg marker; neither may appear anywhere in the site graph.
    const json = JSON.stringify(graph);
    expect(json).not.toContain('Builds lean muscle fast');
    expect(json).not.toContain('candidate.demo');
    // A different-flavour listing flagged as a possible match does not create a product.
    expect(graph.products.map((p) => p.name)).not.toContain('Whey Protein Concentrate, Vanilla');
  });

  it('an extracted claim cannot become published without editorial approval', async () => {
    const draftFromIngestion: RawDoc = {
      _id: 'claim.from-ingestion',
      _type: 'claim',
      product: { _type: 'reference', _ref: 'product.specimen-whey' },
      exactClaim: 'Builds lean muscle fast',
      claimType: 'performance',
      assessment: 'pending',
      assessmentStatus: 'requires_context',
      sources: [{ _key: 'a', _type: 'reference', _ref: 'source.label.specimen-whey' }],
      workflowStatus: 'DRAFT',
    };
    const approvedButUnreviewed = {
      ...draftFromIngestion,
      _id: 'claim.b',
      workflowStatus: 'PUBLISHED',
    };
    const g = await load([...demoDataset, draftFromIngestion, approvedButUnreviewed]);
    const claims = g.products.find((p) => p._id === 'product.specimen-whey')!.claims;
    expect(claims.map((c) => c.exactClaim)).not.toContain('Builds lean muscle fast');
  });

  it('observations from ingested data need a named verifier', async () => {
    const unverified: RawDoc = {
      _id: 'observation.unverified-ingest',
      _type: 'observation',
      product: { _type: 'reference', _ref: 'product.specimen-whey' },
      type: 'serving_size',
      value: 'UNVERIFIED serving',
      source: { _type: 'reference', _ref: 'source.label.specimen-whey' },
      extractedFrom: { _type: 'reference', _ref: 'candidate.demo-brand-whey-choc' },
      observedAt: '2026-09-18T12:00:00Z',
    };
    const g = await load([...demoDataset, unverified]);
    const obs = g.products.find((p) => p._id === 'product.specimen-whey')!.observations;
    expect(obs.map((o) => o.value)).not.toContain('UNVERIFIED serving');
    // The verified one, with its snapshot provenance, is present.
    const verified = obs.find((o) => o._id === 'observation.specimen-whey.pack-size-ingested');
    expect(verified?.verifiedBy).toBeTruthy();
    expect(verified?.snapshot?.url).toMatch(/^https:\/\/specimen\.example\//);
  });

  it('missing provenance fails safe: unsourced facts are not rendered', async () => {
    const id = 'product.specimen-whey';
    const unsourced: RawDoc[] = [
      {
        _id: 'observation.nosource',
        _type: 'observation',
        product: { _type: 'reference', _ref: id },
        type: 'serving_size',
        value: 'NO SOURCE',
        observedAt: '2026-09-20T00:00:00Z',
      },
      {
        _id: 'panel.nosource',
        _type: 'labelPanel',
        product: { _type: 'reference', _ref: id },
        panelType: 'other',
        title: 'NO SOURCE PANEL',
        status: 'current',
        capturedAt: '2026-09-20T00:00:00Z',
      },
      {
        _id: 'price.nosource',
        _type: 'priceSnapshot',
        product: { _type: 'reference', _ref: id },
        merchant: { _type: 'reference', _ref: 'merchant.flipkart' },
        price: 1,
        currency: 'INR',
        packSize: { amount: 1, unit: 'kg' },
        capturedAt: '2026-09-27T00:00:00Z',
      },
      {
        _id: 'claim.nosource',
        _type: 'claim',
        product: { _type: 'reference', _ref: id },
        exactClaim: 'NO SOURCE CLAIM',
        claimType: 'other',
        assessment: 'x',
        assessmentStatus: 'supported',
        workflowStatus: 'PUBLISHED',
        reviewer: { _type: 'reference', _ref: 'reviewer.demo' },
        reviewedAt: '2026-09-20T00:00:00Z',
      },
    ];
    const g = await load([...demoDataset, ...unsourced]);
    const p = g.products.find((x) => x._id === id)!;
    expect(p.observations.map((o) => o.value)).not.toContain('NO SOURCE');
    expect(p.panels.map((x) => x.title)).not.toContain('NO SOURCE PANEL');
    expect(p.prices.map((x) => x._id)).not.toContain('price.nosource');
    expect(p.claims.map((c) => c.exactClaim)).not.toContain('NO SOURCE CLAIM');
  });

  it('two external references resolve to one canonical product', async () => {
    const refs = await run<Array<{ product: { _ref: string }; dataSource: { _ref: string } }>>(
      '*[_type == "productReference" && product._ref == "product.specimen-whey"]',
      demoDataset,
    );
    expect(refs).toHaveLength(2);
    expect(new Set(refs.map((r) => r.dataSource._ref)).size).toBe(2);
    expect(
      graph.products.filter(
        (p) => p.brand.slug === 'specimen-nutrition' && p.name.startsWith('Whey'),
      ),
    ).toHaveLength(1);
  });

  it('prices from different merchants stay separate, dated snapshots', () => {
    const prices = product('product.specimen-whey').prices;
    const byMerchant = new Map(prices.map((s) => [s.merchant.slug, s]));
    expect([...byMerchant.keys()].sort()).toEqual(['amazon-in', 'flipkart', 'healthkart']);
    expect(new Set(prices.map((s) => s.price)).size).toBe(3);
    const amazon = byMerchant.get('amazon-in')!;
    expect(amazon.mrp).toBe(2799);
    expect(amazon.sourceUrl).toMatch(/^https:\/\//);
  });

  it('a reformulated product keeps its historical claim linked to its original observation', async () => {
    const p = product('product.specimen-creatine');
    const old = p.claims.find((c) => c.status === 'superseded')!;
    expect(old.observedAt?.startsWith('2026-02-10')).toBe(true);
    const raw = await run<{ observation: { _ref: string } }>(
      '*[_id == "claim.specimen-creatine.3g-2026-02"][0]{ observation }',
      demoDataset,
    );
    const obs = p.observations.find((o) => o._id === raw.observation._ref)!;
    expect(obs.supersededAt).toBeTruthy();
    expect(obs.value).toContain('3g pure creatine');
    // The current claim is untouched.
    expect(
      p.claims.find((c) => c.status === 'current' && c.exactClaim === '5g creatine per serving'),
    ).toBeTruthy();
  });
});
