import { describe, expect, it } from 'vitest';
import { SOURCES } from '@/lib/sources/policy';
import {
  listingAmounts,
  nonSupplementReason,
  titlePackSize,
  variantPackSize,
} from './listing-parse';
import { extractShopifyFeed, type ShopifyProduct, type SourceConfig } from './shopify-feed';

/**
 * Conservative retailer-listing parsing (FITLIX QA regressions). Titles are the
 * shapes seen in the FITLIX feed; no network access.
 */
const amounts = (title: string, desc = '') =>
  listingAmounts(title, desc).map((a) => [a.label, a.value]);

describe('ingredient amounts: legitimate statements are kept', () => {
  it('number-first: "3g Creatine", "1000mg L-Arginine"', () => {
    expect(
      amounts(
        'Optimum Nutrition Micronized Creatine Powder | 250g (65 Servings) | Citrus Orange | 3g Creatine',
      ),
    ).toEqual([['Creatine', '3 g']]);
    expect(amounts('Brand X | 1000mg L-Arginine | 180 Veg Tablets')).toEqual([
      ['L-Arginine', '1000 mg'],
    ]);
  });

  it('number-first EPA / DHA are separate, labelled facts', () => {
    expect(
      amounts(
        'GNC Triple Strength Fish Oil Mini | 1500mg Omega-3 | 60 Mini Softgels | 540mg EPA & 360mg DHA | Formulated in USA',
      ),
    ).toEqual([
      ['EPA', '540 mg'],
      ['DHA', '360 mg'],
    ]);
    expect(
      amounts('MuscleBlaze Omega 3 Fish Oil Gold | 1300mg Omega-3 | 500mg EPA + 400mg DHA'),
    ).toEqual([
      ['EPA', '500 mg'],
      ['DHA', '400 mg'],
    ]);
    // Label-first form too.
    expect(
      amounts('Neuherbs Mini Deep Sea Fish Oil | 1000mg Omega-3 | EPA 360mg & DHA 240mg'),
    ).toEqual([
      ['EPA', '360 mg'],
      ['DHA', '240 mg'],
    ]);
  });

  it('"5 g BCAA" and friends', () => {
    expect(
      amounts('Nutrabay Gold BCAA 2:1:1 with Electrolytes | 250g (31 Servings)  Orange  5g BCAA'),
    ).toEqual([['BCAA', '5 g']]);
    expect(amounts('Some BCAA | 30 Servings | 5 g BCAA')).toEqual([['BCAA', '5 g']]);
  });

  it('label-first: "1880mg Magnesium Glycinate" / "Magnesium Glycinate 1880mg"', () => {
    expect(amounts('hk vitals 100% Magnesium Glycinate 1880mg')).toEqual([
      ['Magnesium Glycinate', '1880 mg'],
    ]);
    expect(amounts('Brand | 1880mg Magnesium Glycinate')).toEqual([
      ['Magnesium Glycinate', '1880 mg'],
    ]);
  });

  it('strips the product name, brand and marketing words from the label', () => {
    expect(
      amounts('Carbamide Forte L-Arginine 1000mg Tablets - Nitric Oxide Booster - 180 Veg Tablets'),
    ).toEqual([['L-Arginine', '1000 mg']]);
    expect(
      amounts(
        'Wellbeing Nutrition Melts Natural Vitamin D3 600IU + K2 MK7 with Resveratrol & Vitamin A - 30 Oral Strips',
      ),
    ).toEqual([['Vitamin D3', '600 IU']]);
    expect(amounts('Nutrabay Pro Potent Caffeine Tablets 200mg - 60 Veg Tablets')).toEqual([
      ['Caffeine', '200 mg'],
    ]);
    expect(amounts('Kapiva Shilajit Energy Sips | 30 Sachets | 250mg Pure Shilajit')).toEqual([
      ['Shilajit', '250 mg'],
    ]);
  });

  it('commas, "per" basis and percentages', () => {
    expect(amounts('WN Skin | 10,000mcg Biotin, Keratin')).toEqual([['Biotin', '10000 mcg']]);
    expect(
      amounts('MuscleBlaze Creatine Chews – 90 Tablets | 1g Creatine Per Chew | 3g Daily Dose'),
    ).toEqual([['Creatine (per chew)', '1 g']]);
    expect(amounts('MB CreaPRO – 100g | 3g 99.99% Pure Creatine')).toEqual([['Creatine', '3 g']]);
  });
});

describe('ingredient amounts: misparses are refused', () => {
  it('a 200g pack weight never becomes an ingredient', () => {
    expect(amounts('Nutrabay Good Gut Daily Fiber - Unflavoured - 200g')).toEqual([]);
    expect(amounts('Brand Whey | 250g (65 Servings) | Chocolate')).toEqual([]);
  });

  it('flavour names never become ingredients', () => {
    for (const t of [
      'Brand | Orange 5g',
      'Brand | 5g Orange',
      'Brand | Unflavoured 3g',
      'Brand | 3g Cola',
    ])
      expect(amounts(t), t).toEqual([]);
  });

  it('malformed "lbs Powder - 24g" never becomes an ingredient', () => {
    expect(
      amounts(
        'Rule1 1 R1 Whey Blend, Strawberries & Creme - 1.96 lbs Powder - 24g Whey Concentrates, Isolates & Hydrolysates',
      ),
    ).toEqual([]);
  });

  it('the product name alone is never a label', () => {
    for (const t of [
      'Nutrabay Gold Micronised Creatine Monohydrate Powder X 3000 mg',
      'Wellbeing Nutrition Triple Magnesium Complex 1000mg – Glycinate, Citrate & Threonate',
      'Ronnie Coleman Signature Series L-Carnitine XS 3000mg Liquid - 465ml',
    ])
      expect(amounts(t), t).toEqual([]);
  });

  it('ranges, combined and ambiguous figures are skipped', () => {
    expect(amounts('MuscleBlaze BCAA Pro Powder | 450g | 5–7g BCAAs')).toEqual([]);
    expect(amounts('ON Fish Oil | 300mg EPA/DHA Omega-3 Fatty Acids | 60 Softgels')).toEqual([]);
    expect(amounts('Brand | 1000mg Omega-3 | 60 Softgels')).toEqual([]);
    expect(amounts('MB WrathX | 1500mg NitroBlaze® | 1000mg Creapure® Creatine')).toEqual([]);
  });

  it('never infers EPA/DHA from the oil weight', () => {
    expect(amounts('Brand Omega 3 Fish Oil 1000mg - 60 Capsules')).toEqual([
      ['Fish Oil', '1000 mg'],
    ]);
    expect(amounts('X', 'Each softgel provides 1500mg of Omega-3 fish oil per serving.')).toEqual(
      [],
    );
  });
});

describe('elemental amounts', () => {
  it('a stated elemental figure stays separate from the compound figure; nothing computed', () => {
    const got = listingAmounts(
      'hk vitals 100% Magnesium Glycinate 1880mg',
      'Delivers 220mg of elemental magnesium per serving.',
    );
    expect(got.map((a) => [a.label, a.value, a.where, a.basis])).toEqual([
      ['Elemental magnesium (per serving)', '220 mg', 'description', 'serving'],
      ['Magnesium Glycinate', '1880 mg', 'title', null],
    ]);
    expect(listingAmounts('hk vitals 100% Magnesium Glycinate 1880mg', '')).toEqual([
      { label: 'Magnesium Glycinate', value: '1880 mg', where: 'title', basis: null },
    ]);
  });
});

describe('basis: an amount needs its stated basis; "per serving" is never assumed', () => {
  const basisOf = (title: string, desc = '') =>
    listingAmounts(title, desc).map((a) => [a.label, a.value, a.basis]);
  it('"24g Protein" without a basis has no basis', () => {
    expect(basisOf('Brand Whey | 1kg | 24g Protein')).toEqual([['Protein', '24 g', null]]);
    expect(basisOf('Brand Whey | Protein 24g')).toEqual([['Protein', '24 g', null]]);
    expect(basisOf('Brand Whey | Protein: 24g')).toEqual([]); // not parsed at all
  });
  it('an explicit basis is kept exactly as stated', () => {
    expect(basisOf('Brand Whey | 24g Protein per serving')).toEqual([
      ['Protein (per serving)', '24 g', 'serving'],
    ]);
    expect(basisOf('Brand Whey | 24g Protein Per Scoop')).toEqual([
      ['Protein (per scoop)', '24 g', 'scoop'],
    ]);
    expect(basisOf('Brand Oats | 13g Protein per 100g')).toEqual([
      ['Protein (per 100g)', '13 g', '100g'],
    ]);
    expect(basisOf('X', 'Each scoop gives 24g of protein per scoop.')).toEqual([
      ['Protein (per scoop)', '24 g', 'scoop'],
    ]);
  });
});

describe('pack size vs variant', () => {
  it('pack sizes are real sizes; flavours are never pack sizes', () => {
    expect(variantPackSize('122gm (33 Servings) / Kiwi Kick')).toBe('122gm, 33 Servings');
    expect(variantPackSize('Rich Chocolate 5 Lbs')).toBe('5 Lbs');
    expect(variantPackSize('307 Grams / Kiwi Kick')).toBe('307 Grams');
    expect(variantPackSize('2 Kilograms / Chocolate')).toBe('2 Kilograms');
    expect(variantPackSize('60 Veg Tablets')).toBe('60 Veg Tablets');
    for (const v of ['Orange', 'Unflavoured', 'Cola', 'Default', 'Assorted 4 Flavours'])
      expect(variantPackSize(v), v).toBeNull();
    expect(
      titlePackSize(
        'Optimum Nutrition Micronized Creatine Powder | 250g (65 Servings) | 3g Creatine',
      ),
    ).toBe('250g, 65 Servings');
    expect(titlePackSize('Brand Caffeine | 3g Creatine')).toBeNull(); // a dose, not a pack
  });
});

describe('non-supplement listings', () => {
  it('food and accessories are rejected with a reason; supplements are not', () => {
    expect(
      nonSupplementReason('Pintola Organic Brown Rice Cakes - All Natural Unsalted 130g'),
    ).toMatch(/rice cakes/i);
    expect(nonSupplementReason('MuscleBlaze High Protein Oats – 1kg, 26g Protein')).toMatch(
      /oats/i,
    );
    expect(nonSupplementReason('Boldfit SpiderX Gym Shaker Bottle')).toMatch(/shaker/i);
    for (const t of [
      'Optimum Nutrition Gold Standard Whey',
      'Kapiva Shilajit Gold',
      'OSMO Electrolyte Powder',
      // Flavours that sound like food are not food products.
      'Ronnie Coleman Signature Series Pro-Antium Whey Protein – 2.27kg (5 Lbs) | Cookies and Cream | 52 Servings',
      'Brand Whey Protein | Peanut Butter | 1kg',
      'Brand Mass Gainer | Choco Chips | 3kg',
    ])
      expect(nonSupplementReason(t), t).toBeNull();
  });
});

// ─── Through the whole marketplace extraction ────────────────────────────

const fitlix = SOURCES.find((s) => s.id === 'fitlix')! as unknown as SourceConfig;
const AT = '2026-09-30T00:00:00Z';
const listing = (o: Partial<ShopifyProduct>): ShopifyProduct => ({
  id: 1,
  title: 'X',
  handle: 'x',
  body_html: '',
  vendor: 'Nutrabay',
  product_type: '',
  tags: [],
  variants: [{ id: 1, title: 'Default Title', price: '499.00', compare_at_price: null, sku: null }],
  images: [],
  ...o,
});

describe('marketplace extraction with the tightened parser', () => {
  const out = extractShopifyFeed(
    {
      products: [
        listing({
          id: 1,
          handle: 'bcaa',
          title: 'Nutrabay Gold BCAA 2:1:1 with Electrolytes | 250g (31 Servings)  Orange  5g BCAA',
          variants: [
            { id: 1, title: 'Orange', price: '499.00', compare_at_price: '879.00', sku: null },
            { id: 2, title: 'Unflavoured', price: '787.00', compare_at_price: null, sku: null },
          ],
        }),
        listing({
          id: 2,
          handle: 'rice-cakes',
          vendor: 'Pintola',
          title: 'Pintola Organic Brown Rice Cakes - All Natural Unsalted 130g',
        }),
        listing({
          id: 3,
          handle: 'hyde-30',
          vendor: 'ProSupps',
          title: 'ProSupps HYDE Xtreme | 30 Servings | Fruit Punch',
        }),
        listing({
          id: 4,
          handle: 'hyde-15',
          vendor: 'ProSupps',
          title: 'ProSupps HYDE Xtreme | 15 Servings | Fruit Punch',
        }),
      ],
    },
    fitlix,
    AT,
  );
  const cand = (h: string) =>
    out.products.find((p) => p.candidate.sourceUrl.endsWith(`/${h}`))!.candidate;
  const of = (h: string, field: string) => cand(h).facts.filter((f) => f.field === field);

  it('rejects the food listing with a clear reason; it is not a candidate', () => {
    expect(out.skipped).toEqual([
      { handle: 'rice-cakes', reason: expect.stringMatching(/Not a supplement.*rice cakes/i) },
    ]);
    expect(out.products.map((p) => p.candidate.sourceUrl)).not.toContain(
      'https://fitlix.co.in/products/rice-cakes',
    );
  });

  it('flavours are variants (kept), not pack sizes or ingredients', () => {
    expect(of('bcaa', 'variant').map((f) => f.value)).toEqual(['Orange', 'Unflavoured']);
    expect(of('bcaa', 'pack_size').map((f) => f.value)).toEqual(['250g, 31 Servings']);
    // "5g BCAA" states no basis: a generic listing fact, never an ingredient_amount.
    expect(of('bcaa', 'ingredient_amount')).toEqual([]);
    expect(of('bcaa', 'other').map((f) => [f.label, f.value])).toEqual([
      ['BCAA (listing statement; basis not stated)', '5 g'],
    ]);
    expect(of('bcaa', 'price').map((f) => [f.label, f.value])).toEqual([
      ['Orange', '₹499.00'],
      ['Unflavoured', '₹787.00'],
    ]);
    expect(cand('bcaa').facts.every((f) => f.verificationStatus === 'unverified')).toBe(true);
  });

  it('protein: ingredient_amount only with a stated basis', () => {
    const out2 = extractShopifyFeed(
      {
        products: [
          listing({ id: 11, handle: 'p-none', title: 'Brand Whey | 1kg | 24g Protein' }),
          listing({
            id: 12,
            handle: 'p-serving',
            title: 'Brand Whey | 1kg | 24g Protein per serving',
          }),
          listing({
            id: 13,
            handle: 'p-scoop',
            title: 'Brand Whey Isolate | 1kg | 24g Protein per scoop',
          }),
        ],
      },
      fitlix,
      AT,
    );
    const facts = (h: string, field: string) =>
      out2.products
        .find((p) => p.candidate.sourceUrl.endsWith(`/${h}`))!
        .candidate.facts.filter((f) => f.field === field)
        .map((f) => [f.label, f.value]);
    expect(facts('p-none', 'ingredient_amount')).toEqual([]);
    expect(facts('p-none', 'other')).toEqual([
      ['Protein (listing statement; basis not stated)', '24 g'],
    ]);
    expect(facts('p-serving', 'ingredient_amount')).toEqual([['Protein (per serving)', '24 g']]);
    expect(facts('p-scoop', 'ingredient_amount')).toEqual([['Protein (per scoop)', '24 g']]);
    for (const p of out2.products)
      expect(p.candidate.facts.every((f) => f.verificationStatus === 'unverified')).toBe(true);
  });

  it('flags duplicate-looking listings neutrally, without merging', () => {
    expect(out.duplicateSuspects).toEqual([
      {
        handles: ['hyde-30', 'hyde-15'],
        reason: expect.stringMatching(/same brand and product name/i),
      },
    ]);
    expect(cand('hyde-30').notes).toMatch(/Possible duplicate.*hyde-15.*Not merged/);
    expect(cand('hyde-15').notes).toMatch(/hyde-30/);
    expect(cand('bcaa').notes).toBeUndefined();
    expect(out.products).toHaveLength(3); // both HYDE listings kept
  });
});
