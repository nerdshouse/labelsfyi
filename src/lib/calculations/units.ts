import type { Quantity, Unit } from '@/lib/content/types';

/**
 * Unit handling for label quantities.
 *
 * Only mass units are inter-convertible here. IU cannot be converted to mass
 * without knowing the specific nutrient, so it is deliberately treated as its
 * own dimension; callers get `null` rather than a silently wrong number.
 */

const MASS_IN_GRAMS: Partial<Record<Unit, number>> = {
  mcg: 1e-6,
  mg: 1e-3,
  g: 1,
  kg: 1000,
};

const VOLUME_IN_ML: Partial<Record<Unit, number>> = {
  ml: 1,
  l: 1000,
};

export type Dimension = 'mass' | 'volume' | 'energy' | 'iu' | 'cfu' | 'count';

export function dimensionOf(unit: Unit): Dimension {
  if (unit in MASS_IN_GRAMS) return 'mass';
  if (unit in VOLUME_IN_ML) return 'volume';
  if (unit === 'kcal' || unit === 'kJ') return 'energy';
  if (unit === 'IU') return 'iu';
  if (unit === 'CFU') return 'cfu';
  return 'count';
}

/** Convert a quantity to grams. Returns null for non-mass units. */
export function toGrams(q: Quantity): number | null {
  const factor = MASS_IN_GRAMS[q.unit];
  if (factor === undefined || !Number.isFinite(q.amount)) return null;
  return q.amount * factor;
}

/** Convert between two units of the same dimension. Returns null when not convertible. */
export function convert(amount: number, from: Unit, to: Unit): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  const fromMass = MASS_IN_GRAMS[from];
  const toMass = MASS_IN_GRAMS[to];
  if (fromMass !== undefined && toMass !== undefined) return (amount * fromMass) / toMass;
  const fromVol = VOLUME_IN_ML[from];
  const toVol = VOLUME_IN_ML[to];
  if (fromVol !== undefined && toVol !== undefined) return (amount * fromVol) / toVol;
  if (from === 'kcal' && to === 'kJ') return amount * 4.184;
  if (from === 'kJ' && to === 'kcal') return amount / 4.184;
  return null;
}

const UNIT_ALIASES: Record<string, Unit> = {
  mcg: 'mcg',
  µg: 'mcg',
  μg: 'mcg',
  ug: 'mcg',
  microgram: 'mcg',
  micrograms: 'mcg',
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  g: 'g',
  gm: 'g',
  gms: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  iu: 'IU',
  kcal: 'kcal',
  kj: 'kJ',
  cfu: 'CFU',
  count: 'count',
};

/** Normalise the many ways Indian labels print units ("gm", "µg", "IU"…). */
export function parseUnit(raw: string): Unit | null {
  return UNIT_ALIASES[raw.trim().toLowerCase()] ?? null;
}
