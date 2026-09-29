import { beforeAll, describe, expect, it } from 'vitest';
import { demoDataset } from '@/fixtures/index.ts';
import type { RawDoc } from '@/fixtures/helpers.ts';
import type { ContentGraph } from '@/lib/content/repository';
import { loadGraph } from '@/test/graph-loader';
import { validateSubmission } from '@/components/submit/submit-form';
import { buildReceipt, isReceiptEligible } from './receipt';

let graph: ContentGraph;
beforeAll(async () => {
  graph = await loadGraph(demoDataset);
});
const product = (g: ContentGraph, id: string) => g.products.find((p) => p._id === id)!;
const receipt = (id: string, g = graph) => buildReceipt(product(g, id))!;
const ref = (id: string) => ({ _type: 'reference', _ref: id });
const BIS = 'product.testbed-magnesium-bisglycinate';
const OXIDE = 'product.sampleworks-magnesium-oxide';

describe('Supplement Receipt presenter', () => {
  it('uses the product slug for a stable receipt URL', () => {
    const r = receipt(BIS);
    expect(r.slug).toBe('testbed-sports-magnesium-bisglycinate-capsules');
    expect(r.href).toBe('/receipt/testbed-sports-magnesium-bisglycinate-capsules');
    expect(r.productHref).toBe('/products/testbed-sports-magnesium-bisglycinate-capsules');
  });

  it('keeps compound and elemental separate and named', () => {
    const lp = receipt(BIS).labelPanel!;
    expect(lp).toMatchObject({
      hasSplit: true,
      form: 'Magnesium bisglycinate',
      compound: '1,000 mg magnesium bisglycinate',
      elemental: '140 mg magnesium',
      elementalBasis: 'Declared on label',
    });
    expect(receipt(BIS).meaning).toBe(
      '1,000 mg is the weight of magnesium bisglycinate. The label declares 140 mg of elemental magnesium in it.',
    );
  });

  it('missing elemental stays "Not disclosed" and is never calculated', () => {
    const r = receipt(OXIDE);
    expect(r.labelPanel).toMatchObject({
      compound: '400 mg magnesium oxide',
      elemental: 'Not disclosed',
      elementalBasis: null,
    });
    expect(r.meaning).toContain('does not declare how much elemental magnesium');
    expect(r.checks.find((c) => c.label === 'Elemental amount declared')).toMatchObject({
      value: 'No',
      state: 'not_disclosed',
    });
  });

  it('never renders a compound weight as plain elemental/ingredient amount', () => {
    for (const p of graph.products) {
      const r = buildReceipt(p);
      if (!r) continue;
      const json = JSON.stringify(r);
      expect(json, p._id).not.toMatch(/1,000 mg magnesium(?! bisglycinate)/);
      expect(json, p._id).not.toMatch(/400 mg (elemental )?magnesium(?! oxide)/);
    }
  });

  it('products without a compound/elemental split show the declared amount, not "Not disclosed" compound', () => {
    const lp = receipt('product.specimen-creatine').labelPanel!;
    expect(lp).toMatchObject({
      hasSplit: false,
      active: 'Creatine monohydrate',
      declared: '5 g creatine monohydrate',
    });
  });

  it('front of pack only from a verified pack observation, quoted verbatim', () => {
    expect(receipt('product.specimen-creatine').frontOfPack).toMatchObject({
      text: '5g creatine per serving',
    });
    // No front-label observation → null. Never invented from the panel or a claim.
    expect(receipt(BIS).frontOfPack).toBeNull();
    expect(receipt(OXIDE).frontOfPack).toBeNull();
  });

  it('ignores unsupported front-of-pack wording (unverified, web-sourced or superseded)', async () => {
    const obs = (id: string, over: Record<string, unknown>): RawDoc => ({
      _id: id,
      _type: 'observation',
      product: ref(BIS),
      type: 'front_label_claim',
      source: ref('source.label.testbed-magnesium'),
      observedAt: '2026-09-28T00:00:00Z',
      observedBy: 'test',
      verificationStatus: 'verified',
      sourceType: 'PHYSICAL_PACK',
      ...over,
    });
    const g = await loadGraph([
      ...demoDataset,
      obs('o.unverified', {
        value: 'Front label states "500 mg magnesium".',
        verificationStatus: 'unverified',
      }),
      obs('o.website', {
        value: 'Front label states "Max strength 2000 mg".',
        sourceType: 'BRAND_WEBSITE',
      }),
      obs('o.superseded', {
        value: 'Front label states "Old claim".',
        supersededAt: '2026-09-28T01:00:00Z',
      }),
    ]);
    expect(receipt(BIS, g).frontOfPack).toBeNull();
  });

  it('shows price only from a real observation', () => {
    expect(receipt(BIS).price).toMatchObject({
      pack: '₹899',
      merchant: 'Amazon.in',
      perServing: '₹29.97',
    });
    expect(receipt('product.sampleworks-whey').price).toBeNull();
  });

  it('keeps source attribution', () => {
    expect(receipt(BIS).evidence).toMatchObject({
      verification: 'Label verified',
      sourceKind: 'Pack',
      sourceTitle: 'Testbed Sports Magnesium Bisglycinate, bottle label (demo)',
      labelCapturedAt: '22 Sept 2026',
      reviewerIsPlaceholder: true,
    });
    expect(receipt(OXIDE).evidence).toMatchObject({
      verification: 'Artwork only',
      sourceKind: 'Label artwork',
    });
  });

  it('flags demo data', () => {
    expect(receipt(BIS).isDemo).toBe(true);
  });

  it('contains no ranking, score, "best" or recommendation language', () => {
    for (const p of graph.products) {
      const r = buildReceipt(p);
      if (!r) continue;
      expect(JSON.stringify(r).toLowerCase()).not.toMatch(
        /\b(best|winner|score|rank|ranking|rating|recommend|top pick|you think you)\b/,
      );
    }
  });

  it('is only built for products with acceptable label evidence', async () => {
    const withoutPanels = demoDataset.filter(
      (d) => !(d._type === 'labelPanel' && (d.product as { _ref: string })._ref === BIS),
    );
    const g = await loadGraph(withoutPanels);
    expect(isReceiptEligible(product(g, BIS))).toBe(false);
    expect(buildReceipt(product(g, BIS))).toBeNull();
  });
});

describe('label submission validation', () => {
  const img = (name: string, size = 1000, type = 'image/jpeg') =>
    new File([new Uint8Array(size)], name, { type });
  const ok = {
    front: img('front.jpg'),
    facts: img('facts.jpg'),
    additional: [],
    productName: 'X',
    brand: 'Y',
    productUrl: '',
    rights: true,
  };

  it('accepts a complete submission; product URL is optional', () => {
    expect(validateSubmission(ok)).toEqual([]);
    expect(validateSubmission({ ...ok, productUrl: 'https://brand.example/p/1' })).toEqual([]);
  });
  it('requires both label photos, name, brand and consent', () => {
    const errors = validateSubmission({
      ...ok,
      front: null,
      facts: null,
      productName: ' ',
      brand: '',
      rights: false,
    });
    expect(errors).toHaveLength(5);
  });
  it('rejects non-images, oversized files and non-http URLs', () => {
    expect(
      validateSubmission({ ...ok, additional: [img('notes.pdf', 10, 'application/pdf')] })[0],
    ).toContain('JPEG, PNG or WebP');
    expect(
      validateSubmission({ ...ok, additional: [img('scan.gif', 10, 'image/gif')] })[0],
    ).toContain('JPEG, PNG or WebP');
    expect(validateSubmission({ ...ok, facts: img('big.jpg', 11 * 1024 * 1024) })[0]).toContain(
      '10 MB',
    );
    expect(
      validateSubmission({
        ...ok,
        additional: Array.from({ length: 5 }, (_, i) => img(`${i}.jpg`)),
      }),
    ).toContain('Add at most 6 photos in total.');
    expect(validateSubmission({ ...ok, productUrl: 'javascript:alert(1)' })).toHaveLength(1);
  });
});
