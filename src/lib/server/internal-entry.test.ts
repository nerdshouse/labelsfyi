import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isInternalRequest } from './internal-auth';

/**
 * /internal is the reviewer entry point. It must be a Worker route (so the
 * /internal middleware — Access JWT, then Basic auth — runs before it), and
 * it must only redirect to /internal/review, carrying no auth of its own.
 * scripts/check-dist.ts additionally asserts the route is in the built
 * manifest; scripts/route-check.ts asserts it is never a public 404.
 */
const source = readFileSync(new URL('../../pages/internal/index.astro', import.meta.url), 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '');

describe('/internal entry point', () => {
  it('is rendered on demand by the Worker (not a static page)', () => {
    expect(code).toMatch(/export const prerender = false;/);
  });
  it('only redirects to /internal/review', () => {
    expect(code).toMatch(/return Astro\.redirect\('\/internal\/review', 302\);/);
    expect(code).not.toMatch(/<[a-z]/i); // renders no markup of its own
  });
  it('implements no authentication of its own (the middleware does)', () => {
    expect(code).not.toMatch(/checkInternalAccess|verifyAccessJwt|authorization|REVIEW_/i);
  });
  it('is covered by the /internal middleware, including slash and encoded forms', () => {
    for (const p of ['/internal', '/internal/', '/%69nternal', '/INTERNAL'])
      expect(isInternalRequest(p, '/internal'), p).toBe(true);
    expect(isInternalRequest('/internal', undefined)).toBe(true);
  });
});
