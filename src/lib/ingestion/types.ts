/**
 * Ingestion contracts (docs/ingestion.md). TYPES ONLY for adapters: there is
 * no crawler, scheduler or network code in this repository yet.
 *
 * Pipeline shape:
 *   SourceAdapter.discover → fetch → RawSnapshot (archived, append-only)
 *   SourceAdapter.extract  → ExtractedProduct (Layer A: what the source said)
 *   toCandidateDocument    → ingestionCandidate (unverified; never published)
 *   human verification     → observation / label panel / claim (Layer B/C)
 *                            → normal editorial workflow → published
 */

import type { Unit } from '@/lib/content/types';

export type ExtractionMethod = 'manual' | 'structured_data' | 'parser' | 'ocr' | 'ai';

export type ExtractedField =
  | 'name'
  | 'brand'
  | 'gtin'
  | 'variant'
  | 'pack_size'
  | 'serving_size'
  | 'servings_per_container'
  | 'ingredient_amount'
  | 'ingredient_form'
  | 'ingredient_list'
  | 'nutrient'
  | 'claim'
  | 'veg_marker'
  | 'price'
  | 'mrp'
  | 'image'
  | 'other';

export type ImageRole = 'front' | 'ingredients' | 'nutrition' | 'back' | 'other' | 'unknown';

/** Where and when a piece of external data was seen. Required on everything downstream. */
export interface Provenance {
  dataSourceId: string;
  snapshotId: string;
  sourceUrl: string;
  fetchedAt: string;
}

export interface RawProductReference {
  dataSourceId: string;
  url: string;
  externalId?: string;
  discoveredAt: string;
}

export interface SnapshotImageRef {
  sourceUrl: string;
  /** Object-storage key of our archived copy, if one was made. */
  storageKey?: string;
  role: ImageRole;
  roleAssignedBy?: 'human' | 'parser' | 'ocr' | 'ai';
}

export interface RawSnapshot {
  id: string;
  dataSourceId: string;
  url: string;
  fetchedAt: string;
  httpStatus: number;
  contentHash: string;
  title?: string;
  /** Raw body lives in object storage, never in Sanity. */
  rawContentKey?: string;
  /** Minimal text needed to verify facts. Not a copy of the page. */
  excerpt?: string;
  images: SnapshotImageRef[];
  capturedBy: string;
}

export interface ExtractedFactInput {
  field: ExtractedField;
  label?: string;
  /** Exactly as the source states it. */
  value: string;
  method: ExtractionMethod;
  confidence?: number;
  imageRef?: string;
}

export interface ExtractedProduct {
  provenance: Provenance;
  title: string;
  externalId?: string;
  extractedAt: string;
  extractor: string;
  facts: ExtractedFactInput[];
}

export type FetchResult =
  | { ok: true; snapshot: RawSnapshot }
  | {
      ok: false;
      reason: 'blocked_by_policy' | 'http_error' | 'rate_limited' | 'network' | 'parse';
      detail?: string;
    };

/**
 * One adapter per source (e.g. a brand's D2C site, a marketplace). Adapters
 * only read and extract; they never write labels.fyi content. A failed fetch
 * returns a reason instead of throwing, so a run can finish as "partial".
 */
export interface SourceAdapter {
  id: string;
  version: string;
  dataSourceId: string;
  canHandle(url: string): boolean;
  discover(): AsyncIterable<RawProductReference>;
  fetch(ref: RawProductReference): Promise<FetchResult>;
  extract(snapshot: RawSnapshot): Promise<ExtractedProduct[]>;
}

/** Normalised fact as stored inside an ingestionCandidate. Always unverified on creation. */
export interface CandidateFact extends ExtractedFactInput {
  _key: string;
  _type: 'extractedFact';
  amount: number | null;
  unit: Unit | null;
  verificationStatus: 'unverified';
}
