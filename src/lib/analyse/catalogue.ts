import { ingredientSearchTerms } from '@/lib/comparison/search';
import { activeRows } from '@/lib/comparison/ingredients';
import type { ContentGraph } from '@/lib/content/repository';
import { findMatches, type MatchResult } from '@/lib/identity/match';
import { normalize } from '@/lib/search/engine';
import type { PageExtraction } from './extract';

/**
 * A compact, build-time index of the PUBLISHED catalogue for the analyser
 * ("compare this product against what we have"). Built from the same graph
 * as every page (/catalogue-index.json), so an unpublished product can never
 * appear, and the Worker never queries the CMS.
 */
export interface CatalogueIndex {
  v: 1;
  products: Array<{
    id: string;
    slug: string;
    brand: string;
    name: string;
    variant: string | null;
    ingredients: string[];
  }>;
  ingredients: Array<{ slug: string; name: string; terms: string[]; count: number }>;
}

export function buildCatalogueIndex(graph: ContentGraph): CatalogueIndex {
  return {
    v: 1,
    products: graph.products.map((p) => ({
      id: p._id,
      slug: p.slug,
      brand: p.brand.name,
      name: p.name,
      variant: p.variant,
      ingredients: [
        ...new Set(activeRows(p).flatMap((r) => (r.ingredient ? [r.ingredient.slug] : []))),
      ],
    })),
    ingredients: graph.ingredients
      .map((i) => ({
        slug: i.slug,
        name: i.name,
        terms: ingredientSearchTerms(i),
        count: i.products.length,
      }))
      .filter((i) => i.count > 0),
  };
}

export interface CatalogueContext {
  possibleSame: Array<MatchResult & { slug: string; brand: string; name: string }>;
  ingredients: Array<{ slug: string; name: string; count: number }>;
}

/** Suggestions only: the strict matcher (GTIN → brand gate → core name), never confirmed. */
export function catalogueContext(x: PageExtraction, index: CatalogueIndex): CatalogueContext {
  const records = index.products.map((p) => ({
    id: p.id,
    brand: p.brand,
    name: p.name,
    variant: p.variant,
  }));
  const matches = x.name
    ? findMatches({ id: 'analysed', brand: x.brand, name: x.name, gtin: x.gtin }, records).slice(
        0,
        3,
      )
    : [];
  const labels = [x.name ?? '', ...x.ingredients.map((i) => i.label)].map(normalize).join(' | ');
  const ingredients = index.ingredients.filter((i) =>
    i.terms.some(
      (t) =>
        t.length >= 3 &&
        new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(labels),
    ),
  );
  return {
    possibleSame: matches.map((m) => {
      const p = index.products.find((x) => x.id === m.existingId)!;
      return { ...m, slug: p.slug, brand: p.brand, name: p.name };
    }),
    ingredients: ingredients.map(({ slug, name, count }) => ({ slug, name, count })),
  };
}
