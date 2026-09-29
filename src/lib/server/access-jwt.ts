/**
 * Cloudflare Access verification for /internal/* (docs/security.md).
 *
 * Access sits in front of the Worker and adds a signed JWT
 * (Cf-Access-Jwt-Assertion) to every request it lets through. The Worker
 * verifies that JWT itself, so a request that somehow bypasses Access (a
 * misconfigured application path, a new hostname, a workers.dev URL) is still
 * refused. HTTP Basic auth (internal-auth.ts) remains the second layer.
 *
 * Checks: RS256 signature against the team's published keys, `iss` = the team
 * domain, `aud` contains the application AUD tag, `exp`/`nbf` with 60 s skew.
 */

export interface AccessConfig {
  /** e.g. "labelsfyi.cloudflareaccess.com" (a scheme is tolerated). */
  teamDomain: string;
  /** The Access application's Audience (AUD) tag. */
  aud: string;
}

interface Jwk {
  kid?: string;
  kty: string;
  n?: string;
  e?: string;
  alg?: string;
}
export type JwksFetcher = (certsUrl: string) => Promise<{ keys: Jwk[] }>;

const SKEW_S = 60;
const JWKS_TTL_MS = 10 * 60 * 1000;
let cache: { url: string; at: number; keys: Jwk[] } | null = null;

/** Test hook. */
export function resetJwksCache(): void {
  cache = null;
}

export function normaliseTeamDomain(raw: string): string | null {
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(host) ? host : null;
}

const defaultFetcher: JwksFetcher = async (certsUrl) => {
  // 'manual', never 'error': the Workers runtime throws on redirect:'error'.
  // A redirect is returned unfollowed (3xx, ok === false) and rejected below.
  const res = await fetch(certsUrl, { redirect: 'manual' });
  if (!res.ok) throw new Error(`Access certs HTTP ${res.status}`);
  return (await res.json()) as { keys: Jwk[] };
};

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64url');
  const pad = s
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(s))) as unknown;

async function keysFor(team: string, fetcher: JwksFetcher, now: number, refresh = false) {
  const url = `https://${team}/cdn-cgi/access/certs`;
  if (!refresh && cache && cache.url === url && now - cache.at < JWKS_TTL_MS) return cache.keys;
  const { keys } = await fetcher(url);
  if (!Array.isArray(keys)) throw new Error('Access certs: no keys');
  cache = { url, at: now, keys };
  return keys;
}

export type AccessResult = { ok: true; email: string | null } | { ok: false; reason: string };

export async function verifyAccessJwt(
  token: string | null,
  config: AccessConfig,
  opts: { fetcher?: JwksFetcher; nowMs?: number } = {},
): Promise<AccessResult> {
  const team = normaliseTeamDomain(config.teamDomain);
  if (!team || !config.aud) return { ok: false, reason: 'Access is not configured correctly' };
  if (!token) return { ok: false, reason: 'missing Access token' };
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 16_384) return { ok: false, reason: 'malformed token' };
  const [h, p, sig] = parts as [string, string, string];
  let header: { alg?: string; kid?: string };
  let payload: {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    nbf?: number;
    email?: string;
  };
  let signature: Uint8Array<ArrayBuffer>;
  try {
    header = b64urlJson(h) as typeof header;
    payload = b64urlJson(p) as typeof payload;
    signature = b64urlBytes(sig);
  } catch {
    return { ok: false, reason: 'malformed token' };
  }
  // Only RS256: never "none", never HMAC (alg-confusion).
  if (header.alg !== 'RS256' || !header.kid) return { ok: false, reason: 'unsupported algorithm' };

  const nowMs = opts.nowMs ?? Date.now();
  const fetcher = opts.fetcher ?? defaultFetcher;
  let jwk: Jwk | undefined;
  try {
    jwk = (await keysFor(team, fetcher, nowMs)).find((k) => k.kid === header.kid);
    // Keys rotate: refetch once for an unknown kid.
    jwk ??= (await keysFor(team, fetcher, nowMs, true)).find((k) => k.kid === header.kid);
  } catch {
    return { ok: false, reason: 'could not load Access keys' };
  }
  if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) return { ok: false, reason: 'unknown key' };

  let valid: boolean;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signature,
      new TextEncoder().encode(`${h}.${p}`),
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'bad signature' };

  const now = Math.floor(nowMs / 1000);
  if (payload.iss !== `https://${team}`) return { ok: false, reason: 'wrong issuer' };
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(config.aud)) return { ok: false, reason: 'wrong audience' };
  if (typeof payload.exp !== 'number' || payload.exp + SKEW_S < now)
    return { ok: false, reason: 'expired' };
  if (typeof payload.nbf === 'number' && payload.nbf - SKEW_S > now)
    return { ok: false, reason: 'not yet valid' };
  return { ok: true, email: typeof payload.email === 'string' ? payload.email : null };
}
