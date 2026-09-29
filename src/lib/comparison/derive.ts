import { productCosts, referencePrice, resolveServings, type Money } from '@/lib/calculations';
import { convert } from '@/lib/calculations/units';
import type { ProductDetail, Quantity } from '@/lib/content/types';
import { activeRows, ingredientAmounts, totalFor } from './ingredients';

/**
 * Comparison-ready derived values. Pure; every function returns null when a
 * required source value is missing. Never guesses.
 */

/** Cost for a standard amount of an active, e.g. ₹ per 100 mg elemental magnesium. */
export function costPerStandardAmount(
  costPerServing: Money | null,
  amountPerServing: Quantity | null,
  standard: Quantity,
): Money | null {
  if (!costPerServing || !amountPerServing || amountPerServing.amount <= 0) return null;
  const inStandardUnit = convert(amountPerServing.amount, amountPerServing.unit, standard.unit);
  if (inStandardUnit === null || inStandardUnit <= 0) return null;
  return {
    amount: (costPerServing.amount * standard.amount) / inStandardUnit,
    currency: costPerServing.currency,
  };
}

export function pricePerServing(p: ProductDetail): Money | null {
  const r = productCosts(p, referencePrice(p)).perServing;
  return r.ok ? r.value : null;
}

export function servingsPerContainer(
  p: ProductDetail,
): { servings: number; derived: boolean } | null {
  const snap = referencePrice(p);
  const r = resolveServings({
    servings: snap?.servings ?? p.servingsPerContainer,
    packSize: snap?.packSize,
    servingSize: p.servingSize,
  });
  return r.ok ? { servings: r.value.servings, derived: r.value.basis !== 'label' } : null;
}

/** ₹ per 100 mg of the *elemental* ingredient. Null if elemental amount is unknown. */
export function pricePer100MgElemental(p: ProductDetail, ingredientId: string): Money | null {
  const elemental = totalFor(activeRows(p), ingredientId, 'elemental');
  return costPerStandardAmount(pricePerServing(p), elemental, { amount: 100, unit: 'mg' });
}

export const activeIngredientCount = (p: ProductDetail) => activeRows(p).length;

/** Actives with any disclosed amount (compound, elemental or declared). */
export const disclosedActiveAmountCount = (p: ProductDetail) =>
  activeRows(p).filter((r) => {
    const a = ingredientAmounts(r);
    return a.compound || a.elemental || a.declared;
  }).length;
