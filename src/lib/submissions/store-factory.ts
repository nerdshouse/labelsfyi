import type { ServerEnv } from '@/lib/server/env';
import { R2DocStore, SanityDocStore, type DocStore, type SanityLike } from './store';

export class NotConfiguredError extends Error {
  override name = 'NotConfiguredError';
}

/**
 * Reviewer-facing reason the submission store is unavailable while a write
 * token is configured. "false" is the deliberate closed state (public
 * submissions intentionally off); any other value that is not "true" means the
 * private-dataset prerequisite has not been confirmed.
 */
export function submissionsUnavailableMessage(flag: string | undefined): string {
  return flag === 'false'
    ? 'Submissions are currently closed.'
    : 'Submissions require a private Sanity dataset.';
}

/**
 * Public label submissions (/api/submissions, the analyser's "Submit for
 * verification") are open ONLY when PUBLIC_SUBMISSIONS is exactly "open".
 * Unset, "closed" or anything malformed keeps them closed (fail closed).
 * Independent of the private internal review store below.
 */
export function publicSubmissionsOpen(env: Pick<ServerEnv, 'PUBLIC_SUBMISSIONS'>): boolean {
  return env.PUBLIC_SUBMISSIONS === 'open';
}

/**
 * The store for PUBLIC intake: refuses (NotConfiguredError → 503 "not open
 * yet") unless public submissions are open AND the private store is available.
 */
export async function getPublicSubmissionStore(env: ServerEnv): Promise<DocStore> {
  if (!publicSubmissionsOpen(env))
    throw new NotConfiguredError('Public submissions are closed on this deployment.');
  return getDocStore(env);
}

/**
 * The PRIVATE document store used by /internal review (and, when open, by
 * public intake via getPublicSubmissionStore).
 * Production: Sanity with a server-only write token, and only once the
 * dataset has been confirmed private (SUBMISSIONS_PRIVATE_DATASET=true; the
 * production build re-proves it). Local development: the R2 JSON store.
 * Anything else: not configured.
 */
export async function getDocStore(env: ServerEnv): Promise<DocStore> {
  if (env.SANITY_WRITE_TOKEN && env.SANITY_PROJECT_ID) {
    if (env.SUBMISSIONS_PRIVATE_DATASET !== 'true') {
      throw new NotConfiguredError(submissionsUnavailableMessage(env.SUBMISSIONS_PRIVATE_DATASET));
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
