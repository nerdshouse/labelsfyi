import { createClient, type SanityClient } from '@sanity/client';
import {
  CONTENT_SOURCE,
  DEPLOY_ENV,
  PRODUCTION_REHEARSAL,
  SANITY_API_HOST,
  SANITY_API_VERSION,
  SANITY_DATASET,
  SANITY_PROJECT_ID,
  SANITY_READ_TOKEN,
} from 'astro:env/server';
import { PUBLIC_SITE_URL } from 'astro:env/client';
import { assertProductionConfig } from './production';

/**
 * The single place that knows where content comes from.
 *
 * - `sanity`: GROQ against the Sanity Content Lake (published perspective).
 * - `demo`:   the *same* GROQ evaluated locally by groq-js against the
 *             fictional demo dataset in src/fixtures. No credentials needed.
 *
 * Because both paths run identical queries, the demo dataset exercises the
 * real query layer rather than a mock of it.
 */

export type ContentSource = 'sanity' | 'demo';

/** Production strips demo content everywhere (repository.ts → forProduction). */
export const isProductionDeploy = DEPLOY_ENV === 'production';
export const isProductionRehearsal = isProductionDeploy && PRODUCTION_REHEARSAL === 'true';

/** Build-time only (called by getContentGraph): refuses an incomplete production config. */
export function assertProductionBuild(): void {
  assertProductionConfig({
    DEPLOY_ENV,
    CONTENT_SOURCE,
    SANITY_PROJECT_ID,
    SANITY_DATASET,
    SANITY_READ_TOKEN,
    SANITY_API_HOST,
    PRODUCTION_REHEARSAL,
    PUBLIC_SITE_URL,
  });
}

export const contentSource: ContentSource = (() => {
  if (CONTENT_SOURCE === 'sanity') {
    // Production: getContentGraph → assertProductionBuild reports every missing
    // setting at BUILD time. Never assert here: this module also loads in the
    // Worker at runtime, which deliberately has no read token.
    if (!SANITY_PROJECT_ID && !isProductionDeploy) {
      throw new Error('CONTENT_SOURCE=sanity but SANITY_PROJECT_ID is not set. See .env.example.');
    }
    return 'sanity';
  }
  if (CONTENT_SOURCE === 'demo') return 'demo';
  return SANITY_PROJECT_ID ? 'sanity' : 'demo';
})();

/**
 * Proves the production dataset is private: an ANONYMOUS query must see no
 * documents. A public dataset would expose submissions, candidates and
 * internal records, so the production build refuses to continue.
 */
export async function assertDatasetPrivate(fetchImpl: typeof fetch = fetch): Promise<void> {
  const version = `v${(SANITY_API_VERSION ?? '2025-02-19').replace(/^v/, '')}`;
  const base = SANITY_API_HOST
    ? `${SANITY_API_HOST.replace(/\/$/, '')}/${version}`
    : `https://${SANITY_PROJECT_ID}.api.sanity.io/${version}`;
  const url = `${base}/data/query/${SANITY_DATASET}?query=${encodeURIComponent('count(*)')}`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) return;
  if (!res.ok) throw new Error(`Could not verify dataset privacy (HTTP ${res.status}).`);
  const body = (await res.json()) as { result?: number };
  if (typeof body.result === 'number' && body.result > 0)
    throw new Error(
      `Production build refused: dataset "${SANITY_DATASET}" is PUBLIC (an anonymous query sees ${body.result} documents). Make it private in Sanity manage → Datasets.`,
    );
}

let sanityClient: SanityClient | undefined;
function getSanityClient(): SanityClient {
  sanityClient ??= createClient({
    projectId: SANITY_PROJECT_ID!,
    dataset: SANITY_DATASET ?? 'production',
    apiVersion: SANITY_API_VERSION ?? '2025-02-19',
    // Builds are infrequent and must reflect the latest published content.
    useCdn: false,
    perspective: 'published',
    ...(SANITY_READ_TOKEN ? { token: SANITY_READ_TOKEN } : {}),
    // Rehearsal stub only; assertProductionConfig refuses any non-Sanity host otherwise.
    ...(SANITY_API_HOST ? { apiHost: SANITY_API_HOST, useProjectHostname: false } : {}),
  });
  return sanityClient;
}

/**
 * Local development only: documents exported from the local submission
 * review (`pnpm local:pull` → .data/local-dataset.ndjson) are layered on top
 * of the demo fixtures, so the full submit → review → publish flow can be
 * checked end to end without a Sanity project. The file is git-ignored and
 * never exists in CI or production builds from Sanity.
 */
async function localDataset(): Promise<unknown[]> {
  try {
    const { readFile } = await import('node:fs/promises');
    // Resolved from the project root (bundled chunks live elsewhere).
    const raw = await readFile(`${process.cwd()}/.data/local-dataset.ndjson`, 'utf8');
    return raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as unknown);
  } catch {
    return [];
  }
}

let demoDataset: Promise<unknown[]> | undefined;
const loadDemo = () =>
  Promise.all([import('@/fixtures/index.ts'), localDataset()]).then(([m, local]) => {
    const ids = new Set(local.map((d) => (d as { _id: string })._id));
    return [...m.demoDataset.filter((d) => !ids.has(d._id)), ...local];
  });

async function queryDemo<T>(query: string, params: Record<string, unknown>): Promise<T> {
  const [{ parse, evaluate }, data] = await Promise.all([
    import('groq-js'),
    (demoDataset ??= loadDemo()),
  ]);
  const tree = parse(query, { params });
  const value = await evaluate(tree, { dataset: data, params });
  return (await value.get()) as T;
}

export async function groq<T>(query: string, params: Record<string, unknown> = {}): Promise<T> {
  if (contentSource === 'demo') return queryDemo<T>(query, params);
  return getSanityClient().fetch<T>(query, params);
}
