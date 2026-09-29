import { describe, expect, it, vi } from 'vitest';
import { dohResolver } from './dns-guard';

/**
 * Regression: the Workers runtime (workerd) THROWS on fetch(…, { redirect:
 * 'error' }), which made every production DNS check fail. The resolver must
 * use redirect:'manual', never follow a redirect, and stay fail-closed.
 */
function workersFetch(respond: (url: URL) => Response) {
  const calls: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), redirect: init?.redirect });
    if (init?.redirect === 'error')
      throw new TypeError('Invalid redirect value, must be one of "follow" or "manual".');
    return respond(url);
  });
  return { impl: impl as unknown as typeof fetch, calls };
}
const answer = (type: string) =>
  new Response(
    JSON.stringify({
      Status: 0,
      Answer:
        type === 'A' ? [{ type: 1, data: '104.16.0.1' }] : [{ type: 28, data: '2606:4700::1111' }],
    }),
    { headers: { 'content-type': 'application/dns-json' } },
  );

describe('DNS-over-HTTPS resolver on the Workers runtime', () => {
  it('uses redirect:"manual" and resolves a public host on a Workers-like fetch', async () => {
    const f = workersFetch((u) => answer(u.searchParams.get('type')!));
    expect(await dohResolver(f.impl)('shop.brand.example')).toEqual({ ok: true });
    expect(f.calls).toHaveLength(2);
    expect(f.calls.every((c) => c.redirect === 'manual')).toBe(true);
    expect(f.calls.every((c) => c.url.startsWith('https://cloudflare-dns.com/dns-query?'))).toBe(
      true,
    );
  });

  it.each([301, 302, 307, 308])('rejects a %i redirect and never follows it', async (status) => {
    const f = workersFetch(
      () => new Response(null, { status, headers: { location: 'https://evil.example/dns' } }),
    );
    expect(await dohResolver(f.impl)('shop.brand.example')).toEqual({
      ok: false,
      reason: 'DNS lookup failed',
    });
    expect(f.calls.some((c) => c.url.includes('evil.example'))).toBe(false);
  });

  it.each([400, 404, 500, 503])('rejects HTTP %i', async (status) => {
    const f = workersFetch(() => new Response('{}', { status }));
    expect((await dohResolver(f.impl)('shop.brand.example')).ok).toBe(false);
  });

  it('rejects a network / runtime error', async () => {
    const f = workersFetch(() => {
      throw new TypeError('Network connection lost.');
    });
    expect((await dohResolver(f.impl)('shop.brand.example')).ok).toBe(false);
  });

  it('still refuses private addresses after a successful response', async () => {
    const f = workersFetch(
      () =>
        new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '127.0.0.1' }] }), {
          status: 200,
        }),
    );
    expect(await dohResolver(f.impl)('rebind.example')).toMatchObject({ ok: false });
  });
});
