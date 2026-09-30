import { describe, expect, it } from 'vitest';
import type { SourcePolicy } from '@/lib/sources/policy';
import { SOURCES, decide } from '@/lib/sources/policy';
import { analyseUrl, candidateDocuments } from './analyse';
import { extractProductPage, toFacts } from './extract';
import { safeFetch, type FetchLike } from './fetch';
import { robotsAllows } from './robots';
import { checkUrl, isIpLiteral } from './safe-url';

// ─── Fake web ────────────────────────────────────────────────────────────

const OK_POLICY: SourcePolicy = {
  id: 'okbrand',
  name: 'OK Brand',
  domain: 'www.okbrand.in',
  hosts: ['www.okbrand.in', 'okbrand.in'],
  accessMode: 'BRAND_PERMISSION',
  sourceKind: 'BRAND_WEBSITE',
  productPath: '^/products/[a-z0-9-]+/?$',
  termsExcerpt: 'Test.',
  permissionVerified: true,
  permissionRecord: 'assetPermission.okbrand',
};
const BLOCKED_POLICY: SourcePolicy = {
  ...OK_POLICY,
  id: 'blocked',
  name: 'Blocked',
  domain: 'blocked.in',
  hosts: ['blocked.in'],
  accessMode: 'NOT_PERMITTED',
};
const SOURCES_T = [OK_POLICY, BLOCKED_POLICY];

type Route = {
  status?: number;
  type?: string;
  body?: string;
  headers?: Record<string, string>;
  stream?: () => ReadableStream<Uint8Array>;
  delayMs?: number;
};
function web(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push(input);
    const r = routes[input];
    if (!r) return new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } });
    if (r.delayMs)
      await new Promise((res, rej) => {
        const t = setTimeout(res, r.delayMs);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          rej(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    return new Response(r.stream ? r.stream() : (r.body ?? ''), {
      status: r.status ?? 200,
      headers: { 'content-type': r.type ?? 'text/html; charset=utf-8', ...r.headers },
    });
  };
  return { fetchImpl, calls };
}

const PRODUCT_URL = 'https://www.okbrand.in/products/magnesium-glycinate';
const ROBOTS_URL = 'https://www.okbrand.in/robots.txt';
const PAGE = `<!doctype html><html><head>
<title>Magnesium Glycinate – OK Brand</title>
<meta property="og:image" content="https://cdn.okbrand.in/pack.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Magnesium Glycinate 60 Capsules","brand":{"@type":"Brand","name":"OK Brand"},"sku":"MG-60","gtin13":"4006381333931","description":"Our revolutionary advanced sleep formula combines clinically researched ingredients","image":"https://cdn.okbrand.in/pack.jpg","aggregateRating":{"ratingValue":"4.9","reviewCount":"2847"},"offers":{"@type":"Offer","price":"499.00","priceCurrency":"INR"}}</script>
<script>window.evil = "<b>Serving size: 99 capsules</b>"</script>
</head><body>
<h1>Magnesium Glycinate</h1>
<p>Our revolutionary advanced sleep formula combines clinically researched ingredients for deep restful sleep!</p>
<p>Serving size: 2 capsules</p><p>Servings per container: 30</p>
<table><tr><th>Ingredient</th><th>Amount per serving</th></tr>
<tr><td>Magnesium glycinate</td><td>1000 mg</td></tr>
<tr><td>Elemental magnesium</td><td>220 mg</td></tr></table>
<p>Suitable for vegetarians.</p>
</body></html>`;
/** Tests stub DNS; dns-guard.test.ts covers the real check. */
const publicDns = async () => ({ ok: true as const });
const good = (extra: Record<string, Route> = {}) =>
  web({
    [ROBOTS_URL]: { type: 'text/plain', body: 'User-agent: *\nDisallow: /cart\n' },
    [PRODUCT_URL]: { body: PAGE },
    ...extra,
  });
const run = (url: string, w = good()) =>
  analyseUrl(url, {
    fetchImpl: w.fetchImpl,
    resolveHost: publicDns,
    sources: SOURCES_T,
    now: new Date('2026-09-29T10:00:00Z'),
  });

// ─── URL validation / SSRF ───────────────────────────────────────────────

describe('URL validation (SSRF)', () => {
  it('accepts a normal https product URL and upgrades http', () => {
    expect(checkUrl(PRODUCT_URL).ok).toBe(true);
    const r = checkUrl('http://www.okbrand.in/products/x');
    expect(r.ok && r.url.protocol).toBe('https:');
    expect(checkUrl('www.okbrand.in/products/x').ok).toBe(true);
  });
  it('rejects invalid input and unsupported protocols', () => {
    for (const u of [
      '',
      'not a url',
      'file:///etc/passwd',
      'ftp://okbrand.in/x',
      'javascript:alert(1)',
      'data:text/html,hi',
      'gopher://x.in',
      'x'.repeat(3000),
    ])
      expect(checkUrl(u).ok, u).toBe(false);
  });
  it('rejects private, loopback, metadata and IP-literal hosts in every notation', () => {
    for (const u of [
      'https://127.0.0.1/products/x',
      'https://localhost/products/x',
      'https://[::1]/products/x',
      'https://[::ffff:127.0.0.1]/x',
      'https://10.0.0.5/x',
      'https://192.168.1.1/x',
      'https://169.254.169.254/latest/meta-data',
      'https://2130706433/x',
      'https://0x7f000001/x',
      'https://0177.0.0.1/x',
      'https://metadata.google.internal/x',
      'https://intranet/x',
      'https://printer.local/x',
      'https://x.internal/x',
      'https://evil.localhost/x',
    ])
      expect(checkUrl(u).ok, u).toBe(false);
    expect(isIpLiteral('okbrand.in')).toBe(false);
    expect(isIpLiteral('1password.com')).toBe(false);
  });
  it('rejects credentials, custom ports and control characters', () => {
    for (const u of [
      'https://user:pass@www.okbrand.in/products/x',
      'https://www.okbrand.in:8080/products/x',
      'https://www.okbrand.in/pro\nducts',
    ])
      expect(checkUrl(u).ok, u).toBe(false);
  });
});

// ─── Source policy ───────────────────────────────────────────────────────

describe('source access policy', () => {
  it('unknown sources are refused without any request', async () => {
    const w = good();
    const r = await run('https://www.unknown-shop.in/products/x', w);
    expect(r.state).toBe('SOURCE_NOT_ALLOWED');
    expect(r.message).toBe("We can't automatically analyse this source.");
    expect(w.calls).toEqual([]);
  });
  it('sources whose terms prohibit collection are refused without any request', async () => {
    const w = good();
    const r = await run('https://blocked.in/products/x', w);
    expect(r).toMatchObject({ state: 'SOURCE_NOT_ALLOWED', policy: { id: 'blocked' } });
    expect(w.calls).toEqual([]);
  });
  it('non-product pages of a permitted source are refused', async () => {
    const w = good();
    expect((await run('https://www.okbrand.in/collections/all', w)).state).toBe(
      'SOURCE_NOT_ALLOWED',
    );
    expect(w.calls).toEqual([]);
  });
  it('the real register: prohibited brands refused; Briyo refused until written permission is verified', () => {
    for (const u of [
      'https://mycf.in/products/x',
      'https://wellbeingnutrition.com/products/x',
      'https://rasayanam.in/products/x',
    ])
      expect(decide(new URL(u)).allowed, u).toBe(false);
    expect(
      decide(new URL('https://www.briyosupplements.com/products/melatonin-3mg-chewable-tablets')),
    ).toMatchObject({ allowed: false, reason: 'PERMISSION_UNVERIFIED' });
    expect(decide(new URL('https://www.briyosupplements.com/cart')).allowed).toBe(false);
    expect(SOURCES.find((s) => s.id === 'briyo')!.accessMode).toBe('BRAND_PERMISSION');
    expect(SOURCES.find((s) => s.id === 'briyo')!.permissionVerified).toBe(false);
  });
  it('an automated access mode without verified written permission is refused', () => {
    const u = new URL(PRODUCT_URL);
    expect(decide(u, [{ ...OK_POLICY, permissionVerified: false }])).toMatchObject({
      allowed: false,
      reason: 'PERMISSION_UNVERIFIED',
    });
    expect(decide(u, [{ ...OK_POLICY, permissionRecord: null }]).allowed).toBe(false);
    expect(decide(u, [OK_POLICY]).allowed).toBe(true);
  });
  it('robots.txt disallow → refused before the page is fetched', async () => {
    const w = good({
      [ROBOTS_URL]: { type: 'text/plain', body: 'User-agent: *\nDisallow: /products/\n' },
    });
    expect((await run(PRODUCT_URL, w)).state).toBe('SOURCE_NOT_ALLOWED');
    expect(w.calls).toEqual([ROBOTS_URL]);
  });
  it('robots.txt specific group for our agent wins; 404 robots = allowed; 5xx robots = fail closed', async () => {
    expect(
      robotsAllows(
        'User-agent: *\nDisallow: /\n\nUser-agent: labels-fyi-analyser\nAllow: /products/\n',
        '/products/x',
      ),
    ).toBe(true);
    expect(
      robotsAllows(
        'User-agent: *\nAllow: /\nDisallow: /products/*?variant=\n',
        '/products/x?variant=1',
      ),
    ).toBe(false);
    expect(
      robotsAllows('User-agent: *\nDisallow: /products\nAllow: /products/ok$\n', '/products/ok'),
    ).toBe(true);
    const missing = web({
      [ROBOTS_URL]: { status: 404, type: 'text/plain' },
      [PRODUCT_URL]: { body: PAGE },
    });
    expect((await run(PRODUCT_URL, missing)).state).toBe('EXTRACTION_SUCCESS');
    const down = web({
      [ROBOTS_URL]: { status: 503, type: 'text/plain' },
      [PRODUCT_URL]: { body: PAGE },
    });
    expect((await run(PRODUCT_URL, down)).state).toBe('SOURCE_NOT_ALLOWED');
  });
});

// ─── Fetch guards ────────────────────────────────────────────────────────

describe('controlled fetch', () => {
  const fetchOnce = (routes: Record<string, Route>, limits = {}) =>
    safeFetch(new URL(PRODUCT_URL), OK_POLICY, {
      fetchImpl: web(routes).fetchImpl,
      resolveHost: publicDns,
      accept: ['text/html'],
      limits,
    });
  it('follows a redirect only within the permitted source and product paths', async () => {
    const ok = await fetchOnce({
      [PRODUCT_URL]: { status: 301, headers: { location: '/products/magnesium-glycinate-v2' } },
      'https://www.okbrand.in/products/magnesium-glycinate-v2': { body: 'hi' },
    });
    expect(ok.ok && ok.url.pathname).toBe('/products/magnesium-glycinate-v2');
  });
  it('blocks redirects to private, foreign or non-product destinations', async () => {
    for (const location of [
      'http://127.0.0.1/products/x',
      'https://169.254.169.254/latest',
      'https://evil.com/products/x',
      'https://www.okbrand.in/admin',
      'file:///etc/passwd',
      'https://localhost/products/x',
    ])
      expect(
        (await fetchOnce({ [PRODUCT_URL]: { status: 302, headers: { location } } })).ok,
        location,
      ).toBe(false);
  });
  it('limits redirect chains', async () => {
    const hop = (n: number) => `https://www.okbrand.in/products/h${n}`;
    const routes: Record<string, Route> = {
      [PRODUCT_URL]: { status: 302, headers: { location: hop(1) } },
    };
    for (let i = 1; i < 10; i++)
      routes[hop(i)] = { status: 302, headers: { location: hop(i + 1) } };
    expect(await fetchOnce(routes)).toMatchObject({ ok: false, code: 'REDIRECT' });
  });
  it('rejects oversized responses by header and while streaming (decompression bombs)', async () => {
    expect(
      await fetchOnce({ [PRODUCT_URL]: { body: 'x', headers: { 'content-length': '999999999' } } }),
    ).toMatchObject({ ok: false, code: 'TOO_LARGE' });
    const endless = () =>
      new ReadableStream<Uint8Array>({
        pull(c) {
          c.enqueue(new Uint8Array(64 * 1024));
        },
      });
    expect(
      await fetchOnce({ [PRODUCT_URL]: { stream: endless } }, { maxBytes: 256 * 1024 }),
    ).toMatchObject({ ok: false, code: 'TOO_LARGE' });
  });
  it('times out', async () => {
    expect(
      await fetchOnce({ [PRODUCT_URL]: { body: 'late', delayMs: 500 } }, { timeoutMs: 50 }),
    ).toMatchObject({ ok: false, code: 'TIMEOUT' });
  });
  it('allows only HTML content types', async () => {
    for (const type of [
      'application/octet-stream',
      'image/jpeg',
      'application/pdf',
      'text/javascript',
    ])
      expect(await fetchOnce({ [PRODUCT_URL]: { type, body: 'x' } })).toMatchObject({
        ok: false,
        code: 'TYPE',
      });
  });
  it('sends no credentials and identifies itself', async () => {
    let init: RequestInit | undefined;
    await safeFetch(new URL(PRODUCT_URL), OK_POLICY, {
      accept: ['text/html'],
      resolveHost: publicDns,
      fetchImpl: async (_u, i) => (
        (init = i),
        new Response('x', { headers: { 'content-type': 'text/html' } })
      ),
    });
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'manual' });
    expect((init!.headers as Record<string, string>)['User-Agent']).toMatch(/labels-fyi-analyser/);
  });
});

// ─── Extraction ──────────────────────────────────────────────────────────

describe('extraction', () => {
  it('structured data + visible facts; elemental only because the page states it', async () => {
    const r = await run(PRODUCT_URL);
    expect(r.state).toBe('EXTRACTION_SUCCESS');
    expect(r.extraction).toMatchObject({
      name: 'Magnesium Glycinate 60 Capsules',
      brand: 'OK Brand',
      gtin: '4006381333931',
      price: { amount: 499, currency: 'INR' },
      serving: '2 capsules',
      servingsPerContainer: '30',
      vegStatement: 'Suitable for vegetarians',
      imagesSeen: true,
    });
    expect(r.extraction!.ingredients).toEqual([
      {
        label: 'Magnesium glycinate',
        value: '1000 mg',
        elementalStated: false,
        basis: 'serving', // from the table's own "Amount per serving" header
        where: 'Facts table on page',
      },
      {
        label: 'Elemental magnesium',
        value: '220 mg',
        elementalStated: true,
        basis: 'serving', // from the table's own "Amount per serving" header
        where: 'Facts table on page',
      },
    ]);
    expect(r.provenance).toMatchObject({
      sourceKind: 'BRAND_WEBSITE',
      verificationStatus: 'UNVERIFIED',
      observedAt: '2026-09-29T10:00:00.000Z',
    });
  });
  it('never keeps marketing prose, ratings, reviews, image URLs or script content', async () => {
    const r = await run(PRODUCT_URL);
    const json = JSON.stringify(r);
    // The description itself is never kept…
    expect(json).not.toMatch(/revolutionary|advanced sleep formula|Our .* combines/i);
    expect(json).not.toMatch(/4\.9|2847|ratingValue|reviewCount/);
    expect(json).not.toMatch(/cdn\.okbrand\.in|pack\.jpg/);
    expect(json).not.toContain('99 capsules'); // from a <script>, never read
    // …only the brand's claim, as a short phrase in the claims audit (≤ 12 words)…
    const { report, ...rest } = r;
    expect(JSON.stringify(rest)).not.toMatch(/clinically researched|restful/i);
    expect(report!.claims.map((c) => c.text)).toEqual([
      'clinically researched ingredients for deep restful sleep',
    ]);
    // …and never in what "Submit for verification" would store.
    const docs = candidateDocuments(r, OK_POLICY, [], 'x');
    expect(JSON.stringify(docs)).not.toMatch(/clinically researched|restful|revolutionary/i);
  });
  it('never computes an elemental amount', () => {
    const x = extractProductPage(
      '<script type="application/ld+json">{"@type":"Product","name":"Magnesium Glycinate 1000 mg"}</script><table><tr><td>Magnesium glycinate</td><td>1000 mg</td></tr></table>',
    );
    expect(x.ingredients.every((i) => !i.elementalStated)).toBe(true);
    expect(x.ingredients.map((i) => `${i.label} ${i.value}`).join(' ')).not.toMatch(/elemental/i);
  });
  it('missing fields are reported, not guessed; partial state', async () => {
    const w = good({
      [PRODUCT_URL]: {
        body: '<script type="application/ld+json">{"@type":"Product","name":"Melatonin Gummies"}</script>',
      },
    });
    const r = await run(PRODUCT_URL, w);
    expect(r.state).toBe('EXTRACTION_PARTIAL');
    expect(r.extraction).toMatchObject({ serving: null, price: null, gtin: null, ingredients: [] });
    expect(r.missing).toEqual(
      expect.arrayContaining([
        'Serving size',
        'Ingredient amounts',
        'Price',
        'Barcode (GTIN)',
        'Label evidence (a photo of the actual label)',
      ]),
    );
  });
  it('malformed or hostile JSON-LD is ignored safely; HTML in values is stripped', () => {
    const x = extractProductPage(
      '<script type="application/ld+json">{not json</script>' +
        '<script type="application/ld+json">{"@graph":[{"@type":["Product"],"name":"<img src=x onerror=alert(1)>Zinc 50 mg","brand":"<b>Z</b>","offers":{"price":"-5","priceCurrency":"INR"},"gtin13":"123"}]}</script>',
    );
    expect(x.name).toBe('Zinc 50 mg');
    expect(x.brand).toBe('Z');
    expect(x.price).toBeNull(); // negative price rejected
    expect(x.gtin).toBeNull(); // invalid barcode rejected
  });
  it('veg: only explicit statements count; a bare "vegan" (nav/tag) does not', () => {
    expect(extractProductPage('<nav><a>Vegan</a></nav><h1>Melatonin</h1>').vegStatement).toBeNull();
    expect(extractProductPage('<p>Suitable for vegans.</p>').vegStatement).toBe(
      'Suitable for vegans',
    );
  });
  it('a missing elemental amount is flagged only for minerals', async () => {
    const mel = good({
      [PRODUCT_URL]: {
        body: '<script type="application/ld+json">{"@type":"Product","name":"Melatonin 3 mg Chewables"}</script>',
      },
    });
    expect((await run(PRODUCT_URL, mel)).missing).not.toContain(
      'Elemental amount (only counted when stated)',
    );
    const zinc = good({
      [PRODUCT_URL]: {
        body: '<script type="application/ld+json">{"@type":"Product","name":"Zinc Gluconate 50 mg"}</script>',
      },
    });
    expect((await run(PRODUCT_URL, zinc)).missing).toContain(
      'Elemental amount (only counted when stated)',
    );
  });
  it('a page with no product facts → nothing found', async () => {
    const w = good({ [PRODUCT_URL]: { body: '<html><body>Hello</body></html>' } });
    expect((await run(PRODUCT_URL, w)).state).toBe('NOTHING_FOUND');
  });
});

// ─── Candidate ───────────────────────────────────────────────────────────

describe('candidate creation', () => {
  it('creates an UNVERIFIED candidate with provenance, never a product', async () => {
    const r = await run(PRODUCT_URL);
    const docs = candidateDocuments(r, OK_POLICY, [], 'abc123');
    expect(docs.candidate).toMatchObject({
      _type: 'ingestionCandidate',
      status: 'needs_verification',
      extractor: 'url-analyser@1',
      sourceUrl: PRODUCT_URL,
      gtin: '4006381333931',
    });
    expect(docs.candidate.facts.length).toBeGreaterThan(5);
    expect(docs.candidate.facts.every((f) => f.verificationStatus === 'unverified')).toBe(true);
    expect(docs.snapshot).toMatchObject({ _type: 'sourceSnapshot', images: [], url: PRODUCT_URL });
    expect(JSON.stringify(docs)).not.toMatch(/"_type":"product"|revolutionary|pack\.jpg/);
    expect(Object.values(docs).map((d) => (d as { _type: string })._type)).toEqual([
      'dataSource',
      'sourceSnapshot',
      'ingestionCandidate',
    ]);
  });
  it('suggests catalogue matches with the strict matcher but never confirms them', async () => {
    const r = await run(PRODUCT_URL);
    const docs = candidateDocuments(
      r,
      OK_POLICY,
      [{ id: 'product.x', brand: 'OK Brand', name: 'Magnesium Glycinate', gtin: '4006381333931' }],
      's',
    );
    expect(docs.candidate.possibleMatches[0]).toMatchObject({
      level: 'EXACT',
      product: { _ref: 'product.x' },
    });
    expect(docs.candidate.matchStatus).toBe('possible_match');
  });
  it('refuses to build a candidate from a failed or blocked analysis', async () => {
    const r = await run('https://blocked.in/products/x');
    expect(() => candidateDocuments(r, BLOCKED_POLICY, [], 's')).toThrow();
  });
  it('facts carry the extraction method', async () => {
    const r = await run(PRODUCT_URL);
    const facts = toFacts(r.extraction!);
    expect(facts.find((f) => f.field === 'price')).toMatchObject({
      value: '₹499',
      method: 'structured_data',
    });
    expect(facts.find((f) => f.field === 'serving_size')).toMatchObject({
      value: '2 capsules',
      method: 'parser',
    });
  });
});
