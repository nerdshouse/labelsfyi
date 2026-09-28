# Deployment

## Local development

```bash
pnpm install
pnpm dev            # http://localhost:4321, demo data if SANITY_PROJECT_ID is unset
pnpm verify         # typecheck + lint + tests + build
```

## Sanity

1. Create a project at sanity.io/manage (or run `pnpm --filter @labels-fyi/studio exec sanity init --env`).
2. Copy `sanity/.env.example` to `sanity/.env` and set `SANITY_STUDIO_PROJECT_ID`.
3. `pnpm studio`, which opens the Studio at http://localhost:3333.
4. Optional: load the demo dataset into a **development** dataset:
   ```bash
   pnpm demo:export
   pnpm --filter @labels-fyi/studio exec sanity dataset create development
   pnpm --filter @labels-fyi/studio exec sanity dataset import ../demo-dataset.ndjson development
   ```
5. Deploy the Studio: `pnpm studio:deploy` (hosted at `<name>.sanity.studio`).

Point the site at Sanity with `.env`:

```
SANITY_PROJECT_ID=xxxx
SANITY_DATASET=production
CONTENT_SOURCE=sanity   # fail the build rather than silently falling back to demo data
```

`SANITY_READ_TOKEN` is only needed for private datasets. It is read server-side at build time and
never shipped to the browser.

## Cloudflare

The site is static and deployed as **Workers static assets** (`wrangler.jsonc`, no Worker script):

```bash
pnpm deploy:cf      # astro build && wrangler deploy
```

For CI (recommended: Cloudflare Workers Builds or GitHub Actions):

- Build command: `pnpm build`
- Deploy command: `npx wrangler deploy`
- Environment variables: `PUBLIC_SITE_URL`, `SANITY_PROJECT_ID`, `SANITY_DATASET`, `CONTENT_SOURCE=sanity`,
  and optionally `PUBLIC_GA_MEASUREMENT_ID`, `PUBLIC_CF_ANALYTICS_TOKEN`, `PUBLIC_GSC_VERIFICATION`.
- Node 22.12+ and pnpm 10.

### Rebuild on publish

Create a Cloudflare deploy hook (or a GitHub `repository_dispatch`) and add it as a Sanity webhook
(sanity.io/manage → API → Webhooks), filtered to `_type in ["product","ingredient","claim","guide","comparison","brand","labelPanel","priceSnapshot","affiliateOffer","editorialReview"]`.

Also schedule a **daily rebuild**. Review-due flags, price-staleness notes and affiliate link expiry
are evaluated at build time.

### Domain

Add `labels.fyi` as a custom domain on the Worker. Set `PUBLIC_SITE_URL=https://labels.fyi`.

## Environment variables

| Variable                    | Where         | Required         | Purpose                      |
| --------------------------- | ------------- | ---------------- | ---------------------------- |
| `PUBLIC_SITE_URL`           | site          | yes (prod)       | Canonical origin             |
| `CONTENT_SOURCE`            | site          | no               | `auto` \| `sanity` \| `demo` |
| `SANITY_PROJECT_ID`         | site          | for Sanity       |                              |
| `SANITY_DATASET`            | site          | no               | default `production`         |
| `SANITY_API_VERSION`        | site          | no               | default `2025-02-19`         |
| `SANITY_READ_TOKEN`         | site (secret) | private datasets | server-only                  |
| `PUBLIC_GA_MEASUREMENT_ID`  | site          | no               | GA4; nothing loads if unset  |
| `PUBLIC_CF_ANALYTICS_TOKEN` | site          | no               | Cloudflare Web Analytics     |
| `PUBLIC_GSC_VERIFICATION`   | site          | no               | Search Console meta tag      |
| `SANITY_STUDIO_PROJECT_ID`  | studio        | yes              |                              |
| `SANITY_STUDIO_DATASET`     | studio        | no               |                              |

Variables are validated by Astro's `env.schema` (`astro.config.mjs`). Never commit `.env`.

## Analytics events

GA4 events (via `src/lib/analytics/events.ts`): `product_view`, `search`, `comparison_view`,
`affiliate_click` (product, merchant, relationship, page, timestamp), and `newsletter_signup`
(reserved). Mark `affiliate_click` as a key event in GA4.
