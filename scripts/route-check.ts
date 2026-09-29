/**
 * HTTP route checks against a running build (wrangler dev on dist, or the
 * live site after a deploy):
 *
 *   node scripts/route-check.ts http://localhost:4323 [--production]
 *
 * --production additionally expects the production runtime behaviour:
 * /internal answers 503 until Cloudflare Access is configured (or 403 without
 * a valid Access JWT once it is), never 200 without credentials.
 */
const [base = 'http://localhost:4323', flag] = process.argv.slice(2);
const production = flag === '--production';
const failures: string[] = [];

async function expect(path: string, ok: (r: Response, body: string) => boolean, label: string) {
  let r: Response;
  let body: string;
  try {
    // String concat, not new URL(): "//internal" must stay a path on this host.
    r = await fetch(base.replace(/\/$/, '') + path, { redirect: 'manual' });
    body = await r.text();
  } catch (e) {
    failures.push(`${label}: ${(e as Error).message}`);
    console.log(`FAIL  ${label} (unreachable)`);
    return;
  }
  const pass = ok(r, body);
  if (!pass) failures.push(label);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label} [${r.status}]`);
}

const is =
  (...codes: number[]) =>
  (r: Response) =>
    codes.includes(r.status);
const privateHeaders = (r: Response) =>
  r.headers.get('cache-control') === 'no-store' &&
  /noindex/.test(r.headers.get('x-robots-tag') ?? '');

await expect('/', is(200), 'home 200');
for (const p of ['/privacy', '/terms', '/contact', '/methodology', '/submit', '/search'])
  await expect(p, is(200), `${p} 200`);
await expect(
  '/robots.txt',
  (r, b) => r.status === 200 && b.includes('Disallow: /internal/'),
  'robots.txt',
);
await expect('/sitemap.xml', (r, b) => r.status === 200 && b.includes('<urlset'), 'sitemap.xml');
await expect('/analyse', is(200), '/analyse (on-demand) renders');
await expect(
  '/analyse?url=http%3A%2F%2F169.254.169.254%2Flatest',
  is(200, 400),
  '/analyse with a metadata-IP URL does not crash',
);
await expect('/compare/a-vs-b', is(404), '/compare unknown pair → 404');
await expect('/products/does-not-exist', is(404), 'unknown product → 404');
for (const p of ['/internal/review', '/%69nternal/review', '/INTERNAL/review', '//internal/review'])
  await expect(
    p,
    // 404 = no route matched (nothing served); otherwise a private refusal.
    (r) =>
      r.status === 404 ||
      ((production ? [503, 403, 401] : [503, 401]).includes(r.status) && privateHeaders(r)),
    `${p} refused without credentials`,
  );
await expect('/api/submissions', (r) => r.status !== 200, 'GET /api/submissions is not a 200');
await expect('/', (r) => r.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options DENY');
await expect('/', (r) => r.headers.get('x-content-type-options') === 'nosniff', 'nosniff');

if (failures.length) {
  console.error(`\n${failures.length} route check(s) failed.`);
  process.exit(1);
}
console.log('\nAll route checks passed.');

export {};
