import { convert } from '@/lib/calculations/units';
import type { LabelIngredientRow, ProductDetail, Quantity } from '@/lib/content/types';

/**
 * Ingredient amounts, kept strictly separate:
 *   compound  – declared weight of the form (e.g. 1000 mg magnesium bisglycinate)
 *   elemental – declared elemental amount (e.g. 220 mg magnesium); null = UNKNOWN
 *   declared  – the amount-per-serving figure used by existing dose comparisons
 *
 * Compound weight is never used as a substitute for elemental amount.
 */
export interface IngredientAmounts {
  compound: Quantity | null;
  elemental: Quantity | null;
  declared: Quantity | null;
}

const q = (amount: number | null, unit: Quantity['unit'] | null): Quantity | null =>
  amount !== null && Number.isFinite(amount) && unit ? { amount, unit } : null;

export function ingredientAmounts(
  row: Pick<
    LabelIngredientRow,
    | 'compoundAmount'
    | 'compoundUnit'
    | 'elementalAmount'
    | 'elementalUnit'
    | 'elementalBasis'
    | 'amountPerServing'
    | 'unit'
  >,
): IngredientAmounts {
  return {
    compound: q(row.compoundAmount, row.compoundUnit),
    // Elemental only with an explicit basis (label-declared, or an editorial calculation with a cited basis).
    elemental: row.elementalBasis ? q(row.elementalAmount, row.elementalUnit) : null,
    declared: q(row.amountPerServing, row.unit),
  };
}

/** Rows that are actives: linked to a canonical ingredient or flagged key active. */
export function activeRows(p: Pick<ProductDetail, 'panels'>): LabelIngredientRow[] {
  return p.panels
    .filter((x) => x.isCurrent)
    .flatMap((x) => x.ingredients)
    .filter((r) => r.ingredient !== null || r.isKeyActive);
}

/**
 * Sum one kind of amount across all rows for an ingredient. If any matching
 * row lacks that amount, the total is unknown (null), never a partial sum.
 */
export function totalFor(
  rows: LabelIngredientRow[],
  ingredientId: string,
  kind: keyof IngredientAmounts,
): Quantity | null {
  const matching = rows.filter((r) => r.ingredient?._id === ingredientId);
  if (!matching.length) return null;
  const amounts = matching.map((r) => ingredientAmounts(r)[kind]);
  if (amounts.some((a) => a === null)) return null;
  const unit = amounts[0]!.unit;
  let sum = 0;
  for (const a of amounts) {
    const v = convert(a!.amount, a!.unit, unit);
    if (v === null) return null;
    sum += v;
  }
  return { amount: sum, unit };
}
