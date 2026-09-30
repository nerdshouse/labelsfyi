import { describe, expect, it } from 'vitest';
import type { ProductGoalData } from '@/lib/content/types';
import { BASIS_TEXT } from '@/lib/goals/goals';
import { goalCandidatesFromSuggestions } from '@/lib/goals/review';
import { SOURCES } from '@/lib/sources/policy';
import {
  brandFromVendor,
  dataSourceTypeFor,
  extractShopifyFeed,
  goalBasisFor,
  type ShopifyProduct,
  type SourceConfig,
} from './shopify-feed';

/**
 * Retailer / marketplace sources (e.g. FITLIX, a multi-brand store): the
 * retailer is the source of the listing, never the brand; no brand imagery,
 * label artwork or copy is taken under a retailer's permission. Fixtures here
 * are synthetic (no FITLIX catalogue was fetched).
 */
const fitlix = SOURCES.find((s) => s.id === 'fitlix')! as unknown as SourceConfig;
const verifiedFitlix = fitlix;
const AT = '2026-09-30T00:00:00Z';

const product = (o: Partial<ShopifyProduct>): ShopifyProduct => ({
  id: 1,
  title: 'Example Creatine Monohydrate 100 g',
  handle: 'example-creatine-100g',
  body_html: '<p>Brand marketing copy. Contains 3g of creatine monohydrate per scoop.</p>',
  vendor: 'MuscleBlaze',
  product_type: 'Pre Workout | Energy',
  tags: ['Energy', 'Sleep Support'],
  variants: [{ id: 1, title: 'Default Title', price: '999.00', compare_at_price: null, sku: null }],
  images: [{ src: 'https://cdn.shopify.com/s/files/brand-pack.jpg' }],
  ...o,
});

describe('marketplace registration and importer data-source type', () => {
  it('FITLIX is a verified MARKETPLACE source; the gate still needs both flags', () => {
    expect(fitlix.sourceKind).toBe('MARKETPLACE');
    expect(fitlix.accessMode).toBe('AUTHORIZED_FEED');
    expect(fitlix.permissionVerified).toBe(true);
    expect(fitlix.permissionRecord).toBeTruthy();
    const feed = { products: [product({})] };
    expect(() => extractShopifyFeed(feed, fitlix, AT)).not.toThrow();
    expect(() => extractShopifyFeed(feed, { ...fitlix, permissionVerified: false }, AT)).toThrow(
      /not verified/,
    );
    expect(() => extractShopifyFeed(feed, { ...fitlix, permissionRecord: null }, AT)).toThrow(
      /not verified/,
    );
  });

  it('never becomes "brand" in the importer', () => {
    expect(dataSourceTypeFor(fitlix)).toBe('marketplace');
    expect(dataSourceTypeFor({ name: 'Brand', sourceKind: 'BRAND_WEBSITE' })).toBe('brand');
    expect(dataSourceTypeFor({ name: 'X', sourceKind: 'OTHER' })).toBe('other');
    // No silent default to "brand".
    expect(() => dataSourceTypeFor({ name: 'X', sourceKind: '' })).toThrow(/unknown sourceKind/);
    expect(() => dataSourceTypeFor({ name: 'X', sourceKind: 'RETAILER' })).toThrow();
  });
});

describe('marketplace feed extraction (synthetic fixture)', () => {
  const out = extractShopifyFeed(
    {
      products: [
        product({}),
        product({ id: 2, handle: 'bm-karnage', vendor: 'BigMuscles Nutrition' }),
        product({ id: 3, handle: 'house-shaker', vendor: 'FITLIX' }), // the retailer itself
        product({ id: 4, handle: 'no-vendor', vendor: '' }),
      ],
    },
    verifiedFitlix,
    AT,
  );
  const brandOf = (i: number) =>
    out.products[i]!.candidate.facts.filter((f) => f.field === 'brand').map((f) => f.value);

  it('keeps each brand exactly as the store reports it, distinct from the retailer', () => {
    expect(brandOf(0)).toEqual(['MuscleBlaze']);
    expect(brandOf(1)).toEqual(['BigMuscles Nutrition']);
    expect(brandOf(2)).toEqual([]); // vendor is the retailer → not a brand
    expect(brandOf(3)).toEqual([]); // missing stays missing
    expect(JSON.stringify(out.products.map((p) => p.candidate.facts))).not.toMatch(/"FITLIX"/);
  });

  it('keeps the retailer as the source of the listing', () => {
    for (const p of out.products) {
      expect(p.candidate.sourceUrl).toMatch(/^https:\/\/fitlix\.co\.in\/products\//);
      expect(p.snapshot.dataSource).toEqual({ _type: 'reference', _ref: 'dataSource.fitlix' });
    }
  });

  it('does not represent retailer goal suggestions as brand marketing', () => {
    const bases = out.products.flatMap((p) => p.candidate.goalSuggestions.map((g) => g.basis));
    expect(bases.length).toBeGreaterThan(0);
    expect(new Set(bases)).toEqual(new Set(['RETAILER_LISTING']));
    expect(JSON.stringify(out)).not.toMatch(/BRAND_MARKETING/);
  });

  it('records no brand imagery (not even references) and no copied description', () => {
    for (const p of out.products) {
      expect(p.snapshot.images).toEqual([]);
      expect(p.snapshot.excerpt).toBeNull();
      expect(p.snapshot.notes).toMatch(/not recorded/);
    }
    expect(JSON.stringify(out)).not.toMatch(/cdn\.shopify\.com|Brand marketing copy/);
    // Stated amounts are still read (unverified), exactly as printed.
    expect(
      out.products[0]!.candidate.facts.filter((f) => f.field === 'ingredient_amount').length,
    ).toBeGreaterThan(0);
  });

  it('brand stores keep their existing behaviour', () => {
    const brandStore: SourceConfig = { ...verifiedFitlix, sourceKind: 'BRAND_WEBSITE' };
    expect(goalBasisFor(brandStore)).toBe('BRAND_MARKETING');
    expect(brandFromVendor('FITLIX', brandStore)).toBe('FITLIX'); // a brand may sell its own brand
    const b = extractShopifyFeed({ products: [product({})] }, brandStore, AT).products[0]!;
    expect(b.snapshot.images).toHaveLength(1);
    expect(b.snapshot.excerpt).toMatch(/creatine/);
  });
});

describe('goal suggestions → productGoal candidates', () => {
  it('preserves RETAILER_LISTING and drops suggestions with no basis', () => {
    const docs = goalCandidatesFromSuggestions(
      {
        _id: 'ingestionCandidate.test',
        _type: 'ingestionCandidate',
        sourceUrl: 'https://fitlix.co.in/products/x',
        extractedAt: AT,
        goalSuggestions: [
          { goalSlug: 'energy', basis: 'RETAILER_LISTING', statement: 'Energy' },
          { goalSlug: 'sleep', statement: 'Sleep' }, // no basis → dropped, never assumed
        ],
      },
      'product.x',
      { energy: 'goal.energy', sleep: 'goal.sleep' },
    );
    expect(docs.map((d) => [d.goal, d.basis])).toEqual([
      [{ _type: 'reference', _ref: 'goal.energy' }, 'RETAILER_LISTING'],
    ]);
  });

  it('public "why this appears" never calls a retailer listing brand marketing', () => {
    const text = BASIS_TEXT(
      {
        basis: 'RETAILER_LISTING',
        statement: 'Energy',
        sourceLocator: 'Store product tag',
      } as ProductGoalData,
      'Energy',
    );
    expect(text).toMatch(/Listed by a retailer/);
    expect(text).toMatch(/not the brand/);
    expect(text).not.toMatch(/Marketed by the brand/);
  });
});
