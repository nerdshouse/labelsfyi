import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetJwksCache, verifyAccessJwt } from './access-jwt';

/**
 * Regression: the Workers runtime (workerd) THROWS on fetch(…, { redirect:
 * 'error' }), so the production key fetcher never loaded the Access keys and
 * every real Access request got "Forbidden.". These tests run the REAL
 * default fetcher (no injected fetcher) against a Workers-like fetch.
 */
const TEAM = 'labelsfyi.cloudflareaccess.com';
const CERTS = `https://${TEAM}/cdn-cgi/access/certs`;
const AUD = 'aud-tag';
const NOW = 1_800_000_000_000;
const b64url = (b: Uint8Array | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

let keys: CryptoKeyPair;
let jwks: { keys: Array<JsonWebKey & { kid: string }> };
let token: string;

/** Behaves like workerd: rejects redirect:'error', never follows redirects itself. */
function workersFetch(respond: (url: string) => Response | Promise<Response>) {
  const calls: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, redirect: init?.redirect });
    if (init?.redirect === 'error')
      throw new TypeError(
        'Invalid redirect value, must be one of "follow" or "manual" ("error" won\'t be implemented since it does not make sense at the edge; use "manual" and check the response status code).',
      );
    return respond(url);
  });
  return { impl, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const verify = () => verifyAccessJwt(token, { teamDomain: TEAM, aud: AUD }, { nowMs: NOW });

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  jwks = { keys: [{ ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' }] };
  const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
  const p = b64url(
    JSON.stringify({
      iss: `https://${TEAM}`,
      aud: [AUD],
      exp: NOW / 1000 + 600,
      email: 'r@x.test',
    }),
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keys.privateKey,
    new TextEncoder().encode(`${h}.${p}`),
  );
  token = `${h}.${p}.${b64url(new Uint8Array(sig))}`;
});
beforeEach(() => resetJwksCache());
afterEach(() => vi.unstubAllGlobals());

describe('Access key fetch on the Workers runtime (default fetcher)', () => {
  it('uses redirect:"manual" and succeeds on a Workers-like fetch (HTTP 200)', async () => {
    const f = workersFetch((url) => (url === CERTS ? json(jwks) : json({}, 404)));
    vi.stubGlobal('fetch', f.impl);
    expect(await verify()).toEqual({ ok: true, email: 'r@x.test' });
    expect(f.calls).toEqual([{ url: CERTS, redirect: 'manual' }]);
  });

  it.each([301, 302, 307, 308])('rejects a %i redirect and never follows it', async (status) => {
    const f = workersFetch((url) =>
      url === CERTS
        ? new Response(null, { status, headers: { location: 'https://evil.example/certs' } })
        : json(jwks),
    );
    vi.stubGlobal('fetch', f.impl);
    expect(await verify()).toEqual({ ok: false, reason: 'could not load Access keys' });
    expect(f.calls.map((c) => c.url)).toEqual([CERTS]); // the Location was never requested
    expect(f.calls.every((c) => c.redirect === 'manual')).toBe(true);
  });

  it.each([400, 403, 404, 500, 503])('rejects HTTP %i', async (status) => {
    vi.stubGlobal('fetch', workersFetch(() => json({ error: 'x' }, status)).impl);
    expect(await verify()).toEqual({ ok: false, reason: 'could not load Access keys' });
  });

  it('rejects a network / runtime error', async () => {
    vi.stubGlobal(
      'fetch',
      workersFetch(() => {
        throw new TypeError('Network connection lost.');
      }).impl,
    );
    expect(await verify()).toEqual({ ok: false, reason: 'could not load Access keys' });
  });

  it('would have failed with the old redirect:"error" (the runtime throws)', async () => {
    const f = workersFetch(() => json(jwks));
    await expect(f.impl(CERTS, { redirect: 'error' })).rejects.toThrow(/Invalid redirect value/);
  });

  it('still validates the token after keys load (signature, issuer, audience)', async () => {
    vi.stubGlobal('fetch', workersFetch(() => json(jwks)).impl);
    expect(
      (await verifyAccessJwt(token, { teamDomain: TEAM, aud: 'other-aud' }, { nowMs: NOW })).ok,
    ).toBe(false);
    const [h, p] = token.split('.');
    expect(
      (await verifyAccessJwt(`${h}.${p}.AAAA`, { teamDomain: TEAM, aud: AUD }, { nowMs: NOW })).ok,
    ).toBe(false);
  });
});
