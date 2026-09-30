/**
 * Research import from a PERMITTED Shopify product feed (docs/catalogue.md).
 *
 *   pnpm research:feed <source-id> [--from-file path/to/products.json]
 *
 * Refuses unless research/sources.json records a permitted access mode for the
 * source. Makes at most one request (/products.json), downloads no images,
 * and writes UNVERIFIED research documents to research/catalogue/. Nothing
 * here is published: an editor imports and verifies it in Studio.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildFeedImportDocuments, type RegisteredSource } from '@/lib/ingestion/feed-import';
import { extractShopifyFeed, assertCollectionPermitted } from '@/lib/ingestion/shopify-feed';

const [id, flag, file] = process.argv.slice(2);
const registry = JSON.parse(readFileSync('research/sources.json', 'utf8')) as {
  sources: RegisteredSource[];
};
const source = registry.sources.find((s) => s.id === id);
if (!source) throw new Error(`Unknown source "${id}". See research/sources.json.`);
assertCollectionPermitted(source);

const fetchedAt = new Date().toISOString();
const raw =
  flag === '--from-file' && file
    ? readFileSync(file, 'utf8')
    : await fetch(`https://${source.domain}/products.json?limit=250`, {
        headers: {
          'User-Agent': 'labels.fyi-research/0.1 (+https://labels.fyi; hello@labels.fyi)',
        },
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      });
const out = extractShopifyFeed(JSON.parse(raw), source, fetchedAt);
const hash = createHash('sha256').update(raw).digest('hex');
const date = fetchedAt.slice(0, 10);
// Deterministic IDs + `sanity dataset import --missing` = idempotent import
// (src/lib/ingestion/feed-import.ts). Check before importing:
//   pnpm research:check-import research/catalogue/<source>-<date>.ndjson
const docs = buildFeedImportDocuments(out, source, { contentHash: `sha256:${hash}` });
mkdirSync('research/catalogue', { recursive: true });
const path = `research/catalogue/${source.id}-${date}.ndjson`;
writeFileSync(path, docs.map((d) => JSON.stringify(d)).join('\n') + '\n');
console.log(`${out.products.length} candidates, ${out.skipped.length} skipped → ${path}`);
for (const s of out.skipped) console.log(`  skipped ${s.handle}: ${s.reason}`);
for (const d of out.duplicateSuspects)
  console.log(`  possible duplicate (not merged): ${d.handles.join(' | ')}`);
