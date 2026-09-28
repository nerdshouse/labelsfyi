/**
 * Writes the demo dataset as NDJSON for `sanity dataset import`.
 *
 *   pnpm demo:export
 *   pnpm --filter @labels-fyi/studio exec sanity dataset import ../demo-dataset.ndjson development
 *
 * Import into a *development* dataset. Every document is flagged isDemo.
 */
import { writeFileSync } from 'node:fs';
import { demoDataset } from '../src/fixtures/index.ts';

const out = new URL('../demo-dataset.ndjson', import.meta.url);
const lines = demoDataset.map((doc) => {
  // _createdAt/_updatedAt are system fields; Sanity sets them on import.
  const { _createdAt: _c, _updatedAt: _u, ...rest } = doc;
  return JSON.stringify(rest);
});
writeFileSync(out, lines.join('\n') + '\n');
console.log(`Wrote ${lines.length} documents to ${out.pathname}`);
