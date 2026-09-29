import { describe, expect, it } from 'vitest';
import { gtinCheckDigit, gtinKey, normalizeGtin } from './gtin';
import { findMatches, matchProduct, type IdentityRecord } from './match';
import { formatServing, parseServing } from './serving';
import { normalizeGtin as studioNormalizeGtin } from '../../../sanity/lib/gtin';

/** Build a synthetic GTIN with a correct check digit (no real product codes in tests). */
const gtin = (body: string) => body + gtinCheckDigit(body);

describe('GTIN', () => {
  it('classifies valid GTIN-8/12/13/14 and strips separators', () => {
    expect(normalizeGtin(gtin('9990000'))).toMatchObject({ status: 'valid', kind: 'GTIN-8' });
    expect(normalizeGtin(gtin('99900000001'))).toMatchObject({ status: 'valid', kind: 'GTIN-12' });
    const g13 = gtin('890000000001');
    expect(normalizeGtin(`${g13.slice(0, 1)} ${g13.slice(1, 7)}-${g13.slice(7)}`)).toEqual({
      status: 'valid',
      digits: g13,
      kind: 'GTIN-13',
    });
    expect(normalizeGtin(gtin('1890000000001'))).toMatchObject({
      status: 'valid',
      kind: 'GTIN-14',
    });
  });
  it('rejects malformed values instead of guessing', () => {
    const g = gtin('890000000001');
    const wrong = g.slice(0, -1) + ((Number(g.at(-1)) + 1) % 10);
    expect(normalizeGtin(wrong).status).toBe('invalid_check_digit');
    expect(normalizeGtin('12345').status).toBe('unrecognized');
    expect(normalizeGtin('89000A000001').status).toBe('unrecognized');
    expect(normalizeGtin('').status).toBe('unrecognized');
  });
  it('treats GTIN-12 and its GTIN-13 form as the same key', () => {
    const g12 = gtin('99900000001');
    expect(gtinKey(g12)).toBe(gtinKey(`0${g12}`));
  });
  it('studio validator matches the site implementation', () => {
    for (const v of [gtin('890000000001'), gtin('9990000'), '12345', '8900000000010', 'abc']) {
      expect(studioNormalizeGtin(v).status).toBe(normalizeGtin(v).status);
    }
  });
});

describe('serving normalisation', () => {
  it.each([
    ['2 capsules', { count: 2, unit: 'capsule', mass: null, massUnit: null }],
    ['1 tablet', { count: 1, unit: 'tablet', mass: null, massUnit: null }],
    ['2 softgels', { count: 2, unit: 'softgel', mass: null, massUnit: null }],
    ['1 oral strip', { count: 1, unit: 'strip', mass: null, massUnit: null }],
    ['1 scoop (35.5 g)', { count: 1, unit: 'scoop', mass: 35.5, massUnit: 'g' }],
    ['1 Sachet (6 g approx.)', { count: 1, unit: 'sachet', mass: 6, massUnit: 'g' }],
    ['1 level scoop 8 g', { count: 1, unit: 'scoop', mass: 8, massUnit: 'g' }],
    ['30 g', { count: 1, unit: 'serving', mass: 30, massUnit: 'g' }],
  ])('parses "%s"', (text, expected) => {
    expect(parseServing(text)).toEqual(expected);
  });
  it('returns null rather than guessing', () => {
    expect(parseServing('as directed by physician')).toBeNull();
    expect(parseServing('2 handfuls')).toBeNull();
  });
  it('formats structured servings for display', () => {
    expect(formatServing(parseServing('1 scoop (35.5 g)'))).toBe('1 scoop (35.5 g)');
    expect(formatServing(parseServing('2 capsules'))).toBe('2 capsules');
  });
});

describe('product matching', () => {
  const B = 'Example Nutrition';
  const rec = (id: string, over: Partial<IdentityRecord>): IdentityRecord => ({
    id,
    brand: B,
    name: '',
    ...over,
  });

  it('exact barcode match is EXACT, even with different names, and still needs a person', () => {
    const m = matchProduct(
      rec('a', { name: 'Omega 3 1000', gtin: gtin('890000000011') }),
      rec('b', { name: 'Fish Oil Softgels', gtin: gtin('890000000011') }),
    );
    expect(m).toMatchObject({
      level: 'EXACT',
      relation: 'same_sku',
      requiresHumanConfirmation: true,
    });
  });

  it('different barcode on an otherwise identical record is not assumed identical', () => {
    const m = matchProduct(
      rec('a', { name: 'Triple Magnesium', gtin: gtin('890000000011') }),
      rec('b', { name: 'Triple Magnesium', gtin: gtin('890000000028') }),
    );
    expect(m).toMatchObject({ level: 'POSSIBLE_MATCH', relation: 'different_barcode' });
  });

  it('brand is a gate: same name, different brand → NO_MATCH', () => {
    const m = matchProduct(
      rec('a', { name: 'Creatine Monohydrate' }),
      rec('b', { name: 'Creatine Monohydrate', brand: 'Other Co' }),
    );
    expect(m).toMatchObject({ level: 'NO_MATCH', relation: 'different_brand' });
    expect(
      matchProduct(rec('a', { name: 'Creatine', brand: null }), rec('b', { name: 'Creatine' }))
        .level,
    ).toBe('NO_MATCH');
  });

  // Regressions from the first real ingestion experiment.
  it('shared generic words do not match: "Daily Probiotic Slow" vs "PCOS Balance Slow"', () => {
    expect(
      matchProduct(
        rec('a', { name: 'Daily Probiotic Slow' }),
        rec('b', { name: 'PCOS Balance Slow' }),
      ).level,
    ).toBe('NO_MATCH');
  });
  it('shared brand does not match: "Hydrasalt" vs "Multivitamins"', () => {
    expect(
      matchProduct(rec('a', { name: 'Hydrasalt' }), rec('b', { name: 'Multivitamins' })).level,
    ).toBe('NO_MATCH');
  });
  it('sibling product is flagged, not matched: Creatine Monohydrate vs Creatine Monohydrate + HCl', () => {
    const m = matchProduct(
      rec('a', { name: 'Creatine Monohydrate | 100g | 300mg Taurine | Unflavoured' }),
      rec('b', { name: 'Creatine Monohydrate + HCL | 100g | 300mg Taurine | Unflavoured' }),
    );
    expect(m).toMatchObject({ level: 'NO_MATCH', relation: 'sibling_product' });
  });

  it('same product, different pack size → high-confidence candidate for the same canonical product', () => {
    const m = matchProduct(
      rec('a', { name: 'Whey Protein Isolate 1kg', variant: 'Dark Chocolate', packSize: '1 kg' }),
      rec('b', { name: 'Whey Protein Isolate 2kg', variant: 'Dark Chocolate', packSize: '2 kg' }),
    );
    expect(m).toMatchObject({ level: 'HIGH_CONFIDENCE_CANDIDATE', relation: 'pack_size_variant' });
  });
  it('same product, different flavour → possible match flagged as a flavour variant (separate product)', () => {
    const m = matchProduct(
      rec('a', { name: 'Whey Protein Isolate', variant: 'Dark Chocolate' }),
      rec('b', { name: 'Whey Protein Isolate', variant: 'Vanilla' }),
    );
    expect(m).toMatchObject({ level: 'POSSIBLE_MATCH', relation: 'flavour_variant' });
  });
  it('same barcode, different declared actives → reformulation flag (new label version, no overwrite)', () => {
    const m = matchProduct(
      rec('a', {
        name: 'Protein',
        gtin: gtin('890000000035'),
        formulationSignature: 'protein:25g',
      }),
      rec('b', {
        name: 'Protein',
        gtin: gtin('890000000035'),
        formulationSignature: 'protein:30g',
      }),
    );
    expect(m).toMatchObject({ level: 'EXACT', relation: 'possible_reformulation' });
  });
  it('findMatches drops NO_MATCH and ranks EXACT first', () => {
    const cand = rec('c', { name: 'Omega 3', gtin: gtin('890000000011') });
    const out = findMatches(cand, [
      rec('x', { name: 'Omega 3', packSize: '120' }),
      rec('y', { name: 'Anything', gtin: gtin('890000000011') }),
      rec('z', { name: 'Omega 3', brand: 'Other' }),
    ]);
    expect(out.map((m) => m.existingId)).toEqual(['y', 'x']);
  });
});
