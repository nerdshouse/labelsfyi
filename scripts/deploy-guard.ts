/**
 * Runs immediately before `wrangler deploy` (pnpm deploy:cf, CI). Refuses to
 * deploy anything except a genuine production build: DEPLOY_ENV=production,
 * CONTENT_SOURCE=sanity, not a local rehearsal, and passing the production
 * dist checks. A demo or rehearsal build can therefore never go live.
 */
import { existsSync, readFileSync } from 'node:fs';
import { workerConfigProblems, type WorkerConfig } from '../src/lib/server/deploy-config.ts';

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
  ...bakedWorkerConfigProblems(),
].filter(Boolean);
/**
 * The adapter bakes the selected wrangler environment into
 * dist/server/wrangler.json (CLOUDFLARE_ENV=production at build time); that is
 * the config `wrangler deploy` uses. It must be the filled-in production one
 * (rules and tests: src/lib/server/deploy-config.ts).
 */
function bakedWorkerConfigProblems(): string[] {
  const cfgPath = 'dist/server/wrangler.json';
  if (!existsSync(cfgPath))
    return ['no dist/server/wrangler.json (build with CLOUDFLARE_ENV=production)'];
  return workerConfigProblems(JSON.parse(readFileSync(cfgPath, 'utf8')) as WorkerConfig);
}

if (problems.length) {
  console.error(`deploy-guard: refusing to deploy:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log('deploy-guard: production build OK.');
