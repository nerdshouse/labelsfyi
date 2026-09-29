/**
 * LOCAL DEVELOPMENT ONLY. Pulls documents written by the local review
 * pipeline (running `pnpm dev`) into .data/local-dataset.ndjson, which the
 * demo content client layers over the fixtures. Then `pnpm build` renders
 * locally published submissions as static pages, like a real deploy would.
 *
 *   pnpm local:pull [http://localhost:4321]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4321';
const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => [m[1], m[2]]),
);
const auth = Buffer.from(`${vars.REVIEW_USER}:${vars.REVIEW_PASSWORD}`).toString('base64');
const res = await fetch(new URL('/internal/review/export.ndjson', base), {
  headers: { Authorization: `Basic ${auth}` },
});
if (!res.ok) {
  console.error(`Export failed: HTTP ${res.status}. Is \`pnpm dev\` running with .dev.vars?`);
  process.exit(1);
}
const body = await res.text();
mkdirSync('.data', { recursive: true });
writeFileSync('.data/local-dataset.ndjson', body);
console.log(
  `Wrote ${body.split('\n').filter(Boolean).length} documents to .data/local-dataset.ndjson`,
);
