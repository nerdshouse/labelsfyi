import { describe, expect, it } from 'vitest';
import { decide, SOURCES } from './policy';

/**
 * FITLIX (fitlix.co.in): a multi-brand retailer registered as a MARKETPLACE
 * source with AUTHORIZED_FEED access. Authorization to fetch its catalogue was
 * confirmed by the operator (permissionRecord: operator-attested reference).
 * Only product pages are readable; the gate still requires both
 * permissionVerified and permissionRecord. productPath covers real FITLIX
 * handle shapes: long Shopify handles and percent-encoded ®/™.
 */
const fitlix = SOURCES.find((s) => s.id === 'fitlix')!;
const url = (path: string, host = 'fitlix.co.in') => new URL(`https://${host}${path}`);

// Real handle shapes from FITLIX's public product sitemap (paths only).
const LONG_ENCODED =
  '/products/muscleblaze-creamp-micronised-creatine-monohydrate-120g-citrus-blast-30-servings-3g-creatine-mb-creabsorb%E2%84%A2-trustified-certified-dcd-dht-free';
const LONGEST =
  '/products/ronnie-coleman-signature-series-pro-antium-whey-protein-2-27kg-5-lbs-cookies-and-cream-52-servings-30g-protein-supreme-multifaceted-protein-complex-with-digestive-enzymes-3g-creatine';
const SHORT = '/products/example-whey-1kg';

describe('FITLIX source registration', () => {
  it('is a verified retailer/marketplace source (not a brand)', () => {
    expect(fitlix).toMatchObject({
      id: 'fitlix',
      domain: 'fitlix.co.in',
      hosts: ['fitlix.co.in', 'www.fitlix.co.in'],
      sourceKind: 'MARKETPLACE',
      accessMode: 'AUTHORIZED_FEED',
      permissionVerified: true,
      permissionRecord: 'operator-attested:2026-09-30',
    });
  });

  it('allows FITLIX product pages, including long and encoded handles', () => {
    expect(LONGEST.length - '/products/'.length).toBeGreaterThan(121);
    for (const p of [SHORT, `${SHORT}/`, LONG_ENCODED, LONGEST])
      expect(decide(url(p)), p).toMatchObject({ allowed: true });
    // A literal ® in the input is percent-encoded by URL parsing and still matches.
    expect(decide(url('/products/creapure®-creatine')).allowed).toBe(true);
  });

  it('is refused again if either permission flag is removed (fail closed)', () => {
    expect(decide(url(SHORT), [{ ...fitlix, permissionVerified: false }])).toMatchObject({
      allowed: false,
      reason: 'PERMISSION_UNVERIFIED',
    });
    expect(decide(url(SHORT), [{ ...fitlix, permissionRecord: null }]).allowed).toBe(false);
  });

  it('rejects non-product pages and path tricks', () => {
    for (const p of [
      '/',
      '/products',
      '/products/',
      '/products.json',
      '/collections/all',
      '/collections/all/products/example-whey-1kg',
      '/pages/about',
      '/cart/',
      '/products/example/extra',
      '/products/-leading-dash',
      '/products/Example-Upper',
      '/products/a%2F..%2Fadmin', // encoded "/" stays refused
      '/products/a%2e%2e', // encoded "." stays refused
      '/products/a%5Cb', // encoded "\" stays refused
      '/products/a%20b', // encoded space stays refused
      `/products/${'a'.repeat(256)}`,
    ])
      expect(decide(url(p)), p).toMatchObject({ allowed: false });
  });

  it('never matches another host', () => {
    expect(decide(url(SHORT, 'evil.example')).allowed).toBe(false);
    expect(decide(url(SHORT, 'fitlix.co.in.evil.example')).allowed).toBe(false);
  });
});
