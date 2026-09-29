import type { ServerEnv } from '@/lib/server/env';
import { R2DocStore, SanityDocStore, type DocStore, type SanityLike } from './store';

export class NotConfiguredError extends Error {
  override name = 'NotConfiguredError';
}

/**
 * Production: Sanity with a server-only write token, and only once the
 * dataset has been confirmed private. Local development: the R2 JSON store.
 * Anything else: not configured (submissions return 503).
 */
export async function getDocStore(env: ServerEnv): Promise<DocStore> {
  if (env.SANITY_WRITE_TOKEN && env.SANITY_PROJECT_ID) {
    if (env.SUBMISSIONS_PRIVATE_DATASET !== 'true') {
      throw new NotConfiguredError(
        'Submissions require a private Sanity dataset (SUBMISSIONS_PRIVATE_DATASET=true).',
      );
    }
    const { createClient } = await import('@sanity/client');
    const client = createClient({
      projectId: env.SANITY_PROJECT_ID,
      dataset: env.SANITY_DATASET ?? 'production',
      apiVersion: '2025-02-19',
      token: env.SANITY_WRITE_TOKEN,
      useCdn: false,
      perspective: 'raw',
    });
    return new SanityDocStore(client as unknown as SanityLike);
  }
  if (import.meta.env.DEV && env.SUBMISSIONS) {
    const { demoDataset } = await import('@/fixtures/index.ts');
    return new R2DocStore(env.SUBMISSIONS, demoDataset);
  }
  throw new NotConfiguredError('Label submissions are not configured on this deployment.');
}
