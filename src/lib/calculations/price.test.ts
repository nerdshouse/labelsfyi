import { describe, expect, it } from 'vitest';
import { pricePerEffectiveDose, pricePerGram, pricePerServing, resolveServings } from './price';
import { convert, parseUnit, toGrams } from './units';

describe('units', () => {
  it('converts mass units', () => {
    expect(toGrams({ amount: 500, unit: 'mg' })).toBeCloseTo(0.5);
    expect(convert(1, 'kg', 'g')).toBe(1000);
    expect(convert(50, 'mcg', 'mg')).toBeCloseTo(0.05);
  });
  it('refuses to convert IU to mass', () => {
    expect(convert(2000, 'IU', 'mcg')).toBeNull();
    expect(toGrams({ amount: 2000, unit: 'IU' })).toBeNull();
  });
  it('parses Indian label unit spellings', () => {
    expect(parseUnit('gm')).toBe('g');
    expect(parseUnit('µg')).toBe('mcg');
    expect(parseUnit(' IU ')).toBe('IU');
    expect(parseUnit('tablespoons')).toBeNull();
  });
});

describe('pricePerServing', () => {
  it('divides pack price by servings', () => {
    const r = pricePerServing({ price: 1499, currency: 'INR', servings: 30 });
    expect(r.ok && r.value.amount).toBeCloseTo(49.9667, 3);
  });
  it('reports missing data', () => {
    expect(pricePerServing({ price: null, currency: 'INR', servings: 30 })).toEqual({
      ok: false,
      reason: 'missing_price',
    });
    expect(pricePerServing({ price: 999, currency: 'INR', servings: 0 })).toEqual({
      ok: false,
      reason: 'missing_servings',
    });
  });
});

describe('pricePerGram', () => {
  it('uses pack weight in grams', () => {
    const r = pricePerGram({ price: 2000, currency: 'INR', packSize: { amount: 1, unit: 'kg' } });
    expect(r.ok && r.value.amount).toBe(2);
  });
  it('rejects non-mass packs', () => {
    const r = pricePerGram({
      price: 500,
      currency: 'INR',
      packSize: { amount: 60, unit: 'count' },
    });
    expect(r).toEqual({ ok: false, reason: 'incompatible_units' });
  });
});

describe('pricePerEffectiveDose', () => {
  it('normalises to a reference dose', () => {
    // 75 servings × 3 g creatine = 225 g = 45 doses of 5 g; ₹699 / 45
    const r = pricePerEffectiveDose({
      price: 699,
      currency: 'INR',
      servings: 75,
      amountPerServing: { amount: 3, unit: 'g' },
      referenceDose: { amount: 5, unit: 'g' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.dosesPerPack).toBeCloseTo(45);
      expect(r.value.amount).toBeCloseTo(15.5333, 3);
    }
  });
  it('converts mg doses', () => {
    const r = pricePerEffectiveDose({
      price: 600,
      currency: 'INR',
      servings: 60,
      amountPerServing: { amount: 600, unit: 'mg' },
      referenceDose: { amount: 300, unit: 'mg' },
    });
    expect(r.ok && r.value.amount).toBeCloseTo(5);
  });
  it('fails clearly when the label hides the dose', () => {
    const r = pricePerEffectiveDose({
      price: 600,
      currency: 'INR',
      servings: 60,
      amountPerServing: null,
      referenceDose: { amount: 5, unit: 'g' },
    });
    expect(r).toEqual({ ok: false, reason: 'missing_dose' });
  });
});

describe('resolveServings', () => {
  it('prefers label servings', () => {
    expect(resolveServings({ servings: 30 })).toEqual({
      ok: true,
      value: { servings: 30, basis: 'label' },
    });
  });
  it('derives from pack ÷ serving size', () => {
    const r = resolveServings({
      packSize: { amount: 1, unit: 'kg' },
      servingSize: { amount: 33, unit: 'g' },
    });
    expect(r.ok && r.value.basis).toBe('derived_from_pack_size');
    expect(r.ok && r.value.servings).toBeCloseTo(30.303, 2);
  });
});
