// @ts-check
import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

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
  vite: {
    plugins: [tailwindcss()],
  },
});
