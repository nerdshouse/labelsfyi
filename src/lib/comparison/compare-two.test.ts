import { beforeAll, describe, expect, it } from 'vitest';
import { demoDataset } from '@/fixtures/index.ts';
import type { RawDoc } from '@/fixtures/helpers.ts';
import type { ContentGraph } from '@/lib/content/repository';
import { loadGraph } from '@/test/graph-loader';
import {
  canonicalPair,
  compareLabels,
  comparePath,
  pairCandidates,
  resolvePair,
  type LabelComparison,
} from './compare-two';
import { labelFacts, type ActiveFact, type LabelFacts } from './label-facts';

// ─── Helpers ─────────────────────────────────────────────────────────────

let graph: ContentGraph;
beforeAll(async () => {
  graph = await loadGraph(demoDataset);
});
const BIS = 'testbed-sports-magnesium-bisglycinate-capsules';
const OXIDE = 'sampleworks-magnesium-oxide-400mg-tablets';
const CITRATE = 'specimen-nutrition-magnesium-citrate-b6-capsules';
const WHEY = 'specimen-nutrition-whey-protein-concentrate-rich-chocolate';
const WHEY_BLEND = 'sampleworks-whey-blend-french-vanilla';
const facts = (slug: string) => labelFacts(graph.products.find((p) => p.slug === slug)!);
const loaderFor = (g: ContentGraph) => async (slug: string) => {
  const p = g.products.find((x) => x.slug === slug);
  return p ? labelFacts(p) : null;
};

const mg = (amount: number) => ({ amount, unit: 'mg' as const });
const active = (o: Partial<ActiveFact> = {}): ActiveFact => ({
  key: 'ingredient.magnesium',
  ingredient: 'Magnesium',
  ingredientSlug: 'magnesium',
  printedName: 'Magnesium (as magnesium citrate)',
  form: 'Magnesium citrate',
  compound: mg(500),
  elemental: null,
  declared: mg(500),
  isKeyActive: true,
  blend: null,
  ...o,
});
const make = (o: Partial<LabelFacts> & { slug: string }): LabelFacts => ({
  v: 1,
  name: `Product ${o.slug.toUpperCase()}`,
  variant: null,
  brand: { name: 'Brand', slug: 'brand' },
  category: null,
  isDemo: true,
  serving: { count: 1, unit: 'capsule', mass: null, massUnit: null },
  servingText: '1 capsule',
  servingsPerPack: 60,
  actives: [active()],
  nutrients: [],
  price: null,
  evidence: {
    verification: 'label_verified',
    sourceType: 'PHYSICAL_PACK',
    labelCapturedAt: '2026-09-28T10:00:00Z',
    lastPackObservationAt: '2026-09-28T10:00:00Z',
  },
  discrepancies: [],
  ...o,
});
const diff = (c: LabelComparison, key: string) => c.differences.find((d) => d.key === key);
const row = (c: LabelComparison, key: string) => c.rows.find((r) => r.key === key);
const allText = (c: LabelComparison) =>
  [
    ...c.rows.flatMap((r) => [r.label, ...r.a, ...r.b]),
    ...c.differences.flatMap((d) => [d.heading, ...d.lines]),
    ...c.discrepancies.flatMap((d) => d.lines),
  ].join('\n');

// ─── Comparison logic ────────────────────────────────────────────────────

describe('compareLabels', () => {
  it('same product: no differences', () => {
    const c = compareLabels(facts(BIS), facts(BIS));
    expect(c.sameProduct).toBe(true);
    expect(c.differences).toEqual([]);
  });

  it('different products: identity rows and a canonical path', () => {
    const c = compareLabels(facts(CITRATE), facts(BIS));
    expect(row(c, 'brand')).toMatchObject({ a: ['Specimen Nutrition'], b: ['Testbed Sports'] });
    expect(c.path).toBe(`/compare/${CITRATE}-vs-${BIS}`);
    expect(c.sameProduct).toBe(false);
  });

  it('different forms are stated as declared forms', () => {
    const c = compareLabels(facts(CITRATE), facts(BIS));
    expect(diff(c, 'form')!.lines).toEqual([
      'Specimen Nutrition Magnesium Citrate + B6 Capsules declares magnesium citrate.',
      'Testbed Sports Magnesium Bisglycinate Capsules declares magnesium bisglycinate.',
    ]);
  });

  it('different compound amounts are always named with their form', () => {
    const c = compareLabels(facts(CITRATE), facts(BIS));
    expect(row(c, 'compound')).toMatchObject({
      a: ['500 mg magnesium citrate'],
      b: ['1,000 mg magnesium bisglycinate'],
    });
    expect(diff(c, 'compound')!.lines[1]).toBe(
      'Testbed Sports Magnesium Bisglycinate Capsules declares 1,000 mg magnesium bisglycinate per serving.',
    );
  });

  it('different elemental amounts are marked elemental', () => {
    const c = compareLabels(facts(CITRATE), facts(BIS));
    expect(row(c, 'elemental')).toMatchObject({
      label: 'Elemental magnesium / serving',
      a: ['100 mg elemental magnesium'],
      b: ['140 mg elemental magnesium'],
      differs: true,
    });
    expect(diff(c, 'elemental')!.lines).toEqual([
      'Specimen Nutrition Magnesium Citrate + B6 Capsules declares 100 mg elemental magnesium per serving.',
      'Testbed Sports Magnesium Bisglycinate Capsules declares 140 mg elemental magnesium per serving.',
    ]);
  });

  it('one elemental amount missing: "Not disclosed", never zero, never derived', () => {
    const c = compareLabels(facts(OXIDE), facts(BIS));
    expect(row(c, 'elemental')).toMatchObject({
      a: ['Not disclosed'],
      b: ['140 mg elemental magnesium'],
    });
    expect(diff(c, 'elemental')!.lines[0]).toBe(
      'No elemental magnesium amount is disclosed for Sampleworks Magnesium Oxide 400 mg Tablets in the compared label evidence.',
    );
    expect(allText(c)).not.toMatch(/\b0 mg elemental|400 mg (elemental )?magnesium(?! oxide)/);
  });

  it('both elemental amounts missing: no elemental row at all', () => {
    const a = make({ slug: 'a', actives: [active({ elemental: null })] });
    const b = make({
      slug: 'b',
      actives: [active({ form: 'Magnesium oxide', compound: mg(400), elemental: null })],
    });
    const c = compareLabels(a, b);
    expect(row(c, 'elemental')).toBeUndefined();
    expect(diff(c, 'elemental')).toBeUndefined();
  });

  it('never renders a compound weight as plain magnesium', () => {
    for (const x of graph.products)
      for (const y of graph.products) {
        const text = allText(compareLabels(labelFacts(x), labelFacts(y)));
        expect(text).not.toMatch(/1,000 mg magnesium(?! bisglycinate)/);
        expect(text).not.toMatch(/500 mg magnesium(?! citrate)/);
        expect(text).not.toMatch(/400 mg magnesium(?! oxide)/);
      }
  });

  it('different servings', () => {
    const c = compareLabels(facts(CITRATE), facts(BIS));
    expect(diff(c, 'serving')!.lines).toEqual([
      'Specimen Nutrition Magnesium Citrate + B6 Capsules uses 1 capsule per serving.',
      'Testbed Sports Magnesium Bisglycinate Capsules uses 2 capsules per serving.',
    ]);
  });

  it('additional active: declared on one label, amount not disclosed for the other', () => {
    const c = compareLabels(facts(CITRATE), facts(BIS));
    const d = diff(c, 'other:name:vitamin b6')!;
    expect(d.heading).toBe('Additional active: Vitamin B6');
    expect(d.lines).toEqual([
      'Specimen Nutrition Magnesium Citrate + B6 Capsules declares vitamin B6 (2 mg per serving).',
      'No vitamin B6 amount is disclosed for Testbed Sports Magnesium Bisglycinate Capsules in the compared label evidence.',
    ]);
    expect(row(c, 'others')).toMatchObject({ b: ['—'] });
  });

  it('a second row of the compared ingredient is not an "additional active"', () => {
    const c = compareLabels(facts(WHEY), facts(WHEY_BLEND));
    expect(c.differences.some((d) => d.key.startsWith('other:'))).toBe(false);
  });

  it('missing data stays missing (serving, servings per pack, form)', () => {
    const a = make({
      slug: 'a',
      serving: null,
      servingText: null,
      servingsPerPack: null,
      actives: [active({ form: null, compound: null })],
    });
    const b = make({ slug: 'b' });
    const c = compareLabels(a, b);
    expect(row(c, 'serving')).toMatchObject({ a: ['Not disclosed'], b: ['1 capsule'] });
    expect(row(c, 'servings')).toMatchObject({ a: ['Not printed'], b: ['60'] });
    expect(row(c, 'form')).toMatchObject({ a: ['Not stated'] });
    expect(diff(c, 'serving')!.lines[0]).toBe(
      'No serving size is disclosed for Brand Product A in the compared label evidence.',
    );
    expect(diff(c, 'compound')!.lines[0]).toBe(
      'No magnesium compound amount is disclosed for Brand Product A in the compared label evidence.',
    );
  });

  it('price present on both: dated observations, no direction words', () => {
    const c = compareLabels(facts(OXIDE), facts(BIS));
    expect(row(c, 'perServing')).toMatchObject({ a: ['₹5.82'], b: ['₹29.97'] });
    expect(row(c, 'price')!.a[0]).toMatch(/^₹349 at Flipkart, \d+ Sept 2026$/);
    expect(diff(c, 'price')!.lines.join(' ')).not.toMatch(
      /cheap|expensive|more|less|saves?|value/i,
    );
  });

  it('price missing: "No price observed", never an invented figure', () => {
    const c = compareLabels(facts(CITRATE), facts(BIS));
    expect(row(c, 'price')!.a).toEqual(['No price observed']);
    expect(row(c, 'perServing')!.a).toEqual(['Not available']);
    expect(diff(c, 'price')!.lines[0]).toBe(
      'No price has been observed for Specimen Nutrition Magnesium Citrate + B6 Capsules.',
    );
    const none = compareLabels(make({ slug: 'a' }), make({ slug: 'b' }));
    expect(row(none, 'price')).toBeUndefined();
  });

  it('open discrepancies are shown neutrally with sources', () => {
    const c = compareLabels(facts(WHEY_BLEND), facts(WHEY));
    expect(c.discrepancies).toHaveLength(1);
    expect(c.discrepancies[0]).toMatchObject({
      product: 'b',
      href: `/products/${WHEY}#sources-compared`,
    });
    expect(c.discrepancies[0]!.lines[0]).toMatch(
      /: the (brand website|physical label) and the (brand website|physical label) state different values\.$/,
    );
    expect(row(c, 'discrepancies')).toMatchObject({ a: ['None recorded'], b: ['1 open'] });
  });

  it('evidence stays per product, with real dates', () => {
    const c = compareLabels(facts(OXIDE), facts(BIS));
    expect(c.evidence.a).toMatchObject({ verification: 'Artwork only', source: 'Label artwork' });
    expect(c.evidence.b).toMatchObject({
      verification: 'Label verified',
      source: 'Pack',
      labelCapturedAt: '22 Sept 2026',
    });
    const noDates = compareLabels(
      make({
        slug: 'a',
        evidence: {
          verification: 'label_verified',
          sourceType: null,
          labelCapturedAt: null,
          lastPackObservationAt: null,
        },
      }),
      make({ slug: 'b' }),
    );
    expect(noDates.evidence.a).toMatchObject({
      labelCapturedAt: null,
      lastPackObservationAt: null,
    });
  });

  it('different key actives: stated, but their amounts are not compared', () => {
    const c = compareLabels(
      facts('specimen-nutrition-creatine-monohydrate-unflavoured'),
      facts(BIS),
    );
    expect(diff(c, 'active')!.lines[2]).toMatch(/not compared with each other/);
    expect(diff(c, 'compound')).toBeUndefined();
    expect(diff(c, 'elemental')).toBeUndefined();
  });
});

// ─── Language ────────────────────────────────────────────────────────────

describe('comparison language', () => {
  const BANNED =
    /\b(best|winner|better|worse|recommend(ed|s)?|score|scores|scoring|rank|ranking|ranked|top pick|superior|inferior|misleading|deceptive|fake|scam)\b/i;
  const FALSE_ABSENCE =
    /contains no|does not contain|doesn't contain|free (of|from)|without any|is absent|absent from|has no (vitamin|magnesium|protein|creatine)/i;

  it('no ranking or judgement words in any generated copy, for every product pair', () => {
    for (const x of graph.products)
      for (const y of graph.products) {
        const text = allText(compareLabels(labelFacts(x), labelFacts(y)));
        expect(text, `${x.slug} vs ${y.slug}`).not.toMatch(BANNED);
      }
  });

  it('absence of a disclosed amount is never stated as absence of the ingredient', () => {
    for (const x of graph.products)
      for (const y of graph.products) {
        const c = compareLabels(labelFacts(x), labelFacts(y));
        const text = allText(c);
        expect(text).not.toMatch(FALSE_ABSENCE);
        for (const line of c.differences.flatMap((d) => d.lines).filter((l) => /^No /.test(l)))
          expect(line).toMatch(
            /is disclosed for .+ in the compared label evidence\.$|has been observed|is identified/,
          );
      }
  });
});

// ─── URLs ────────────────────────────────────────────────────────────────

describe('comparison URLs', () => {
  it('canonical ordering is deterministic: A-vs-B and B-vs-A share one path', () => {
    expect(comparePath(BIS, OXIDE)).toBe(comparePath(OXIDE, BIS));
    expect(comparePath(BIS, OXIDE)).toBe(`/compare/${OXIDE}-vs-${BIS}`);
    expect(canonicalPair('b', 'a')).toEqual(['a', 'b']);
  });

  it('the reversed order redirects to the canonical URL', async () => {
    const r = await resolvePair(`${BIS}-vs-${OXIDE}`, loaderFor(graph));
    expect(r).toEqual({ kind: 'redirect', to: `/compare/${OXIDE}-vs-${BIS}` });
    const ok = await resolvePair(`${OXIDE}-vs-${BIS}`, loaderFor(graph));
    expect(ok.kind === 'ok' && [ok.a.slug, ok.b.slug]).toEqual([OXIDE, BIS]);
  });

  it('invalid product → not found', async () => {
    expect(await resolvePair(`${BIS}-vs-not-a-product`, loaderFor(graph))).toEqual({
      kind: 'not_found',
    });
    expect(await resolvePair('nothing-here', loaderFor(graph))).toEqual({ kind: 'not_found' });
  });

  it('self comparison → not found (no duplicate of the product page)', async () => {
    expect(await resolvePair(`${BIS}-vs-${BIS}`, loaderFor(graph))).toEqual({ kind: 'not_found' });
  });

  it('special characters and malformed slugs are rejected before any lookup', async () => {
    const seen: string[] = [];
    const spy = async (s: string) => (seen.push(s), null);
    for (const raw of [
      'A-vs-B',
      'a%20b-vs-c',
      'a b-vs-c',
      '../etc-vs-passwd',
      'a-vs-b/c',
      'é-vs-b',
      '-vs-b',
      'a-vs-',
      'a--b-vs-c',
      'x'.repeat(500) + '-vs-y',
      "a'-vs-b",
      'a<script>-vs-b',
    ])
      expect(pairCandidates(raw), raw).toEqual([]);
    await resolvePair('A-vs-B', spy);
    expect(seen).toEqual([]);
  });

  it('slugs that themselves contain "-vs-" resolve to the split whose products exist', async () => {
    expect(pairCandidates('x-vs-y-vs-z')).toEqual([
      ['x', 'y-vs-z'],
      ['x-vs-y', 'z'],
    ]);
    const lib: Record<string, LabelFacts> = {
      'x-vs-y': make({ slug: 'x-vs-y' }),
      z: make({ slug: 'z' }),
    };
    const r = await resolvePair('x-vs-y-vs-z', async (s) => lib[s] ?? null);
    expect(r.kind === 'ok' && [r.a.slug, r.b.slug]).toEqual(['x-vs-y', 'z']);
  });
});

// ─── Public visibility ───────────────────────────────────────────────────

describe('comparison visibility', () => {
  let gated: ContentGraph;
  beforeAll(async () => {
    const base = (demoDataset as RawDoc[]).find(
      (d) => d._id === 'product.testbed-magnesium-bisglycinate',
    )!;
    const variant = (id: string, slug: string, status: string): RawDoc => ({
      ...base,
      _id: id,
      slug: { _type: 'slug', current: slug },
      name: `Secret ${status} product`,
      workflowStatus: status,
    });
    gated = await loadGraph([
      ...(demoDataset as RawDoc[]),
      variant('product.secret-draft', 'secret-draft-product', 'DRAFT'),
      variant('product.secret-factcheck', 'secret-factcheck-product', 'FACT_CHECK'),
      variant('product.secret-approved', 'secret-approved-product', 'APPROVED'),
    ]);
  });

  it('draft, FACT_CHECK and unapproved products are not in the published graph', () => {
    for (const slug of [
      'secret-draft-product',
      'secret-factcheck-product',
      'secret-approved-product',
    ])
      expect(
        gated.products.some((p) => p.slug === slug),
        slug,
      ).toBe(false);
  });

  it('an unpublished product cannot be compared, in either order', async () => {
    for (const slug of [
      'secret-draft-product',
      'secret-factcheck-product',
      'secret-approved-product',
    ]) {
      expect(await resolvePair(`${slug}-vs-${BIS}`, loaderFor(gated))).toEqual({
        kind: 'not_found',
      });
      expect(await resolvePair(`${BIS}-vs-${slug}`, loaderFor(gated))).toEqual({
        kind: 'not_found',
      });
    }
  });

  it('nothing about an unpublished product leaks into a published comparison', async () => {
    const r = await resolvePair(`${OXIDE}-vs-${BIS}`, loaderFor(gated));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok')
      expect(JSON.stringify(compareLabels(r.a, r.b))).not.toMatch(/Secret|secret-/);
  });

  it('published products compare correctly', async () => {
    const r = await resolvePair(`${CITRATE}-vs-${BIS}`, loaderFor(gated));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(compareLabels(r.a, r.b).differences.length).toBeGreaterThan(0);
  });
});
