/**
 * Production deploy configuration rules (docs/production.md). Pure, so they
 * are unit-tested and shared by scripts/deploy-guard.ts. No imports: the guard
 * runs under plain `node` (type stripping, no path aliases).
 *
 * Values are checked EXACTLY as written. Nothing is trimmed, lower-cased or
 * stripped of a scheme: a malformed value is rejected, never "fixed".
 */

/** A Cloudflare Access team hostname: `<name>.cloudflareaccess.com`, nothing else. */
export const ACCESS_TEAM_DOMAIN_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
/** An Access application Audience (AUD) tag: 64 lowercase hex characters. */
export const ACCESS_AUD_RE = /^[a-f0-9]{64}$/;

/** Team names that are documentation placeholders, not a real team. */
const PLACEHOLDER_TEAMS = new Set([
  'team',
  'your-team',
  'yourteam',
  'my-team',
  'myteam',
  'example',
  'placeholder',
  'changeme',
  'change-me',
  'test',
  'demo',
  'todo',
  'xxx',
]);

export function accessTeamDomainProblem(value: unknown): string | null {
  if (typeof value !== 'string' || value === '')
    return 'ACCESS_TEAM_DOMAIN is empty (Cloudflare Access for /internal)';
  if (!ACCESS_TEAM_DOMAIN_RE.test(value))
    return 'ACCESS_TEAM_DOMAIN must be exactly "<team>.cloudflareaccess.com" (lowercase; no scheme, path, port, trailing slash or whitespace)';
  if (PLACEHOLDER_TEAMS.has(value.slice(0, -'.cloudflareaccess.com'.length)))
    return 'ACCESS_TEAM_DOMAIN is a placeholder, not a real Access team';
  return null;
}

export function accessAudProblem(value: unknown): string | null {
  if (typeof value !== 'string' || value === '')
    return 'ACCESS_AUD is empty (Cloudflare Access for /internal)';
  if (!ACCESS_AUD_RE.test(value))
    return `ACCESS_AUD must be exactly 64 lowercase hex characters (got ${value.length} characters${/^[a-fA-F0-9]*$/.test(value) ? '' : ', including non-hex'})`;
  // A 64-hex placeholder: one repeated character, or a repeated 0-9a-f run.
  if (/^(.)\1{63}$/.test(value) || value === '0123456789abcdef'.repeat(4))
    return 'ACCESS_AUD is a placeholder, not a real Access application AUD tag';
  return null;
}

export interface WorkerConfig {
  name?: string;
  vars?: Record<string, string>;
  workers_dev?: boolean;
  preview_urls?: boolean;
  routes?: Array<{ pattern: string; custom_domain?: boolean }>;
}

/** Problems with the baked production Worker config (dist/server/wrangler.json). */
export function workerConfigProblems(cfg: WorkerConfig): string[] {
  const v = cfg.vars ?? {};
  return [
    cfg.name !== 'labelsfyi' && `Worker name is "${cfg.name}", not labelsfyi`,
    v.DEPLOY_ENV !== 'production' &&
      'Worker config is not the production environment (build with CLOUDFLARE_ENV=production)',
    v.CONTENT_SOURCE !== 'sanity' && 'Worker var CONTENT_SOURCE is not "sanity"',
    !/^[a-z0-9]{6,32}$/.test(v.SANITY_PROJECT_ID ?? '') &&
      'Worker var SANITY_PROJECT_ID is empty or malformed (wrangler.jsonc env.production.vars)',
    !['open', 'closed'].includes(v.PUBLIC_SUBMISSIONS ?? '') &&
      'Worker var PUBLIC_SUBMISSIONS must be exactly "open" or "closed"',
    v.PUBLIC_SUBMISSIONS === 'open' &&
      v.SUBMISSIONS_PRIVATE_DATASET !== 'true' &&
      'PUBLIC_SUBMISSIONS is "open" but SUBMISSIONS_PRIVATE_DATASET is not "true"',
    accessTeamDomainProblem(v.ACCESS_TEAM_DOMAIN),
    accessAudProblem(v.ACCESS_AUD),
    cfg.workers_dev !== false && 'workers_dev must be false',
    cfg.preview_urls !== false && 'preview_urls must be false',
    !(cfg.routes ?? []).some((r) => r.pattern === 'labels.fyi' && r.custom_domain) &&
      'the labels.fyi custom domain route is missing',
  ].filter((x): x is string => typeof x === 'string');
}
