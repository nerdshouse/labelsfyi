/**
 * Pre-import check for a feed catalogue (docs/production.md §7). Read-only:
 * never talks to Sanity.
 *
 *   pnpm research:check-import research/catalogue/fitlix-2026-09-30.ndjson
 *
 * Exits non-zero unless the file can only add private, UNVERIFIED, UNMATCHED
 * dataSource / sourceSnapshot / ingestionCandidate documents with valid,
 * deterministic IDs (see src/lib/ingestion/feed-import.ts).
 */
import { readFileSync } from 'node:fs';
import { checkImportDocuments, type ImportDoc } from '@/lib/ingestion/feed-import';

const [file] = process.argv.slice(2);
if (!file) throw new Error('Usage: pnpm research:check-import <file.ndjson>');
const docs = readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as ImportDoc);
const { ok, problems, summary } = checkImportDocuments(docs);
console.log(JSON.stringify(summary, null, 2));
if (!ok) {
  console.error(`\n${problems.length} problem(s):\n  - ${problems.slice(0, 50).join('\n  - ')}`);
  process.exit(1);
}
console.log(`\nOK: ${docs.length} documents are safe to import with --missing.`);
