import { parseUnit } from '@/lib/calculations/units';
import type { CandidateFact, ExtractedFactInput, ExtractedProduct, Provenance } from './types';

/**
 * The single, pure entry point from extracted data into the CMS.
 *
 * Boundary rules enforced here (and tested):
 * - Missing provenance → throws. Nothing without source, snapshot, URL and
 *   timestamps can enter the editorial system.
 * - Every fact is created "unverified", whatever the extractor claims.
 *   Verification is a human act recorded in the Studio.
 * - A candidate never references a product as *confirmed*; it may only
 *   suggest possible matches for a person to confirm.
 */

export class ProvenanceError extends Error {
  override name = 'ProvenanceError';
}

const AMOUNT_FIELDS = new Set([
  'pack_size',
  'serving_size',
  'ingredient_amount',
  'nutrient',
  'price',
  'mrp',
]);

/** Parse "2,000 mg" / "30g" / "₹1,499" into amount + unit (currency → no unit). */
export function parseAmount(value: string): { amount: number | null; unit: CandidateFact['unit'] } {
  const m = /(\d[\d,]*(?:\.\d+)?)\s*([a-zA-Zµμ]+)?/.exec(value.replace(/₹\s*/, ''));
  if (!m) return { amount: null, unit: null };
  const amount = Number(m[1]!.replace(/,/g, ''));
  if (!Number.isFinite(amount)) return { amount: null, unit: null };
  return { amount, unit: m[2] ? parseUnit(m[2]) : null };
}

export function assertProvenance(p: Partial<Provenance> | undefined): asserts p is Provenance {
  const missing = (['dataSourceId', 'snapshotId', 'sourceUrl', 'fetchedAt'] as const).filter(
    (k) => !p?.[k],
  );
  if (missing.length) throw new ProvenanceError(`Missing provenance: ${missing.join(', ')}`);
  if (!/^https?:\/\//.test(p!.sourceUrl!)) throw new ProvenanceError('sourceUrl must be absolute');
}

export function normalizeFact(input: ExtractedFactInput, index: number): CandidateFact {
  const parsed = AMOUNT_FIELDS.has(input.field)
    ? parseAmount(input.value)
    : { amount: null, unit: null };
  return {
    _key: `f${index.toString(36)}`,
    _type: 'extractedFact',
    field: input.field,
    ...(input.label ? { label: input.label } : {}),
    value: input.value.trim(),
    method: input.method,
    ...(input.confidence !== undefined
      ? { confidence: Math.min(1, Math.max(0, input.confidence)) }
      : {}),
    ...(input.imageRef ? { imageRef: input.imageRef } : {}),
    amount: parsed.amount,
    unit: parsed.unit,
    // Never trust an extractor's own verification claim.
    verificationStatus: 'unverified',
  };
}

export interface CandidateDocument {
  _id: string;
  _type: 'ingestionCandidate';
  title: string;
  dataSource: { _type: 'reference'; _ref: string };
  snapshot: { _type: 'reference'; _ref: string };
  sourceUrl: string;
  externalId: string | null;
  extractedAt: string;
  extractor: string;
  status: 'needs_verification';
  matchStatus: 'unmatched' | 'possible_match';
  possibleMatches: Array<{
    _key: string;
    _type: 'possibleMatch';
    product: { _type: 'reference'; _ref: string };
    reason: string;
    score: number;
  }>;
  facts: CandidateFact[];
}

export interface MatchableProduct {
  _id: string;
  name: string;
  brand: string;
  aliases?: string[];
}

const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );

/**
 * Suggest (never confirm) existing products this extraction may describe.
 * Deliberately simple token overlap; a person decides. Different flavours or
 * formulations are separate products, so a high score is still only a hint.
 */
export function suggestMatches(
  title: string,
  brand: string | undefined,
  products: MatchableProduct[],
  threshold = 0.5,
): CandidateDocument['possibleMatches'] {
  const want = tokens(`${brand ?? ''} ${title}`);
  return products
    .map((p) => {
      const names = [p.name, ...(p.aliases ?? [])];
      const score = Math.max(
        ...names.map((n) => {
          const have = tokens(`${p.brand} ${n}`);
          const overlap = [...want].filter((t) => have.has(t)).length;
          return overlap / Math.max(want.size, have.size);
        }),
      );
      return { p, score };
    })
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((m, i) => ({
      _key: `m${i}`,
      _type: 'possibleMatch' as const,
      product: { _type: 'reference' as const, _ref: m.p._id },
      reason: `Name/brand token overlap ${(m.score * 100).toFixed(0)}%. Confirm variant, pack size and formulation.`,
      score: Number(m.score.toFixed(2)),
    }));
}

/** Build the Sanity document for an extraction. Throws on missing provenance. */
export function toCandidateDocument(
  extracted: ExtractedProduct,
  existingProducts: MatchableProduct[] = [],
): CandidateDocument {
  assertProvenance(extracted.provenance);
  if (!extracted.extractedAt) throw new ProvenanceError('Missing extractedAt');
  if (!extracted.extractor) throw new ProvenanceError('Missing extractor');
  // fetchedAt is validated above and lives on the snapshot document.
  const { dataSourceId, snapshotId, sourceUrl } = extracted.provenance;
  const brand = extracted.facts.find((f) => f.field === 'brand')?.value;
  const possibleMatches = suggestMatches(extracted.title, brand, existingProducts);
  return {
    _id: `candidate.${snapshotId.replace(/^snapshot\./, '')}`,
    _type: 'ingestionCandidate',
    title: extracted.title,
    dataSource: { _type: 'reference', _ref: dataSourceId },
    snapshot: { _type: 'reference', _ref: snapshotId },
    sourceUrl,
    externalId: extracted.externalId ?? null,
    extractedAt: extracted.extractedAt,
    extractor: extracted.extractor,
    status: 'needs_verification',
    matchStatus: possibleMatches.length ? 'possible_match' : 'unmatched',
    possibleMatches,
    facts: extracted.facts.map(normalizeFact),
  };
}
