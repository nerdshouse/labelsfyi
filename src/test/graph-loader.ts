import { evaluate, parse } from 'groq-js';
import type { RawDoc } from '@/fixtures/helpers.ts';
import {
  BRANDS_QUERY,
  CATEGORIES_QUERY,
  COMPARISONS_QUERY,
  GOALS_QUERY,
  GUIDES_QUERY,
  PRODUCT_GOALS_QUERY,
  INGREDIENTS_QUERY,
  PRODUCTS_QUERY,
  REVIEWERS_QUERY,
} from '@/lib/content/queries';
import { assembleGraph, type ContentGraph } from '@/lib/content/repository';

/** Test helper: the real GROQ queries (groq-js) + real graph assembly over a dataset. */
export async function runGroq<T>(query: string, dataset: RawDoc[]): Promise<T> {
  return (await (await evaluate(parse(query), { dataset })).get()) as T;
}

export async function loadGraph(dataset: RawDoc[]): Promise<ContentGraph> {
  const [
    products,
    ingredients,
    guides,
    comparisons,
    brands,
    categories,
    reviewers,
    goals,
    productGoals,
  ] = await Promise.all(
    [
      PRODUCTS_QUERY,
      INGREDIENTS_QUERY,
      GUIDES_QUERY,
      COMPARISONS_QUERY,
      BRANDS_QUERY,
      CATEGORIES_QUERY,
      REVIEWERS_QUERY,
      GOALS_QUERY,
      PRODUCT_GOALS_QUERY,
    ].map((q) => runGroq<never[]>(q, dataset)),
  );
  return assembleGraph({
    products,
    ingredients,
    guides,
    comparisons,
    brands,
    categories,
    reviewers,
    goals,
    productGoals,
  } as never);
}
