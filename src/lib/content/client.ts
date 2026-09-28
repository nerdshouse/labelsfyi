import { createClient, type SanityClient } from '@sanity/client';
import {
  CONTENT_SOURCE,
  SANITY_API_VERSION,
  SANITY_DATASET,
  SANITY_PROJECT_ID,
  SANITY_READ_TOKEN,
} from 'astro:env/server';

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

export const contentSource: ContentSource = (() => {
  if (CONTENT_SOURCE === 'sanity') {
    if (!SANITY_PROJECT_ID) {
      throw new Error('CONTENT_SOURCE=sanity but SANITY_PROJECT_ID is not set. See .env.example.');
    }
    return 'sanity';
  }
  if (CONTENT_SOURCE === 'demo') return 'demo';
  return SANITY_PROJECT_ID ? 'sanity' : 'demo';
})();

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
  });
  return sanityClient;
}

let demoDataset: Promise<unknown[]> | undefined;
async function queryDemo<T>(query: string, params: Record<string, unknown>): Promise<T> {
  const [{ parse, evaluate }, data] = await Promise.all([
    import('groq-js'),
    (demoDataset ??= import('@/fixtures/index.ts').then((m) => m.demoDataset)),
  ]);
  const tree = parse(query, { params });
  const value = await evaluate(tree, { dataset: data, params });
  return (await value.get()) as T;
}

export async function groq<T>(query: string, params: Record<string, unknown> = {}): Promise<T> {
  if (contentSource === 'demo') return queryDemo<T>(query, params);
  return getSanityClient().fetch<T>(query, params);
}
