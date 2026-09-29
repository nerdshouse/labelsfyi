// @ts-check
import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import { rm } from 'node:fs/promises';

// A production build (pnpm build:production). Local/demo builds are untouched.
const isProductionBuild =
  process.env.DEPLOY_ENV === 'production' || process.env.CLOUDFLARE_ENV === 'production';

// Local credential files that must never be written into production output.
// @cloudflare/vite-plugin emits the local dev vars (from .dev.vars, or else
// .env files) as `dist/server/.dev.vars` so `vite preview` works; in a
// production build that would put local secrets next to the deployable Worker.
const LOCAL_CREDENTIAL_FILE = /(^|\/)(\.dev\.vars(\..+)?|\.env(\..+)?)$/;

/** Drops local credential files from every production bundle before they are written. */
function noLocalCredentialsInProductionOutput() {
  return {
    name: 'labels-fyi:no-local-credentials-in-production-output',
    enforce: /** @type {const} */ ('post'),
    apply: /** @type {const} */ ('build'),
    /** @param {unknown} _options @param {Record<string, unknown>} bundle */
    generateBundle(_options, bundle) {
      if (!isProductionBuild) return;
      for (const fileName of Object.keys(bundle))
        if (LOCAL_CREDENTIAL_FILE.test(fileName)) delete bundle[fileName];
    },
  };
}

/**
 * Demo assets (public/demo/: fictional product art used by the demo dataset)
 * stay available to local/demo builds but are removed from production output.
 * scripts/check-dist.ts (DIST_MODE=production) fails if any remain.
 * @returns {import('astro').AstroIntegration}
 */
function noDemoAssetsInProduction() {
  /** @type {URL | undefined} */
  let clientDir;
  return {
    name: 'labels-fyi:no-demo-assets-in-production',
    hooks: {
      'astro:config:done': ({ config }) => {
        clientDir = config.build.client;
      },
      'astro:build:done': async ({ logger }) => {
        if (!isProductionBuild || !clientDir) return;
        await rm(new URL('demo/', clientDir), { recursive: true, force: true });
        logger.info('Removed demo assets (public/demo) from the production output.');
      },
    },
  };
}

// labels.fyi is a static-first site: every public page is prerendered from
// Sanity (or the local demo dataset) at build time. A small number of
// on-demand routes (label submission API, internal review) run on the same
// Cloudflare Worker. See docs/architecture.md and docs/submissions.md.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'https://labels.fyi',
  output: 'static',
  adapter: cloudflare({
    // Static pages keep prerendering in Node (demo dataset, GROQ via groq-js).
    prerenderEnvironment: 'node',
    imageService: 'passthrough',
  }),
  // No sessions: internal review uses HTTP auth, public users have no accounts.
  session: false,
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  env: {
    schema: {
      PUBLIC_SITE_URL: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
        default: 'https://labels.fyi',
      }),
      SANITY_PROJECT_ID: envField.string({ context: 'server', access: 'public', optional: true }),
      SANITY_DATASET: envField.string({
        context: 'server',
        access: 'public',
        optional: true,
        default: 'production',
      }),
      SANITY_API_VERSION: envField.string({
        context: 'server',
        access: 'public',
        optional: true,
        default: '2025-02-19',
      }),
      SANITY_READ_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      // "production" strips all demo content and refuses a demo content source.
      DEPLOY_ENV: envField.enum({
        context: 'server',
        access: 'public',
        values: ['development', 'preview', 'production'],
        optional: true,
        default: 'development',
      }),
      // Production rehearsal only: point the build at a local Sanity-API stub.
      // Refused for real production and by scripts/deploy-guard.ts.
      SANITY_API_HOST: envField.string({ context: 'server', access: 'public', optional: true }),
      PRODUCTION_REHEARSAL: envField.enum({
        context: 'server',
        access: 'public',
        values: ['true', 'false'],
        optional: true,
        default: 'false',
      }),
      CONTENT_SOURCE: envField.enum({
        context: 'server',
        access: 'public',
        values: ['auto', 'sanity', 'demo'],
        optional: true,
        default: 'auto',
      }),
      PUBLIC_GA_MEASUREMENT_ID: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_CF_ANALYTICS_TOKEN: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_GSC_VERIFICATION: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
    },
  },
  integrations: [noDemoAssetsInProduction()],
  vite: {
    plugins: [tailwindcss(), noLocalCredentialsInProductionOutput()],
  },
});
