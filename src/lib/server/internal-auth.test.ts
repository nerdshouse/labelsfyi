import { describe, expect, it } from 'vitest';
import { checkInternalAccess, isInternalRequest } from './internal-auth';

const url = new URL('https://labels.fyi/internal/review');
const env = { REVIEW_USER: 'reviewer', REVIEW_PASSWORD: 'correct horse:battery' };
const basic = (u: string, p: string) => `Basic ${btoa(`${u}:${p}`)}`;
const req = (headers: Record<string, string> = {}, method = 'GET') =>
  new Request(url, { method, headers });

describe('internal route protection', () => {
  it('recognises internal paths, including encoded and doubled-slash variants', () => {
    for (const p of [
      '/internal',
      '/internal/review',
      '/%69nternal/review',
      '//internal/review',
      '/INTERNAL/review',
      '/internal%2freview',
    ])
      expect(isInternalRequest(p, undefined), p).toBe(true);
    expect(isInternalRequest('/anything', '/internal/review/[id]')).toBe(true);
    expect(isInternalRequest('/%E0%A4%A', undefined)).toBe(true); // malformed → protected
    for (const p of ['/', '/products/x', '/submit', '/api/submissions'])
      expect(isInternalRequest(p, p), p).toBe(false);
  });

  it('fails closed when credentials are not configured', () => {
    expect(checkInternalAccess(req({ authorization: basic('a', 'b') }), url, {})?.status).toBe(503);
    expect(checkInternalAccess(req(), url, { REVIEW_USER: 'x', REVIEW_PASSWORD: '' })?.status).toBe(
      503,
    );
  });

  it('requires correct Basic credentials', () => {
    const none = checkInternalAccess(req(), url, env)!;
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toContain('Basic');
    expect(none.headers.get('cache-control')).toBe('no-store');
    expect(
      checkInternalAccess(req({ authorization: basic('reviewer', 'wrong') }), url, env)?.status,
    ).toBe(401);
    expect(
      checkInternalAccess(req({ authorization: basic('other', env.REVIEW_PASSWORD) }), url, env)
        ?.status,
    ).toBe(401);
    expect(checkInternalAccess(req({ authorization: 'Bearer xyz' }), url, env)?.status).toBe(401);
    expect(
      checkInternalAccess(req({ authorization: 'Basic !!!notbase64' }), url, env)?.status,
    ).toBe(401);
    // Passwords may contain ':'.
    expect(
      checkInternalAccess(req({ authorization: basic('reviewer', env.REVIEW_PASSWORD) }), url, env),
    ).toBeNull();
  });

  it('blocks cross-origin state changes even when authenticated', () => {
    const auth = { authorization: basic('reviewer', env.REVIEW_PASSWORD) };
    expect(
      checkInternalAccess(req({ ...auth, origin: 'https://evil.example' }, 'POST'), url, env)
        ?.status,
    ).toBe(403);
    expect(checkInternalAccess(req(auth, 'POST'), url, env)?.status).toBe(403); // no Origin header
    expect(
      checkInternalAccess(req({ ...auth, origin: 'https://labels.fyi' }, 'POST'), url, env),
    ).toBeNull();
  });
});
