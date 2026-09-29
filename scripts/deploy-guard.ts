/**
 * Runs immediately before `wrangler deploy` (pnpm deploy:cf, CI). Refuses to
 * deploy anything except a genuine production build: DEPLOY_ENV=production,
 * CONTENT_SOURCE=sanity, not a local rehearsal, and passing the production
 * dist checks. A demo or rehearsal build can therefore never go live.
 */
import { existsSync, readFileSync } from 'node:fs';

const path = 'dist/client/build-meta.json';
if (!existsSync(path)) {
  console.error(
    'deploy-guard: no build found (dist/client/build-meta.json). Run pnpm build:production.',
  );
  process.exit(1);
}
const meta = JSON.parse(readFileSync(path, 'utf8')) as {
  deployEnv: string;
  contentSource: string;
  rehearsal: boolean;
};
const problems = [
  meta.deployEnv !== 'production' && `build is "${meta.deployEnv}", not production`,
  meta.contentSource !== 'sanity' && `content source is "${meta.contentSource}", not sanity`,
  meta.rehearsal && 'this is a local PRODUCTION_REHEARSAL build',
  (process.env.PRODUCTION_REHEARSAL === 'true' || process.env.SANITY_API_HOST) &&
    'PRODUCTION_REHEARSAL / SANITY_API_HOST is set in the deploy environment',
  ...workerConfigProblems(),
].filter(Boolean);
/**
 * The adapter bakes the selected wrangler environment into
 * dist/server/wrangler.json (CLOUDFLARE_ENV=production at build time); that is
 * the config `wrangler deploy` uses. It must be the filled-in production one.
 */
function workerConfigProblems(): string[] {
  const cfgPath = 'dist/server/wrangler.json';
  if (!existsSync(cfgPath))
    return ['no dist/server/wrangler.json (build with CLOUDFLARE_ENV=production)'];
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
    name?: string;
    vars?: Record<string, string>;
    workers_dev?: boolean;
    preview_urls?: boolean;
    routes?: Array<{ pattern: string; custom_domain?: boolean }>;
  };
  const v = cfg.vars ?? {};
  return [
    cfg.name !== 'labelsfyi' && `Worker name is "${cfg.name}", not labelsfyi`,
    v.DEPLOY_ENV !== 'production' &&
      'Worker config is not the production environment (build with CLOUDFLARE_ENV=production)',
    v.CONTENT_SOURCE !== 'sanity' && 'Worker var CONTENT_SOURCE is not "sanity"',
    !/^[a-z0-9]{6,32}$/.test(v.SANITY_PROJECT_ID ?? '') &&
      'Worker var SANITY_PROJECT_ID is empty (wrangler.jsonc env.production.vars)',
    !v.ACCESS_TEAM_DOMAIN &&
      'Worker var ACCESS_TEAM_DOMAIN is empty (Cloudflare Access for /internal)',
    !v.ACCESS_AUD && 'Worker var ACCESS_AUD is empty (Cloudflare Access for /internal)',
    cfg.workers_dev !== false && 'workers_dev must be false',
    cfg.preview_urls !== false && 'preview_urls must be false',
    !(cfg.routes ?? []).some((r) => r.pattern === 'labels.fyi' && r.custom_domain) &&
      'the labels.fyi custom domain route is missing',
  ].filter((x): x is string => typeof x === 'string');
}

if (problems.length) {
  console.error(`deploy-guard: refusing to deploy:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log('deploy-guard: production build OK.');
