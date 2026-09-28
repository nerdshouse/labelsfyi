import type { Currency, Quantity } from '@/lib/content/types';
import { convert, toGrams } from './units';

/**
 * Pure price calculations. No formatting, no UI. Every function returns a
 * CalcResult so the UI can explain *why* a number is missing instead of
 * showing a misleading one.
 */

export interface Money {
  amount: number;
  currency: Currency;
}

export type CalcFailure =
  | 'missing_price'
  | 'missing_servings'
  | 'missing_pack_size'
  | 'missing_dose'
  | 'incompatible_units';

export type ServingsBasis = 'label' | 'derived_from_pack_size';

export type CalcResult<T> = { ok: true; value: T } | { ok: false; reason: CalcFailure };

const ok = <T>(value: T): CalcResult<T> => ({ ok: true, value });
const fail = <T>(reason: CalcFailure): CalcResult<T> => ({ ok: false, reason });

const isPositive = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

export interface PriceInput {
  price: number | null | undefined;
  currency: Currency;
}

/**
 * Servings in a pack. Prefers the servings figure printed on the label (or
 * recorded on the price snapshot); falls back to pack size ÷ serving size and
 * says so via `basis`.
 */
export function resolveServings(input: {
  servings?: number | null | undefined;
  packSize?: Quantity | null | undefined;
  servingSize?: Quantity | null | undefined;
}): CalcResult<{ servings: number; basis: ServingsBasis }> {
  if (isPositive(input.servings)) return ok({ servings: input.servings, basis: 'label' });
  const { packSize, servingSize } = input;
  if (!packSize || !servingSize) return fail('missing_servings');
  const packInServingUnit = convert(packSize.amount, packSize.unit, servingSize.unit);
  if (packInServingUnit === null) return fail('incompatible_units');
  if (!isPositive(packInServingUnit) || !isPositive(servingSize.amount)) {
    return fail('missing_servings');
  }
  return ok({ servings: packInServingUnit / servingSize.amount, basis: 'derived_from_pack_size' });
}

/** pricePerServing = packPrice / servings */
export function pricePerServing(
  input: PriceInput & { servings: number | null | undefined },
): CalcResult<Money> {
  if (!isPositive(input.price)) return fail('missing_price');
  if (!isPositive(input.servings)) return fail('missing_servings');
  return ok({ amount: input.price / input.servings, currency: input.currency });
}

/** Price per gram of *product* (pack weight), e.g. ₹/g of powder. */
export function pricePerGram(
  input: PriceInput & { packSize: Quantity | null | undefined },
): CalcResult<Money> {
  if (!isPositive(input.price)) return fail('missing_price');
  if (!input.packSize) return fail('missing_pack_size');
  const grams = toGrams(input.packSize);
  if (grams === null) return fail('incompatible_units');
  if (!isPositive(grams)) return fail('missing_pack_size');
  return ok({ amount: input.price / grams, currency: input.currency });
}

/**
 * Price for a reference dose of an active (e.g. ₹ per 5 g creatine, ₹ per 25 g
 * protein), using the label's declared amount per serving.
 *
 *   dosesPerPack = servings × amountPerServing ÷ referenceDose
 *   price        = packPrice ÷ dosesPerPack
 */
export function pricePerEffectiveDose(
  input: PriceInput & {
    servings: number | null | undefined;
    amountPerServing: Quantity | null | undefined;
    referenceDose: Quantity;
  },
): CalcResult<Money & { dosesPerPack: number }> {
  if (!isPositive(input.price)) return fail('missing_price');
  if (!isPositive(input.servings)) return fail('missing_servings');
  const perServing = input.amountPerServing;
  if (!perServing || !isPositive(perServing.amount)) return fail('missing_dose');
  const perServingInRefUnit = convert(perServing.amount, perServing.unit, input.referenceDose.unit);
  if (perServingInRefUnit === null) return fail('incompatible_units');
  if (!isPositive(input.referenceDose.amount)) return fail('missing_dose');
  const dosesPerPack = (input.servings * perServingInRefUnit) / input.referenceDose.amount;
  return ok({ amount: input.price / dosesPerPack, currency: input.currency, dosesPerPack });
}

/** Human-readable explanation for a calculation failure. */
export function describeFailure(reason: CalcFailure): string {
  switch (reason) {
    case 'missing_price':
      return 'No price observed yet';
    case 'missing_servings':
      return 'Servings per pack not disclosed';
    case 'missing_pack_size':
      return 'Pack size not recorded';
    case 'missing_dose':
      return 'Amount per serving not disclosed on label';
    case 'incompatible_units':
      return 'Units cannot be compared';
  }
}
