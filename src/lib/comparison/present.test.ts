import { beforeAll, describe, expect, it } from 'vitest';
import { demoDataset } from '@/fixtures/index.ts';
import type { RawDoc } from '@/fixtures/helpers.ts';
import type { ContentGraph } from '@/lib/content/repository';
import { loadGraph } from '@/test/graph-loader';
import { productDecoder } from './decoder';
import {
  NOT_DISCLOSED,
  presentAmountSplit,
  presentComparisonRow,
  presentDiscrepancies,
  presentIngredients,
  presentObservationGroups,
  showsElemental,
} from './present';
import { compareIngredient, searchProducts } from './search';

let graph: ContentGraph;
beforeAll(async () => {
  graph = await loadGraph(demoDataset);
});
const product = (g: ContentGraph, id: string) => g.products.find((p) => p._id === id)!;
const ref = (id: string) => ({ _type: 'reference', _ref: id });
const BIS = 'product.testbed-magnesium-bisglycinate';
const OXIDE = 'product.sampleworks-magnesium-oxide';

describe('comparison table views', () => {
  it('shows compound and elemental as separate values', () => {
    const v = presentComparisonRow(
      searchProducts(graph, 'magnesium').find((r) => r.product._id === BIS)!,
    );
    expect(v.compound).toBe('1,000 mg');
    expect(v.elemental).toBe('140 mg');
    expect(v.form).toBe('Magnesium bisglycinate');
    expect(v.pricePer100MgElemental).toBe('₹21.40');
  });

  it('missing elemental stays "Not disclosed"; the compound weight is never shown as elemental', () => {
    const v = presentComparisonRow(
      searchProducts(graph, 'magnesium').find((r) => r.product._id === OXIDE)!,
    );
    expect(v.compound).toBe('400 mg');
    expect(v.elemental).toBe(NOT_DISCLOSED);
    expect(v.pricePer100MgElemental).toBe('Elemental amount not disclosed');
    expect(v.pricePerServing).toBe('₹5.82');
  });

  it('price per elemental amount explains a missing price', () => {
    const row = {
      ...compareIngredient(graph, 'ingredient.magnesium')[0]!,
      price: null,
      pricePerServing: null,
      pricePer100MgElemental: null,
    };
    const v = presentComparisonRow(row);
    expect(v.pricePerServing).toBe('No price observed');
    expect(v.pricePer100MgElemental).toBe('No price observed');
    expect(v.filter.pricePerServing).toBeNull();
  });

  it('views carry facts only: no score, rank, winner or best', () => {
    for (const r of searchProducts(graph, 'magnesium')) {
      const json = JSON.stringify(presentComparisonRow(r)).toLowerCase();
      expect(json).not.toMatch(/\b(score|rank|ranking|winner|best|rating)\b/);
    }
  });

  it('rows are alphabetical, independent of price or dose', () => {
    const names = compareIngredient(graph, 'ingredient.magnesium').map((r) => r.product.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('elemental column only where meaningful', () => {
    expect(showsElemental(compareIngredient(graph, 'ingredient.magnesium'))).toBe(true);
    expect(showsElemental(compareIngredient(graph, 'ingredient.creatine-monohydrate'))).toBe(false);
  });

  it('discrepancy indicator counts open differences', () => {
    const whey = compareIngredient(graph, 'ingredient.whey-protein').find(
      (r) => r.product._id === 'product.specimen-whey',
    )!;
    expect(presentComparisonRow(whey).discrepancies).toEqual({
      count: 1,
      label: '1 open difference',
    });
  });
});

describe('product decoder views', () => {
  it('at-a-glance split for compound vs elemental', () => {
    expect(presentAmountSplit(productDecoder(product(graph, BIS)))).toEqual({
      ingredient: 'Magnesium',
      form: 'Magnesium bisglycinate',
      compound: '1,000 mg',
      elemental: '140 mg',
    });
    expect(presentAmountSplit(productDecoder(product(graph, OXIDE)))).toMatchObject({
      compound: '400 mg',
      elemental: NOT_DISCLOSED,
    });
    // Products without a compound/elemental split don't get the block.
    expect(
      presentAmountSplit(productDecoder(product(graph, 'product.specimen-creatine'))),
    ).toBeNull();
  });

  it("what's-inside rows keep form, compound, elemental and basis separate", () => {
    const [row] = presentIngredients(productDecoder(product(graph, BIS)));
    expect(row).toMatchObject({
      name: 'Magnesium',
      form: 'Magnesium bisglycinate',
      compound: '1,000 mg',
      elemental: '140 mg',
      elementalBasis: 'Declared on label',
    });
    const [oxide] = presentIngredients(productDecoder(product(graph, OXIDE)));
    expect(oxide).toMatchObject({ elemental: NOT_DISCLOSED, elementalBasis: null });
  });

  it('observations are grouped by source with attribution', () => {
    const groups = presentObservationGroups(
      productDecoder(product(graph, 'product.specimen-whey')),
    );
    expect(groups.map((g) => g.key)).toEqual(['pack', 'website', 'marketplace']);
    const website = groups.find((g) => g.key === 'website')!.items[0]!;
    expect(website).toMatchObject({
      sourceKind: 'Brand website',
      verifiedBy: 'labels.fyi editorial (demo)',
    });
    expect(website.locator).toContain('statutory details block');
  });

  it('decoder output for a product with a discrepancy', () => {
    const d = productDecoder(product(graph, 'product.specimen-whey'));
    const [disc] = presentDiscrepancies(d.discrepancies);
    expect(disc).toMatchObject({
      field: 'Serving size (scoop weight)',
      status: 'Open',
      severity: 'Material',
      isOpen: true,
    });
    expect(disc!.values.map((v) => [v.source, v.value])).toEqual([
      ['Brand website', '1 scoop (30 g)'],
      ['Pack', '1 scoop (33 g)'],
    ]);
  });
});

describe('reviewed vs unreviewed content, and brand-response privacy', () => {
  const REVIEWED = {
    reviewer: ref('reviewer.demo'),
    reviewedAt: '2026-09-25T00:00:00Z',
    workflowStatus: 'PUBLISHED',
  };
  const discrepancy = (id: string, over: Record<string, unknown> = {}): RawDoc => ({
    _id: id,
    _type: 'discrepancy',
    product: ref(OXIDE),
    field: 'Magnesium oxide per tablet',
    values: [
      { _key: 'a', _type: 'discrepancyValue', sourceType: 'BRAND_WEBSITE', value: '500 mg' },
      { _key: 'b', _type: 'discrepancyValue', sourceType: 'PRODUCT_ARTWORK', value: '400 mg' },
    ],
    status: 'AWAITING_BRAND',
    severity: 'MATERIAL',
    detectedAt: '2026-09-25T00:00:00Z',
    detectedBy: 'test',
    ...REVIEWED,
    ...over,
  });
  const response: RawDoc = {
    _id: 'br.test',
    _type: 'brandResponse',
    product: ref(OXIDE),
    discrepancy: ref('d.reviewed'),
    contactedAt: '2026-09-25T00:00:00Z',
    contactMethod: 'email',
    contactAddress: 'quality@brand.example',
    respondentName: 'Private Person',
    respondentRole: 'Quality team',
    question: 'Which is current?',
    response: 'The label is current.',
    respondedAt: '2026-09-26T00:00:00Z',
    resolution: 'LABEL_CONFIRMED',
    supportingSources: [],
    ...REVIEWED,
  };

  it('renders only reviewed discrepancies, and never exposes internal contact details', async () => {
    const g = await loadGraph([
      ...demoDataset,
      discrepancy('d.reviewed'),
      discrepancy('d.unreviewed', { reviewer: undefined }),
      response,
    ]);
    const d = productDecoder(product(g, OXIDE));
    expect(d.discrepancies.map((x) => x._id)).toEqual(['d.reviewed']);
    const presented = JSON.stringify(presentDiscrepancies(d.discrepancies));
    expect(presented).toContain('The label is current.');
    expect(presented).toContain('Label confirmed');
    expect(presented).not.toContain('quality@brand.example');
    expect(presented).not.toContain('Private Person');
    // Not even in the read model.
    expect(JSON.stringify(d.discrepancies)).not.toMatch(/quality@brand\.example|Private Person/);
    // A brand's stated resolution does not change labels.fyi's status.
    expect(presentDiscrepancies(d.discrepancies)[0]).toMatchObject({
      status: 'Awaiting brand',
      isOpen: true,
      awaitingEditorialDecision: true,
    });
  });
});
