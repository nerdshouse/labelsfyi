import { describe, expect, it } from 'vitest';
import { dohResolver, isPublicIp, v6Bytes } from './dns-guard';
import { safeFetch } from './fetch';
import type { SourcePolicy } from '@/lib/sources/policy';

describe('public address classification', () => {
  it('accepts public unicast addresses', () => {
    for (const ip of [
      '1.1.1.1',
      '8.8.8.8',
      '104.16.0.1',
      '2606:4700::1111',
      '2a00:1450:4001::200e',
    ])
      expect(isPublicIp(ip), ip).toBe(true);
  });

  it('rejects every private, reserved and special IPv4 range', () => {
    for (const ip of [
      '0.0.0.0',
      '10.0.0.1',
      '100.64.0.1',
      '100.127.255.255',
      '127.0.0.1',
      '127.1.2.3',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.0.0.8',
      '192.0.2.1',
      '192.88.99.1',
      '192.168.1.1',
      '198.18.0.1',
      '198.19.255.255',
      '198.51.100.7',
      '203.0.113.9',
      '224.0.0.1',
      '240.0.0.1',
      '255.255.255.255',
    ])
      expect(isPublicIp(ip), ip).toBe(false);
  });

  it('rejects private IPv6, including v4-mapped, NAT64, 6to4 and Teredo forms', () => {
    for (const ip of [
      '::',
      '::1',
      '[::1]',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:169.254.169.254',
      '::ffff:a9fe:a9fe',
      '::127.0.0.1',
      '64:ff9b::7f00:1',
      '64:ff9b::1.2.3.4',
      '64:ff9b:1::1',
      '100::1',
      '2001::1',
      '2001:0:4136:e378::1',
      '2001:db8::1',
      '2002:7f00:1::1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'fe80::1%eth0',
      'fec0::1',
      'ff02::1',
      '3fff::1',
    ])
      expect(isPublicIp(ip), ip).toBe(false);
  });

  it('treats a v4-mapped public address as public, and garbage as not public', () => {
    expect(isPublicIp('::ffff:1.1.1.1')).toBe(true);
    for (const ip of [
      '',
      'localhost',
      '1.2.3',
      '01.2.3.4',
      '256.1.1.1',
      '1::2::3',
      'g::1',
      '1:2:3:4:5:6:7:8:9',
    ])
      expect(isPublicIp(ip), ip).toBe(false);
  });

  it('parses compressed IPv6', () => {
    expect(v6Bytes('::1')).toEqual([...Array(15).fill(0), 1]);
    expect(v6Bytes('1:2:3:4:5:6:7:8')).toHaveLength(16);
    expect(v6Bytes('1:2:3:4:5:6:7::8')).toBeNull();
  });
});

type Doh = Record<string, { Status: number; Answer?: Array<{ type: number; data: string }> }>;
const doh = (answers: Doh) =>
  dohResolver((async (input: string) => {
    const u = new URL(input);
    expect(u.origin).toBe('https://cloudflare-dns.com');
    const a = answers[`${u.searchParams.get('name')}/${u.searchParams.get('type')}`];
    if (!a) throw new Error('network');
    return new Response(JSON.stringify(a));
  }) as typeof fetch);

describe('DNS-over-HTTPS resolver (fails closed)', () => {
  const pub = { Status: 0, Answer: [{ type: 1, data: '104.16.0.1' }] };
  const none = { Status: 0 };
  it('allows a host whose every address is public (following CNAMEs)', async () => {
    const r = doh({
      'shop.test.brand/A': {
        Status: 0,
        Answer: [
          { type: 5, data: 'x.cdn.' },
          { type: 1, data: '104.16.0.1' },
        ],
      },
      'shop.test.brand/AAAA': { Status: 0, Answer: [{ type: 28, data: '2606:4700::1' }] },
    });
    expect(await r('shop.test.brand')).toEqual({ ok: true });
  });
  it('refuses when ANY record is private (mixed answers)', async () => {
    const r = doh({
      'h/A': {
        Status: 0,
        Answer: [
          { type: 1, data: '104.16.0.1' },
          { type: 1, data: '10.0.0.5' },
        ],
      },
      'h/AAAA': none,
    });
    expect((await r('h')).ok).toBe(false);
    const r6 = doh({
      'h/A': pub,
      'h/AAAA': { Status: 0, Answer: [{ type: 28, data: '::ffff:127.0.0.1' }] },
    });
    expect((await r6('h')).ok).toBe(false);
  });
  it('refuses NXDOMAIN, SERVFAIL, empty answers and resolver failures', async () => {
    expect((await doh({ 'h/A': { Status: 3 }, 'h/AAAA': { Status: 3 } })('h')).ok).toBe(false);
    expect((await doh({ 'h/A': { Status: 2 }, 'h/AAAA': none })('h')).ok).toBe(false);
    expect((await doh({ 'h/A': none, 'h/AAAA': none })('h')).ok).toBe(false);
    expect((await doh({ 'h/A': pub })('h')).ok).toBe(false); // AAAA query throws
  });
});

describe('safeFetch applies the DNS check to every hop', () => {
  const policy = {
    id: 'ok',
    name: 'OK',
    domain: 'okbrand.in',
    hosts: ['www.okbrand.in'],
    productPath: '^/products/[a-z0-9-]+$',
  } as unknown as SourcePolicy;
  it('never fetches a host that resolves to a private address', async () => {
    let fetched = 0;
    const r = await safeFetch(new URL('https://www.okbrand.in/robots.txt'), policy, {
      accept: ['text/plain'],
      requireProductPath: false,
      resolveHost: async () => ({ ok: false, reason: 'resolves to a non-public address' }),
      fetchImpl: async () => {
        fetched++;
        return new Response('x');
      },
    });
    expect(r).toMatchObject({ ok: false, code: 'BLOCKED' });
    expect(fetched).toBe(0);
  });
  it('re-checks DNS after a redirect (rebinding between hops)', async () => {
    const seen: string[] = [];
    let n = 0;
    const r = await safeFetch(new URL('https://www.okbrand.in/robots.txt'), policy, {
      accept: ['text/plain'],
      requireProductPath: false,
      resolveHost: async (h) => (
        seen.push(h),
        ++n === 1 ? { ok: true } : { ok: false, reason: 'x' }
      ),
      fetchImpl: async () =>
        new Response(null, { status: 302, headers: { location: '/robots2.txt' } }),
    });
    expect(r).toMatchObject({ ok: false, code: 'BLOCKED' });
    expect(seen).toEqual(['www.okbrand.in', 'www.okbrand.in']);
  });
});
