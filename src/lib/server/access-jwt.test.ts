import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  normaliseTeamDomain,
  resetJwksCache,
  verifyAccessJwt,
  type JwksFetcher,
} from './access-jwt';

const TEAM = 'labelsfyi.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const NOW = 1_800_000_000_000;
const cfg = { teamDomain: TEAM, aud: AUD };

const b64url = (b: Uint8Array | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

let keys: CryptoKeyPair;
let other: CryptoKeyPair;
let jwks: { keys: JsonWebKey[] };

const gen = () =>
  crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>;

async function sign(
  payload: Record<string, unknown>,
  opts: { key?: CryptoKey; header?: Record<string, unknown> } = {},
) {
  const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1', ...opts.header }));
  const p = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    opts.key ?? keys.privateKey,
    new TextEncoder().encode(`${h}.${p}`),
  );
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}
const good = {
  iss: `https://${TEAM}`,
  aud: [AUD],
  exp: NOW / 1000 + 600,
  nbf: NOW / 1000 - 10,
  email: 'reviewer@example.com',
};
const fetcher: JwksFetcher = async (url) => {
  expect(url).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
  return jwks as never;
};
const verify = (t: string | null, c = cfg) => verifyAccessJwt(t, c, { fetcher, nowMs: NOW });

beforeAll(async () => {
  keys = await gen();
  other = await gen();
  const pub = await crypto.subtle.exportKey('jwk', keys.publicKey);
  jwks = { keys: [{ ...pub, kid: 'k1' } as JsonWebKey] };
});
beforeEach(() => resetJwksCache());

describe('Cloudflare Access JWT verification', () => {
  it('accepts a valid token from the team for this application', async () => {
    expect(await verify(await sign(good))).toEqual({ ok: true, email: 'reviewer@example.com' });
  });

  it('rejects missing, malformed and unsigned tokens', async () => {
    expect((await verify(null)).ok).toBe(false);
    expect((await verify('abc')).ok).toBe(false);
    expect((await verify('a.b.c')).ok).toBe(false);
    const [h, p] = (await sign(good)).split('.');
    expect((await verify(`${h}.${p}.`)).ok).toBe(false);
    const none = `${b64url(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${p}.`;
    expect(await verify(none)).toMatchObject({ ok: false, reason: 'unsupported algorithm' });
    const hs = await sign(good, { header: { alg: 'HS256' } });
    expect(await verify(hs)).toMatchObject({ ok: false, reason: 'unsupported algorithm' });
  });

  it('rejects a token signed by another key, or with a tampered payload', async () => {
    expect(await verify(await sign(good, { key: other.privateKey }))).toMatchObject({
      ok: false,
      reason: 'bad signature',
    });
    const [h, , s] = (await sign(good)).split('.');
    const forged = b64url(JSON.stringify({ ...good, email: 'attacker@example.com' }));
    expect((await verify(`${h}.${forged}.${s}`)).ok).toBe(false);
  });

  it('rejects an unknown key id', async () => {
    expect(await verify(await sign(good, { header: { kid: 'nope' } }))).toMatchObject({
      ok: false,
      reason: 'unknown key',
    });
  });

  it('checks issuer, audience, expiry and not-before', async () => {
    expect(
      (await verify(await sign({ ...good, iss: 'https://evil.cloudflareaccess.com' }))).ok,
    ).toBe(false);
    expect((await verify(await sign({ ...good, aud: ['other-app'] }))).ok).toBe(false);
    expect((await verify(await sign({ ...good, aud: AUD }))).ok).toBe(true);
    expect((await verify(await sign({ ...good, exp: NOW / 1000 - 120 }))).ok).toBe(false);
    expect((await verify(await sign({ ...good, exp: undefined }))).ok).toBe(false);
    expect((await verify(await sign({ ...good, nbf: NOW / 1000 + 600 }))).ok).toBe(false);
  });

  it('fails closed when keys cannot be loaded or config is wrong', async () => {
    const t = await sign(good);
    expect(
      await verifyAccessJwt(t, cfg, {
        nowMs: NOW,
        fetcher: async () => {
          throw new Error('down');
        },
      }),
    ).toMatchObject({ ok: false, reason: 'could not load Access keys' });
    expect((await verify(t, { teamDomain: 'evil.example.com', aud: AUD })).ok).toBe(false);
    expect((await verify(t, { teamDomain: TEAM, aud: '' })).ok).toBe(false);
  });

  it('normalises only real Access team domains', () => {
    expect(normaliseTeamDomain('https://LabelsFYI.cloudflareaccess.com/')).toBe(TEAM);
    expect(normaliseTeamDomain('labelsfyi.cloudflareaccess.com.evil.com')).toBeNull();
    expect(normaliseTeamDomain('evil.com/labelsfyi.cloudflareaccess.com')).toBeNull();
  });
});
