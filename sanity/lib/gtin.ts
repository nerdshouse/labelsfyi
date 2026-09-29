/**
 * GTIN validation for Studio fields. Keep in sync with src/lib/identity/gtin.ts
 * (parity is covered by src/lib/identity/identity.test.ts).
 */
export type GtinStatus = 'valid' | 'invalid_check_digit' | 'unrecognized';

export function normalizeGtin(raw: string | null | undefined): {
  status: GtinStatus;
  digits: string | null;
} {
  if (!raw) return { status: 'unrecognized', digits: null };
  const compact = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(compact)) return { status: 'unrecognized', digits: null };
  if (![8, 12, 13, 14].includes(compact.length)) return { status: 'unrecognized', digits: compact };
  const body = compact.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++)
    sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(compact.at(-1))
    ? { status: 'valid', digits: compact }
    : { status: 'invalid_check_digit', digits: compact };
}

/** Sanity validation: store normalised digits only; flag malformed values. */
export function gtinValidation(value: unknown): true | string {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || !/^\d+$/.test(value))
    return 'Store digits only (no spaces or hyphens).';
  const r = normalizeGtin(value);
  if (r.status === 'invalid_check_digit') return 'Check digit does not match: re-read the barcode.';
  if (r.status === 'unrecognized')
    return 'Not a GTIN-8/12/13/14. Record it as an external ID instead.';
  return true;
}
