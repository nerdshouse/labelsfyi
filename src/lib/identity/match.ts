import { gtinKey } from './gtin';

/**
 * Product matching for ingestion. Replaces name-token similarity, which
 * produced false positives in the first real experiment ("Daily Probiotic
 * Slow" ~ "PCOS Balance Slow" because brand + "slow" dominated the score).
 *
 * Rules:
 *   1. Exact normalised GTIN            → EXACT (same SKU; still needs a person)
 *   2. Brand is a gate                  → different/unknown brand never scores
 *   3. Core name (brand, pack size, flavour and generic words removed) must be
 *      equal for a HIGH_CONFIDENCE_CANDIDATE; differences in pack size, flavour,
 *      form or barcode are reported as the *relation*, never silently merged.
 *   4. Nothing here confirms a match. `requiresHumanConfirmation` is always true.
 */

export type MatchLevel = 'EXACT' | 'HIGH_CONFIDENCE_CANDIDATE' | 'POSSIBLE_MATCH' | 'NO_MATCH';

export type MatchRelation =
  | 'same_sku'
  | 'same_product'
  | 'pack_size_variant'
  | 'flavour_variant'
  | 'different_form'
  | 'different_barcode'
  | 'possible_reformulation'
  | 'sibling_product'
  | 'different_product'
  | 'different_brand';

export interface IdentityRecord {
  id: string;
  brand: string | null;
  name: string;
  /** Flavour / strength variant, e.g. "Dark Chocolate", "5mg". */
  variant?: string | null;
  /** Physical form: capsule, powder, strip… */
  form?: string | null;
  /** Pack size in a comparable form, e.g. "60 capsule", "1 kg". */
  packSize?: string | null;
  gtin?: string | null;
  /** Optional fingerprint of the declared actives, to spot reformulations under one GTIN. */
  formulationSignature?: string | null;
}

export interface MatchResult {
  candidateId: string;
  existingId: string;
  level: MatchLevel;
  relation: MatchRelation;
  reasons: string[];
  requiresHumanConfirmation: true;
}

/**
 * Words that describe product lines or marketing, not identity. They are
 * removed before comparing core names so they can't create matches.
 */
const GENERIC = new Set([
  'slow',
  'daily',
  'balance',
  'complex',
  'advanced',
  'premium',
  'pure',
  'natural',
  'organic',
  'plus',
  'with',
  'and',
  'for',
  'the',
  'of',
  'in',
  'a',
  'high',
  'strength',
  'max',
  'ultra',
  'extra',
  'super',
  'supplement',
  'supplements',
  'formula',
  'health',
  'support',
  'men',
  'women',
  'melts',
  'unflavoured',
  'unflavored',
  'flavour',
  'flavor',
  'pack',
  'new',
  'best',
  'x',
  'essential',
]);
const PACK_TOKEN =
  /^\d+(\.\d+)?(g|gm|kg|mg|ml|l|caps?|capsules?|tabs?|tablets?|softgels?|strips?|sachets?|servings?|n)?$/;

const words = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

export const normalizeBrand = (b: string | null | undefined) => words(b).join(' ') || null;

/** Core identity tokens: brand, pack sizes, variant words and generic words removed. */
export function coreNameTokens(r: Pick<IdentityRecord, 'name' | 'brand' | 'variant'>): string[] {
  const drop = new Set([...words(r.brand), ...words(r.variant)]);
  const out = words(r.name).filter(
    (w) => !drop.has(w) && !GENERIC.has(w) && !PACK_TOKEN.test(w) && w !== 'kg' && w !== 'g',
  );
  return [...new Set(out)].sort();
}

const sameText = (a?: string | null, b?: string | null) =>
  words(a).join(' ') === words(b).join(' ');
const bothKnown = (a?: string | null, b?: string | null) => Boolean(a && b);

export function matchProduct(candidate: IdentityRecord, existing: IdentityRecord): MatchResult {
  const base = {
    candidateId: candidate.id,
    existingId: existing.id,
    requiresHumanConfirmation: true as const,
  };
  const ga = gtinKey(candidate.gtin);
  const gb = gtinKey(existing.gtin);

  // 1. Exact barcode.
  if (ga && gb && ga === gb) {
    if (
      candidate.formulationSignature &&
      existing.formulationSignature &&
      candidate.formulationSignature !== existing.formulationSignature
    ) {
      return {
        ...base,
        level: 'EXACT',
        relation: 'possible_reformulation',
        reasons: [
          'Same GTIN',
          'Declared actives differ: record a new label version; do not overwrite history',
        ],
      };
    }
    return { ...base, level: 'EXACT', relation: 'same_sku', reasons: ['Same GTIN'] };
  }

  // 2. Brand gate.
  const ba = normalizeBrand(candidate.brand);
  const bb = normalizeBrand(existing.brand);
  if (!ba || !bb || ba !== bb) {
    return {
      ...base,
      level: 'NO_MATCH',
      relation: 'different_brand',
      reasons: [
        !ba || !bb ? 'Brand unknown: brand is required before name matching' : 'Different brand',
      ],
    };
  }

  // 3. Core name.
  const ca = coreNameTokens(candidate);
  const cb = coreNameTokens(existing);
  const sameCore = ca.length > 0 && ca.join(' ') === cb.join(' ');
  if (!sameCore) {
    const shared = ca.filter((t) => cb.includes(t));
    const extra = [...ca.filter((t) => !cb.includes(t)), ...cb.filter((t) => !ca.includes(t))];
    if (shared.length > 0 && shared.length === Math.min(ca.length, cb.length)) {
      return {
        ...base,
        level: 'NO_MATCH',
        relation: 'sibling_product',
        reasons: [
          `Same brand; names differ by: ${extra.join(', ')}`,
          'Likely a related but different product',
        ],
      };
    }
    return {
      ...base,
      level: 'NO_MATCH',
      relation: 'different_product',
      reasons: ['Same brand, different product name'],
    };
  }

  const reasons = ['Same brand', 'Same core product name'];
  if (bothKnown(candidate.form, existing.form) && !sameText(candidate.form, existing.form)) {
    return {
      ...base,
      level: 'POSSIBLE_MATCH',
      relation: 'different_form',
      reasons: [...reasons, 'Different form'],
    };
  }
  if (
    bothKnown(candidate.variant, existing.variant) &&
    !sameText(candidate.variant, existing.variant)
  ) {
    return {
      ...base,
      level: 'POSSIBLE_MATCH',
      relation: 'flavour_variant',
      reasons: [
        ...reasons,
        'Different flavour/variant: usually a separate product (different label)',
      ],
    };
  }
  if (
    bothKnown(candidate.packSize, existing.packSize) &&
    !sameText(candidate.packSize, existing.packSize)
  ) {
    return {
      ...base,
      level: 'HIGH_CONFIDENCE_CANDIDATE',
      relation: 'pack_size_variant',
      reasons: [...reasons, 'Different pack size: same canonical product, separate listing/SKU'],
    };
  }
  if (ga && gb && ga !== gb) {
    return {
      ...base,
      level: 'POSSIBLE_MATCH',
      relation: 'different_barcode',
      reasons: [
        ...reasons,
        'Different GTIN: do not assume identical (regional SKU, reformulation or error)',
      ],
    };
  }
  return { ...base, level: 'HIGH_CONFIDENCE_CANDIDATE', relation: 'same_product', reasons };
}

const RANK: Record<MatchLevel, number> = {
  EXACT: 3,
  HIGH_CONFIDENCE_CANDIDATE: 2,
  POSSIBLE_MATCH: 1,
  NO_MATCH: 0,
};

/** All non-NO_MATCH results, strongest first. */
export function findMatches(candidate: IdentityRecord, existing: IdentityRecord[]): MatchResult[] {
  return existing
    .map((e) => matchProduct(candidate, e))
    .filter((m) => m.level !== 'NO_MATCH')
    .sort((a, b) => RANK[b.level] - RANK[a.level]);
}
