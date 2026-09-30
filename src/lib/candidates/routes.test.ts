import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkInternalAccess, internalActor, isInternalRequest } from '@/lib/server/internal-auth';

/**
 * /internal/candidates/* stays private: Worker-rendered, behind the /internal
 * middleware (Access JWT → Basic auth → same-origin POST), with no auth of its
 * own, and the recorded actor comes from that authentication only.
 */
const read = (p: string) =>
  readFileSync(new URL(`../../pages/internal/candidates/${p}`, import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
const pages = ['index.astro', '[id].astro', '[id]/action.ts'];
const env = { REVIEW_USER: 'reviewer', REVIEW_PASSWORD: 'correct horse battery staple' };
const basic = (u: string, p: string) => `Basic ${btoa(`${u}:${p}`)}`;
const url = new URL('https://labels.fyi/internal/candidates/candidate.fitlix.1/action');
const post = (headers: Record<string, string>) =>
  new Request(url, { method: 'POST', headers, body: new URLSearchParams({ action: 'reject' }) });

describe('candidate review routes', () => {
  it.each(pages)('%s is on-demand and implements no auth of its own', (p) => {
    const code = read(p);
    expect(code).toMatch(/export const prerender = false;/);
    expect(code).not.toMatch(/checkInternalAccess|verifyAccessJwt|REVIEW_USER|REVIEW_PASSWORD/);
  });

  it('actions take the actor only from the middleware, never the form', () => {
    const code = read('[id]/action.ts');
    expect(code).toMatch(/locals\.internalActor/);
    expect(code).not.toMatch(/reviewer|reviewedBy|fd\.get\(/);
  });

  it('are covered by the /internal middleware (incl. encoded paths)', () => {
    for (const p of [
      '/internal/candidates',
      '/internal/candidates/candidate.fitlix.1',
      '/internal/candidates/candidate.fitlix.1/action',
      '/%69nternal/candidates/x/action',
    ])
      expect(isInternalRequest(p, undefined), p).toBe(true);
  });

  it('rejects unauthenticated, wrong-password and cross-origin action POSTs', () => {
    expect(checkInternalAccess(post({ origin: url.origin }), url, env)?.status).toBe(401);
    expect(
      checkInternalAccess(
        post({ origin: url.origin, authorization: basic('reviewer', 'wrong') }),
        url,
        env,
      )?.status,
    ).toBe(401);
    const auth = basic(env.REVIEW_USER, env.REVIEW_PASSWORD);
    expect(
      checkInternalAccess(post({ origin: 'https://evil.example', authorization: auth }), url, env)
        ?.status,
    ).toBe(403);
    expect(checkInternalAccess(post({ authorization: auth }), url, env)?.status).toBe(403);
    expect(
      checkInternalAccess(post({ origin: url.origin, authorization: auth }), url, env),
    ).toBeNull();
    expect(checkInternalAccess(post({}), url, {})?.status).toBe(503);
  });

  it('actor: Access email first, else the Basic auth user', () => {
    const r = post({ authorization: basic('reviewer', 'pw:with:colons') });
    expect(internalActor(r, 'a@example.com')).toBe('a@example.com');
    expect(internalActor(r, null)).toBe('reviewer');
    expect(internalActor(post({}), null)).toBeNull();
    expect(internalActor(post({ authorization: 'Bearer x' }), null)).toBeNull();
    expect(internalActor(post({ authorization: 'Basic !!!' }), null)).toBeNull();
  });
});
