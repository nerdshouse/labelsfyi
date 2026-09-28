import type {
  DoseBasis,
  LabelPanelData,
  PriceSnapshotData,
  ProductSummary,
  Quantity,
} from '@/lib/content/types';
import {
  pricePerEffectiveDose,
  pricePerGram,
  pricePerServing,
  resolveServings,
  type CalcResult,
  type Money,
  type ServingsBasis,
} from './price';

/**
 * Composes the pure price functions with product data. Still UI-free.
 */

/** Prices older than this are flagged "may have changed". */
export const PRICE_STALE_AFTER_DAYS = 30;

export function isPriceStale(snapshot: PriceSnapshotData, now: Date = new Date()): boolean {
  const age = (now.getTime() - new Date(snapshot.capturedAt).getTime()) / 86_400_000;
  return age > PRICE_STALE_AFTER_DAYS;
}

/** Most recent snapshot for each merchant, newest first. */
export function latestPricesByMerchant(prices: PriceSnapshotData[]): PriceSnapshotData[] {
  const latest = new Map<string, PriceSnapshotData>();
  for (const p of prices) {
    const current = latest.get(p.merchant._id);
    if (!current || p.capturedAt > current.capturedAt) latest.set(p.merchant._id, p);
  }
  return [...latest.values()].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

/**
 * The reference price for cost calculations: the lowest *per-serving* latest
 * in-stock observation. Falls back to any latest observation if none are in
 * stock. Comparing per serving (not per pack) keeps different pack sizes fair.
 */
export function referencePrice(
  product: Pick<ProductSummary, 'prices' | 'servingSize' | 'servingsPerContainer'>,
): PriceSnapshotData | null {
  const latest = latestPricesByMerchant(product.prices);
  const pool = latest.some((p) => p.availability !== 'out_of_stock')
    ? latest.filter((p) => p.availability !== 'out_of_stock')
    : latest;
  let best: { snap: PriceSnapshotData; perServing: number } | null = null;
  for (const snap of pool) {
    const cost = productCosts(product, snap).perServing;
    const perServing = cost.ok ? cost.value.amount : Number.POSITIVE_INFINITY;
    if (!best || perServing < best.perServing) best = { snap, perServing };
  }
  return best?.snap ?? null;
}

export interface ProductCosts {
  snapshot: PriceSnapshotData | null;
  servings: CalcResult<{ servings: number; basis: ServingsBasis }>;
  perServing: CalcResult<Money>;
  perGram: CalcResult<Money>;
}

export function productCosts(
  product: Pick<ProductSummary, 'servingSize' | 'servingsPerContainer'>,
  snapshot: PriceSnapshotData | null,
): ProductCosts {
  const servings = resolveServings({
    servings: snapshot?.servings ?? product.servingsPerContainer,
    packSize: snapshot?.packSize,
    servingSize: product.servingSize,
  });
  const n = servings.ok ? servings.value.servings : null;
  const price = snapshot?.price ?? null;
  const currency = snapshot?.currency ?? 'INR';
  return {
    snapshot,
    servings,
    perServing: pricePerServing({ price, currency, servings: n }),
    perGram: pricePerGram({ price, currency, packSize: snapshot?.packSize }),
  };
}

/** Amount of the dose-basis active per serving, from the current label panel. */
export function amountPerServingFor(
  panels: Pick<LabelPanelData, 'isCurrent' | 'ingredients' | 'nutrients'>[],
  basis: DoseBasis,
): Quantity | null {
  const current = panels.filter((p) => p.isCurrent);
  if (basis.kind === 'nutrient') {
    for (const panel of current) {
      const row = panel.nutrients.find((n) => n.nutrientKey === basis.nutrientKey);
      if (row && row.perServing !== null) return { amount: row.perServing, unit: row.unit };
    }
    return null;
  }
  const rows = current.flatMap((p) =>
    p.ingredients.filter((r) => r.ingredient?._id === basis.ingredient?._id),
  );
  // If any matching row hides its amount (e.g. in a blend) the total is unknown.
  if (!rows.length || rows.some((r) => r.amountPerServing === null || !r.unit)) return null;
  const unit = rows[0]!.unit!;
  if (rows.some((r) => r.unit !== unit)) return null;
  return { amount: rows.reduce((sum, r) => sum + (r.amountPerServing ?? 0), 0), unit };
}

/** Key-active amount per serving for summary cards (no panels available). */
export function amountFromKeyRows(
  product: Pick<ProductSummary, 'keyActives' | 'keyNutrients'>,
  basis: DoseBasis,
): Quantity | null {
  return amountPerServingFor(
    [{ isCurrent: true, ingredients: product.keyActives, nutrients: product.keyNutrients }],
    basis,
  );
}

export function effectiveDoseCost(
  product: Pick<
    ProductSummary,
    'prices' | 'servingSize' | 'servingsPerContainer' | 'keyActives' | 'keyNutrients'
  >,
  basis: DoseBasis,
  amountPerServing: Quantity | null = amountFromKeyRows(product, basis),
) {
  const snapshot = referencePrice(product);
  const costs = productCosts(product, snapshot);
  return {
    ...costs,
    amountPerServing,
    perDose: pricePerEffectiveDose({
      price: snapshot?.price ?? null,
      currency: snapshot?.currency ?? 'INR',
      servings: costs.servings.ok ? costs.servings.value.servings : null,
      amountPerServing,
      referenceDose: { amount: basis.amount, unit: basis.unit },
    }),
  };
}
