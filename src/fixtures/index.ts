import type { RawDoc } from './helpers.ts';
import { comparisons, guides, reviews } from './editorial.ts';
import { ingestion } from './ingestion.ts';
import { ingredients } from './ingredients.ts';
import { products } from './products.ts';
import { brands, categories, merchants, reviewer, sources } from './reference.ts';

/**
 * The complete demo dataset as raw Sanity documents.
 *
 * Used (1) by the demo content source so the site builds with no Sanity
 * project, and (2) by `pnpm demo:export` to produce an NDJSON file that can be
 * imported into a Sanity dataset. Everything is flagged `isDemo`.
 */
export const demoDataset: RawDoc[] = [
  ...reviewer,
  ...merchants,
  ...categories,
  ...brands,
  ...sources,
  ...ingredients,
  ...products,
  ...guides,
  ...comparisons,
  ...reviews,
  ...ingestion,
];
