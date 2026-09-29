/**
 * HTTP route checks against a running build (wrangler dev on dist, or the
 * live site after a deploy):
 *
 *   node scripts/route-check.ts http://localhost:4323 [--production]
 *
 * --production additionally expects the production runtime behaviour. For
 * /internal/* without credentials the verdict comes from
 * src/lib/server/route-check-rules.ts: live, Cloudflare Access answers 302 to
 * its login page on our team domain (read from dist/server/wrangler.json);
 * the Worker itself answers 503 until Access is configured and 403 without a
 * valid Access JWT. Never 200, never internal content.
 */
import { existsSync, readFileSync } from 'node:fs';
import { internalRouteVerdict } from '../src/lib/server/route-check-rules.ts';

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

/** The Access team domain of the build being checked (dist/server/wrangler.json). */
function accessTeamDomain(): string | null {
  const cfg = 'dist/server/wrangler.json';
  if (!existsSync(cfg)) return process.env.ACCESS_TEAM_DOMAIN ?? null;
  const vars = (JSON.parse(readFileSync(cfg, 'utf8')) as { vars?: Record<string, string> }).vars;
  return vars?.ACCESS_TEAM_DOMAIN || process.env.ACCESS_TEAM_DOMAIN || null;
}

async function expectInternal(path: string, mustExist = false) {
  const label = `${path} refused without credentials`;
  let r: Response;
  let body: string;
  try {
    r = await fetch(base.replace(/\/$/, '') + path, { redirect: 'manual' });
    body = await r.text();
  } catch (e) {
    failures.push(`${label}: ${(e as Error).message}`);
    console.log(`FAIL  ${label} (unreachable)`);
    return;
  }
  const verdict = internalRouteVerdict(
    {
      status: r.status,
      location: r.headers.get('location'),
      contentType: r.headers.get('content-type'),
      cacheControl: r.headers.get('cache-control'),
      robotsTag: r.headers.get('x-robots-tag'),
      body,
    },
    {
      production,
      accessTeamDomain: accessTeamDomain(),
      mustExist,
      requestPath: path,
      origin: new URL(base).origin,
    },
  );
  if (!verdict.pass) failures.push(label);
  console.log(`${verdict.pass ? 'PASS' : 'FAIL'}  ${label} [${r.status}: ${verdict.reason}]`);
}

const is =
  (...codes: number[]) =>
  (r: Response) =>
    codes.includes(r.status);

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
// /internal/* without credentials: judged by src/lib/server/route-check-rules.ts
// (302 to OUR Cloudflare Access login, or a private Worker refusal).
// /internal is the canonical reviewer entry point: it and the real internal
// routes MUST exist, so a public 404 (middleware never ran) is a failure.
for (const p of [
  '/internal',
  '/internal/review',
  '/internal/goals',
  '/internal/candidates',
  '/internal/review/export.ndjson',
  '/internal/review/image/x',
])
  await expectInternal(p, true);
// Variants: may be refused, redirected to Access, canonicalised, or match no
// route (404) — but never served.
for (const p of [
  '/internal/',
  '/%69nternal/review',
  '/INTERNAL',
  '/INTERNAL/review',
  '//internal/review',
])
  await expectInternal(p);
await expect('/api/submissions', (r) => r.status !== 200, 'GET /api/submissions is not a 200');
await expect('/', (r) => r.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options DENY');
await expect('/', (r) => r.headers.get('x-content-type-options') === 'nosniff', 'nosniff');

if (failures.length) {
  console.error(`\n${failures.length} route check(s) failed.`);
  process.exit(1);
}
console.log('\nAll route checks passed.');
