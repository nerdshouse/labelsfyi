/**
 * GTIN / barcode normalisation.
 *
 * A barcode is the strongest *exact* identity key we have (found on every
 * product page in the first ingestion experiment), but it is still only a
 * key: a GTIN match suggests "same SKU", it never merges products by itself.
 *
 * Keep in sync with sanity/lib/gtin.ts (parity is tested).
 */

export type GtinKind = 'GTIN-8' | 'GTIN-12' | 'GTIN-13' | 'GTIN-14';

export type GtinResult =
  | { status: 'valid'; digits: string; kind: GtinKind }
  | { status: 'invalid_check_digit'; digits: string }
  | { status: 'unrecognized'; digits: string | null };

const KIND: Record<number, GtinKind> = { 8: 'GTIN-8', 12: 'GTIN-12', 13: 'GTIN-13', 14: 'GTIN-14' };

/** GS1 mod-10 check digit for the body (all digits except the last). */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    // Weights alternate 3,1,… starting from the rightmost body digit.
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Normalise a printed barcode. Spaces and hyphens are removed; anything else
 * non-numeric makes it unrecognised. Only 8/12/13/14-digit values with a
 * correct check digit are classified as GTINs.
 */
export function normalizeGtin(raw: string | null | undefined): GtinResult {
  if (!raw) return { status: 'unrecognized', digits: null };
  const compact = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(compact)) return { status: 'unrecognized', digits: null };
  const kind = KIND[compact.length];
  if (!kind) return { status: 'unrecognized', digits: compact };
  const expected = gtinCheckDigit(compact.slice(0, -1));
  if (expected !== Number(compact.at(-1)))
    return { status: 'invalid_check_digit', digits: compact };
  return { status: 'valid', digits: compact, kind };
}

/**
 * Canonical comparison key: GTIN-12/13/14 that encode the same item compare
 * equal once left-padded to 14 digits. GTIN-8 is kept distinct.
 */
export function gtinKey(raw: string | null | undefined): string | null {
  const r = normalizeGtin(raw);
  if (r.status !== 'valid') return null;
  return r.kind === 'GTIN-8' ? `8:${r.digits}` : r.digits.padStart(14, '0');
}
