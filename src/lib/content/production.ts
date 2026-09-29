/**
 * Production configuration contract (docs/production.md). Pure and tested.
 *
 * A production build (DEPLOY_ENV=production) must read the real, private
 * Sanity dataset and nothing else. It refuses — never falls back — when:
 *   - CONTENT_SOURCE is not exactly "sanity" (no demo, no "auto")
 *   - the Sanity project, dataset or server-side read token is missing
 *   - the site URL is not the https production origin
 *   - the Sanity API host is not *.sanity.io, unless this is an explicitly
 *     flagged local PRODUCTION_REHEARSAL (which can never be deployed:
 *     scripts/deploy-guard.ts refuses it)
 */

export interface ProductionEnv {
  DEPLOY_ENV?: string | undefined;
  CONTENT_SOURCE?: string | undefined;
  SANITY_PROJECT_ID?: string | undefined;
  SANITY_DATASET?: string | undefined;
  SANITY_READ_TOKEN?: string | undefined;
  SANITY_API_HOST?: string | undefined;
  PRODUCTION_REHEARSAL?: string | undefined;
  PUBLIC_SITE_URL?: string | undefined;
}

export class ProductionConfigError extends Error {
  override name = 'ProductionConfigError';
}

export function productionProblems(env: ProductionEnv): string[] {
  if (env.DEPLOY_ENV !== 'production') return [];
  const p: string[] = [];
  if (env.CONTENT_SOURCE !== 'sanity')
    p.push('CONTENT_SOURCE must be "sanity" (demo and auto are refused).');
  if (!env.SANITY_PROJECT_ID || !/^[a-z0-9]{6,32}$/.test(env.SANITY_PROJECT_ID))
    p.push('SANITY_PROJECT_ID is missing or malformed.');
  if (!env.SANITY_DATASET || !/^[a-z0-9_-]{1,64}$/.test(env.SANITY_DATASET))
    p.push('SANITY_DATASET is missing.');
  if (!env.SANITY_READ_TOKEN)
    p.push(
      'SANITY_READ_TOKEN is missing (the production dataset is private; the build reads it server-side).',
    );
  const rehearsal = env.PRODUCTION_REHEARSAL === 'true';
  if (env.SANITY_API_HOST) {
    let host = '';
    try {
      host = new URL(env.SANITY_API_HOST).hostname;
    } catch {
      p.push('SANITY_API_HOST is not a URL.');
    }
    const official = host === 'api.sanity.io' || host.endsWith('.api.sanity.io');
    if (host && !official && !(rehearsal && (host === '127.0.0.1' || host === 'localhost')))
      p.push(
        'SANITY_API_HOST must be the Sanity API (a local host is allowed only for a PRODUCTION_REHEARSAL).',
      );
  } else if (rehearsal) {
    p.push('PRODUCTION_REHEARSAL requires a local SANITY_API_HOST.');
  }
  if (!rehearsal && env.PUBLIC_SITE_URL !== 'https://labels.fyi')
    p.push('PUBLIC_SITE_URL must be https://labels.fyi in production.');
  return p;
}

export function assertProductionConfig(env: ProductionEnv): void {
  const problems = productionProblems(env);
  if (problems.length)
    throw new ProductionConfigError(`Production build refused:\n  - ${problems.join('\n  - ')}`);
}

/**
 * Placeholder reviewers must not exist in the production dataset: an API write
 * can bypass Studio validation, so the build refuses rather than silently
 * ignoring their approvals.
 */
export function assertNoPlaceholderReviewers(
  reviewers: Array<{ _id?: string; isPlaceholder?: boolean }> | undefined,
): void {
  const found = (reviewers ?? []).filter((r) => r.isPlaceholder === true).map((r) => r._id ?? '?');
  if (found.length)
    throw new ProductionConfigError(
      `Production dataset contains placeholder reviewer(s) (${found.join(', ')}). Only real, credentialed reviewers may exist in production.`,
    );
}

/** Demo/fixture documents must not exist in the production dataset at all. */
export function assertNoDemoDocuments(collections: Record<string, unknown[] | undefined>): void {
  const found = Object.entries(collections).flatMap(([name, docs]) =>
    (docs ?? [])
      .filter((d) => (d as { isDemo?: boolean }).isDemo === true)
      .map((d) => `${name}:${(d as { _id?: string })._id ?? '?'}`),
  );
  if (found.length)
    throw new ProductionConfigError(
      `Production dataset contains ${found.length} demo document(s) (${found.slice(0, 5).join(', ')}${found.length > 5 ? ', …' : ''}). Remove them from the production dataset; demo content is never published.`,
    );
}
