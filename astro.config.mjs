// @ts-check
import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// labels.fyi is a fully static site. Content is pulled from Sanity (or the
// local demo dataset) at build time; Cloudflare serves the output as static
// assets. See docs/architecture.md.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'https://labels.fyi',
  output: 'static',
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
