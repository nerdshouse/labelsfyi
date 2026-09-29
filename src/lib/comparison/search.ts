import { referencePrice } from '@/lib/calculations';
import type { Money } from '@/lib/calculations';
import type { ContentGraph } from '@/lib/content/repository';
import type {
  IngredientDetail,
  PriceSnapshotData,
  ProductDetail,
  Quantity,
  ServingSpec,
  VegStatus,
} from '@/lib/content/types';
import { labelVerification, type LabelVerification } from '@/lib/editorial/evidence';
import { normalize } from '@/lib/search/engine';
import {
  activeIngredientCount,
  disclosedActiveAmountCount,
  pricePer100MgElemental,
  pricePerServing,
} from './derive';
import { openDiscrepancyCount } from './discrepancy';
import { activeRows, ingredientAmounts, totalFor } from './ingredients';

/**
 * Comparison query layer: "magnesium" → comparison-ready rows. Facts only; no
 * scores, no "best". Rows are ordered by product name; ordering by any
 * metric is a presentation choice made by the caller.
 */
export interface ComparisonRow {
  product: { _id: string; name: string; slug: string; variant: string | null };
  brand: { name: string; slug: string };
  serving: ServingSpec | null;
  primaryIngredient: { _id: string; name: string; slug: string } | null;
  form: string | null;
  compoundAmount: Quantity | null;
  elementalAmount: Quantity | null;
  declaredAmount: Quantity | null;
  activeCount: number;
  disclosedActiveCount: number;
  price: PriceSnapshotData | null;
  pricePerServing: Money | null;
  pricePer100MgElemental: Money | null;
  vegStatus: VegStatus;
  labelVerification: LabelVerification;
  openDiscrepancyCount: number;
  isDemo: boolean;
}

function matchingIngredient(graph: ContentGraph, query: string): IngredientDetail | null {
  const q = normalize(query);
  if (!q) return null;
  return (
    graph.ingredients.find((i) =>
      [i.name, i.slug.replace(/-/g, ' '), ...i.commonLabelNames, ...i.forms.map((f) => f.name)]
        .map(normalize)
        .some((n) => n === q || n.split(' ').includes(q) || n.startsWith(q)),
    ) ?? null
  );
}

export function toComparisonRow(p: ProductDetail, ingredientId: string | null): ComparisonRow {
  const rows = activeRows(p);
  const primary =
    (ingredientId && rows.find((r) => r.ingredient?._id === ingredientId)) ||
    rows.find((r) => r.isKeyActive) ||
    rows[0] ||
    null;
  const primaryId = primary?.ingredient?._id ?? null;
  const amounts = primary ? ingredientAmounts(primary) : null;
  return {
    product: { _id: p._id, name: p.name, slug: p.slug, variant: p.variant },
    brand: { name: p.brand.name, slug: p.brand.slug },
    serving: p.serving,
    primaryIngredient: primary?.ingredient ?? null,
    form: primary?.form ?? null,
    compoundAmount: primaryId ? totalFor(rows, primaryId, 'compound') : (amounts?.compound ?? null),
    elementalAmount: primaryId
      ? totalFor(rows, primaryId, 'elemental')
      : (amounts?.elemental ?? null),
    declaredAmount: primaryId ? totalFor(rows, primaryId, 'declared') : (amounts?.declared ?? null),
    activeCount: activeIngredientCount(p),
    disclosedActiveCount: disclosedActiveAmountCount(p),
    price: referencePrice(p),
    pricePerServing: pricePerServing(p),
    pricePer100MgElemental: primaryId ? pricePer100MgElemental(p, primaryId) : null,
    vegStatus: p.vegStatus,
    labelVerification: labelVerification(p),
    openDiscrepancyCount: openDiscrepancyCount(p.discrepancies),
    isDemo: p.isDemo,
  };
}

/**
 * Products for a query. If the query names an ingredient (or a form/label
 * name of one), returns products containing it with that ingredient as the
 * primary; otherwise matches product, brand and variant names.
 */
export function searchProducts(graph: ContentGraph, query: string): ComparisonRow[] {
  const ingredient = matchingIngredient(graph, query);
  const q = normalize(query);
  const products = ingredient
    ? graph.products.filter((p) => activeRows(p).some((r) => r.ingredient?._id === ingredient._id))
    : graph.products.filter((p) =>
        normalize([p.name, p.brand.name, p.variant ?? '', p.subcategory ?? ''].join(' ')).includes(
          q,
        ),
      );
  return products
    .map((p) => toComparisonRow(p, ingredient?._id ?? null))
    .sort((a, b) => a.product.name.localeCompare(b.product.name));
}

/** Comparison rows for one canonical ingredient (ingredient pages, search partials). */
export function compareIngredient(graph: ContentGraph, ingredientId: string): ComparisonRow[] {
  return graph.products
    .filter((p) => activeRows(p).some((r) => r.ingredient?._id === ingredientId))
    .map((p) => toComparisonRow(p, ingredientId))
    .sort((a, b) => a.product.name.localeCompare(b.product.name));
}

/** Terms that resolve a search query to an ingredient comparison (built into a static index). */
export function ingredientSearchTerms(i: IngredientDetail): string[] {
  return [
    ...new Set(
      [i.name, i.slug.replace(/-/g, ' '), ...i.commonLabelNames, ...i.forms.map((f) => f.name)].map(
        normalize,
      ),
    ),
  ];
}
