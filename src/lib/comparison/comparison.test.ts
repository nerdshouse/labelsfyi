import { beforeAll, describe, expect, it } from 'vitest';
import { demoDataset } from '@/fixtures/index.ts';
import type { RawDoc } from '@/fixtures/helpers.ts';
import type { ContentGraph } from '@/lib/content/repository';
import type { DiscrepancyData, LabelIngredientRow } from '@/lib/content/types';
import { panelEvidence } from '@/lib/editorial/evidence';
import { keyPerServing } from '@/lib/editorial/product';
import { loadGraph } from '@/test/graph-loader';
import { costPerStandardAmount, pricePer100MgElemental } from './derive';
import { discrepancyView, openDiscrepancyCount } from './discrepancy';
import { productDecoder } from './decoder';
import { ingredientAmounts, totalFor } from './ingredients';
import { searchProducts } from './search';

let graph: ContentGraph;
beforeAll(async () => {
  graph = await loadGraph(demoDataset);
});
const product = (g: ContentGraph, id: string) => g.products.find((p) => p._id === id)!;
const ref = (id: string) => ({ _type: 'reference', _ref: id });

const baseRow: LabelIngredientRow = {
  _key: 'r',
  ingredient: { _id: 'ingredient.magnesium', name: 'Magnesium', slug: 'magnesium' },
  displayName: 'Magnesium',
  amount: null,
  unit: null,
  amountPerServing: null,
  dailyValue: null,
  dailyValuePercent: null,
  proprietaryBlend: false,
  blendName: null,
  orderOnLabel: 1,
  isKeyActive: true,
  observation: null,
  editorialNote: null,
  form: 'Magnesium bisglycinate',
  compoundAmount: null,
  compoundUnit: null,
  elementalAmount: null,
  elementalUnit: null,
  elementalBasis: null,
  sourceLocator: null,
};

describe('ingredient normalisation', () => {
  it('compound amount only → elemental UNKNOWN (null), never derived', () => {
    const a = ingredientAmounts({ ...baseRow, compoundAmount: 1000, compoundUnit: 'mg' });
    expect(a).toMatchObject({ compound: { amount: 1000, unit: 'mg' }, elemental: null });
  });
  it('elemental amount only', () => {
    const a = ingredientAmounts({
      ...baseRow,
      elementalAmount: 220,
      elementalUnit: 'mg',
      elementalBasis: 'label_declared',
    });
    expect(a).toMatchObject({ compound: null, elemental: { amount: 220, unit: 'mg' } });
  });
  it('both, kept separate', () => {
    const a = ingredientAmounts({
      ...baseRow,
      compoundAmount: 1000,
      compoundUnit: 'mg',
      elementalAmount: 220,
      elementalUnit: 'mg',
      elementalBasis: 'label_declared',
    });
    expect(a.compound?.amount).toBe(1000);
    expect(a.elemental?.amount).toBe(220);
  });
  it('an elemental figure without a declared basis is not trusted', () => {
    expect(
      ingredientAmounts({ ...baseRow, elementalAmount: 220, elementalUnit: 'mg' }).elemental,
    ).toBeNull();
  });
  it('sums across rows with different units; unknown if any row is missing', () => {
    const rows = [
      {
        ...baseRow,
        elementalAmount: 0.1,
        elementalUnit: 'g' as const,
        elementalBasis: 'label_declared' as const,
      },
      {
        ...baseRow,
        _key: 'r2',
        elementalAmount: 50,
        elementalUnit: 'mg' as const,
        elementalBasis: 'label_declared' as const,
      },
    ];
    const total = totalFor(rows, 'ingredient.magnesium', 'elemental');
    expect(total?.unit).toBe('g');
    expect(total?.amount).toBeCloseTo(0.15, 10);
    expect(
      totalFor([...rows, { ...baseRow, _key: 'r3' }], 'ingredient.magnesium', 'elemental'),
    ).toBeNull();
  });
});

describe('derived comparison values', () => {
  it('₹500/serving with 220 mg elemental → ₹227.27 per 100 mg elemental', () => {
    const r = costPerStandardAmount(
      { amount: 500, currency: 'INR' },
      { amount: 220, unit: 'mg' },
      { amount: 100, unit: 'mg' },
    );
    expect(r?.amount).toBeCloseTo(227.27, 2);
  });
  it('returns null when elemental is unknown; never uses the compound weight', () => {
    expect(
      costPerStandardAmount({ amount: 500, currency: 'INR' }, null, { amount: 100, unit: 'mg' }),
    ).toBeNull();
    const oxide = product(graph, 'product.sampleworks-magnesium-oxide');
    expect(pricePer100MgElemental(oxide, 'ingredient.magnesium')).toBeNull();
  });
  it('computes per-elemental cost when the label declares it', () => {
    // ₹899 / 30 servings = ₹29.97 per serving; 140 mg elemental → ₹21.40 per 100 mg.
    const bis = product(graph, 'product.testbed-magnesium-bisglycinate');
    expect(pricePer100MgElemental(bis, 'ingredient.magnesium')?.amount).toBeCloseTo(21.405, 2);
  });
});

describe('per-serving summary line', () => {
  it('never presents a compound weight as the elemental ingredient', () => {
    expect(keyPerServing(product(graph, 'product.testbed-magnesium-bisglycinate'))).toEqual([
      '140 mg elemental magnesium (from 1,000 mg magnesium bisglycinate)',
    ]);
    expect(keyPerServing(product(graph, 'product.sampleworks-magnesium-oxide'))).toEqual([
      '400 mg magnesium oxide',
    ]);
  });
});

describe('searchProducts("magnesium")', () => {
  it('returns comparison-ready rows with facts, not scores', () => {
    const rows = searchProducts(graph, 'magnesium');
    expect(rows.map((r) => r.product._id)).toEqual([
      'product.specimen-electrolyte',
      'product.testbed-magnesium-bisglycinate',
      'product.specimen-magnesium-citrate-b6',
      'product.sampleworks-magnesium-oxide',
    ]);
    const [, bis, , oxide] = rows;
    expect(bis).toMatchObject({
      form: 'Magnesium bisglycinate',
      compoundAmount: { amount: 1000, unit: 'mg' },
      elementalAmount: { amount: 140, unit: 'mg' },
      serving: { count: 2, unit: 'capsule' },
      labelVerification: 'label_verified',
      vegStatus: 'VEGETARIAN',
    });
    expect(oxide).toMatchObject({
      form: 'Magnesium oxide',
      compoundAmount: { amount: 400, unit: 'mg' },
      elementalAmount: null,
      pricePer100MgElemental: null,
      labelVerification: 'artwork_only',
    });
    for (const r of rows) {
      expect(Object.keys(r).some((k) => /score|rank|best|rating/i.test(k))).toBe(false);
    }
  });
  it('matches ingredient forms and label names too', () => {
    // The form resolves to the ingredient, so every magnesium product is returned.
    expect(searchProducts(graph, 'bisglycinate').length).toBe(4);
    expect(searchProducts(graph, 'cholecalciferol')[0]?.product._id).toBe('product.testbed-d3');
  });
});

describe('product decoder shape', () => {
  it('exposes every layer for the product page', () => {
    const d = productDecoder(product(graph, 'product.specimen-whey'));
    expect(Object.keys(d)).toEqual([
      'identity',
      'serving',
      'ingredients',
      'labelEvidence',
      'websiteObservations',
      'packObservations',
      'claims',
      'discrepancies',
      'priceHistory',
      'editorialReview',
    ]);
    expect(d.serving.spec).toEqual({ count: 1, unit: 'scoop', mass: 33, massUnit: 'g' });
    expect(d.discrepancies[0]?.view).toMatchObject({
      status: 'OPEN',
      isOpen: true,
      hasBrandResponse: false,
    });
    expect(d.packObservations.length).toBeGreaterThan(0);
    expect(d.websiteObservations.map((o) => o.sourceType)).toContain('BRAND_WEBSITE');
  });
});

// ─── Discrepancies & brand responses ──────────────────────────────────────

const TEST_REVIEW = {
  reviewer: ref('reviewer.demo'),
  reviewedAt: '2026-09-25T00:00:00Z',
  workflowStatus: 'PUBLISHED',
};
const value = (k: string, sourceType: string, v: string) => ({
  _key: k,
  _type: 'discrepancyValue',
  sourceType,
  value: v,
  locator: `${sourceType} locator`,
});
const disc = (id: string, values: unknown[], over: Record<string, unknown> = {}): RawDoc => ({
  _id: id,
  _type: 'discrepancy',
  product: ref('product.testbed-d3'),
  field: 'Vitamin D3 per softgel',
  values,
  status: 'OPEN',
  severity: 'MATERIAL',
  detectedAt: '2026-09-25T00:00:00Z',
  detectedBy: 'test',
  ...TEST_REVIEW,
  ...over,
});

describe('discrepancies', () => {
  it('website vs pack, website vs marketplace and three-source conflicts keep every original value', async () => {
    const g = await loadGraph([
      ...demoDataset,
      disc('d.web-pack', [
        value('a', 'BRAND_WEBSITE', '2500 IU'),
        value('b', 'PHYSICAL_PACK', '2000 IU'),
      ]),
      disc(
        'd.web-market',
        [value('a', 'BRAND_WEBSITE', '60 softgels'), value('b', 'MARKETPLACE', '90 softgels')],
        { field: 'Pack size' },
      ),
      disc(
        'd.three',
        [
          value('a', 'BRAND_WEBSITE', '₹449'),
          value('b', 'MARKETPLACE', '₹399'),
          value('c', 'PHYSICAL_PACK', 'MRP ₹499'),
        ],
        { field: 'Price/MRP', severity: 'INFORMATIONAL' },
      ),
    ]);
    const ds = product(g, 'product.testbed-d3').discrepancies;
    expect(ds.find((d) => d._id === 'd.web-pack')!.values.map((v) => v.value)).toEqual([
      '2500 IU',
      '2000 IU',
    ]);
    expect(ds.find((d) => d._id === 'd.web-market')!.values.map((v) => v.sourceType)).toEqual([
      'BRAND_WEBSITE',
      'MARKETPLACE',
    ]);
    expect(ds.find((d) => d._id === 'd.three')!.values).toHaveLength(3);
  });

  it('resolved vs unresolved', () => {
    const mk = (status: DiscrepancyData['status']): DiscrepancyData => ({
      _id: status,
      field: 'f',
      values: [],
      status,
      severity: 'MATERIAL',
      detectedAt: '',
      notes: null,
      resolvedAt: null,
      resolutionNote: null,
      brandResponses: [],
    });
    expect(discrepancyView(mk('RESOLVED')).isOpen).toBe(false);
    expect(discrepancyView(mk('UNRESOLVED')).isOpen).toBe(true);
    expect(
      openDiscrepancyCount([mk('RESOLVED'), mk('OPEN'), mk('SUPERSEDED'), mk('AWAITING_BRAND')]),
    ).toBe(2);
  });

  it('unreviewed, draft or single-value discrepancies are not published', async () => {
    const g = await loadGraph([
      ...demoDataset,
      disc('d.noreview', [value('a', 'BRAND_WEBSITE', 'x'), value('b', 'PHYSICAL_PACK', 'y')], {
        reviewer: undefined,
      }),
      disc('d.draft', [value('a', 'BRAND_WEBSITE', 'x'), value('b', 'PHYSICAL_PACK', 'y')], {
        workflowStatus: 'DRAFT',
      }),
      disc('d.single', [value('a', 'BRAND_WEBSITE', 'x')]),
    ]);
    expect(product(g, 'product.testbed-d3').discrepancies).toHaveLength(0);
  });
});

describe('brand responses', () => {
  const response = (over: Record<string, unknown> = {}): RawDoc => ({
    _id: 'br.1',
    _type: 'brandResponse',
    product: ref('product.testbed-d3'),
    discrepancy: ref('d.1'),
    contactedAt: '2026-09-25T00:00:00Z',
    contactMethod: 'email',
    question: 'Which value is current?',
    response: 'The pack is correct.',
    respondedAt: '2026-09-26T00:00:00Z',
    respondentRole: 'Quality team',
    supportingSources: [{ _key: 's', ...ref('source.label.testbed-d3') }],
    resolution: 'LABEL_CONFIRMED',
    ...TEST_REVIEW,
    ...over,
  });
  const d1 = disc(
    'd.1',
    [value('a', 'BRAND_WEBSITE', '2500 IU'), value('b', 'PHYSICAL_PACK', '2000 IU')],
    { status: 'BRAND_RESPONDED' },
  );

  it('attaches to its discrepancy, preserves supporting sources and does not resolve it', async () => {
    const g = await loadGraph([...demoDataset, d1, response()]);
    const d = product(g, 'product.testbed-d3').discrepancies[0]!;
    expect(d.brandResponses).toHaveLength(1);
    expect(d.brandResponses[0]!.supportingSources[0]!._id).toBe('source.label.testbed-d3');
    expect(d.brandResponses[0]!.resolution).toBe('LABEL_CONFIRMED');
    // A brand's "resolution" is provenance; the discrepancy status is unchanged.
    expect(discrepancyView(d)).toMatchObject({
      status: 'BRAND_RESPONDED',
      isOpen: true,
      awaitingEditorialDecision: true,
    });
  });

  it('an unreviewed brand response is not published', async () => {
    const g = await loadGraph([...demoDataset, d1, response({ reviewer: undefined })]);
    expect(product(g, 'product.testbed-d3').discrepancies[0]!.brandResponses).toHaveLength(0);
  });
});

// ─── Publishing safety for the new models ────────────────────────────────

describe('publishing rules are not bypassed by the new models', () => {
  const panelFor = (id: string, over: Record<string, unknown>): RawDoc => ({
    _id: id,
    _type: 'labelPanel',
    product: ref('product.testbed-d3'),
    panelType: 'other',
    title: id,
    status: 'current',
    capturedAt: '2026-09-27T00:00:00Z',
    capturedBy: 'test',
    source: ref('source.label.testbed-d3'),
    ...over,
  });
  const snapshotRef = (key: string) => ({
    snapshot: ref('snapshot.demo-sampleworks-magnesium'),
    imageKey: key,
  });

  it('label panels need acceptable label evidence', async () => {
    const g = await loadGraph([
      ...demoDataset,
      panelFor('p.website', { sourceType: 'BRAND_WEBSITE' }),
      panelFor('p.marketing', { sourceType: 'MARKETING_COPY' }),
      panelFor('p.untyped', {}),
      panelFor('p.unconfirmed', {
        sourceType: 'PRODUCT_ARTWORK',
        sourceImage: snapshotRef('img-front'),
      }),
      panelFor('p.sibling', {
        sourceType: 'PRODUCT_ARTWORK',
        sourceImage: snapshotRef('img-sibling'),
      }),
      panelFor('p.artwork-no-image', { sourceType: 'PRODUCT_ARTWORK' }),
      panelFor('p.confirmed-artwork', {
        sourceType: 'PRODUCT_ARTWORK',
        sourceImage: snapshotRef('img-facts'),
      }),
    ]);
    const titles = product(g, 'product.testbed-d3').panels.map((p) => p.title);
    for (const rejected of [
      'p.website',
      'p.marketing',
      'p.untyped',
      'p.unconfirmed',
      'p.sibling',
      'p.artwork-no-image',
    ]) {
      expect(titles).not.toContain(rejected);
    }
    expect(titles).toContain('p.confirmed-artwork');
  });

  it('image classification maps to evidence strength', () => {
    const img = (imageKind: string, depictsExactProduct: string) =>
      panelEvidence({
        sourceType: 'PRODUCT_ARTWORK',
        imageEvidence: { url: null, imageKind, depictsExactProduct } as never,
      });
    expect(img('PACK_PHOTO', 'CONFIRMED')).toBe('strong');
    expect(img('PRINT_ARTWORK', 'CONFIRMED')).toBe('provisional');
    expect(img('MARKETING_GRAPHIC', 'CONFIRMED')).toBe('rejected');
    expect(img('RETYPESET_TABLE', 'CONFIRMED')).toBe('rejected');
    expect(img('PACK_PHOTO', 'UNCONFIRMED')).toBe('rejected');
    expect(img('PACK_PHOTO', 'NOT_THIS_PRODUCT')).toBe('rejected');
  });

  it('observations must be verified; claims must have completed evidence research', async () => {
    const g = await loadGraph([
      ...demoDataset,
      {
        _id: 'o.unverified',
        _type: 'observation',
        product: ref('product.testbed-d3'),
        type: 'other',
        value: 'UNVERIFIED',
        source: ref('source.label.testbed-d3'),
        observedAt: '2026-09-27T00:00:00Z',
        verificationStatus: 'unverified',
      },
      {
        _id: 'c.needs-evidence',
        _type: 'claim',
        product: ref('product.testbed-d3'),
        exactClaim: 'Fast acting',
        claimType: 'performance',
        assessment: 'x',
        assessmentStatus: 'requires_context',
        sources: [{ _key: 'a', ...ref('source.ods-vitamin-d') }],
        researchStatus: 'NEEDS_EVIDENCE',
        ...TEST_REVIEW,
      },
    ]);
    const p = product(g, 'product.testbed-d3');
    expect(p.observations.map((o) => o.value)).not.toContain('UNVERIFIED');
    expect(p.claims.map((c) => c.exactClaim)).not.toContain('Fast acting');
  });

  it('a product still needs an approved review even with verified label data', async () => {
    const withoutReviews = demoDataset.filter(
      (d) =>
        !(
          d._type === 'editorialReview' &&
          (d.content as { _ref: string })._ref === 'product.testbed-magnesium-bisglycinate'
        ),
    );
    const g = await loadGraph(withoutReviews);
    expect(g.products.map((p) => p._id)).not.toContain('product.testbed-magnesium-bisglycinate');
  });
});
