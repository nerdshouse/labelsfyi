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

**The production runbook is [production.md](./production.md).** In short:

- Public pages are prerendered static assets. The Worker `labelsfyi` serves only `/analyse`,
  `/compare/*`, `/api/*` and `/internal/*`.
- `wrangler.jsonc` top level = local development; `env.production` = the live site. The adapter
  bakes the environment selected at build time (`CLOUDFLARE_ENV=production`, set by
  `pnpm build:production`) into `dist/server/wrangler.json`, which `wrangler deploy` uses.
- Deploys run through `.github/workflows/deploy.yml`: push, Sanity publish, daily rebuild. Locally:

```bash
pnpm deploy:cf
```

It runs `build:production`, then the production dist checks, then `deploy:guard`, then
`wrangler deploy`.

- R2 bucket `labels-fyi-submissions` is private. Secrets are `REVIEW_USER`, `REVIEW_PASSWORD` and
  `SANITY_WRITE_TOKEN` (`--env production`). Cloudflare Access is in front of `/internal/*` and
  verified in the Worker.

## Environment variables

| Variable                            | Where           | Required         | Purpose                                             |
| ----------------------------------- | --------------- | ---------------- | --------------------------------------------------- |
| `PUBLIC_SITE_URL`                   | site            | yes (prod)       | Canonical origin                                    |
| `CONTENT_SOURCE`                    | site            | no               | `auto` \| `sanity` \| `demo`                        |
| `SANITY_PROJECT_ID`                 | site            | for Sanity       |                                                     |
| `SANITY_DATASET`                    | site            | no               | default `production`                                |
| `SANITY_API_VERSION`                | site            | no               | default `2025-02-19`                                |
| `SANITY_READ_TOKEN`                 | site (secret)   | private datasets | server-only                                         |
| `PUBLIC_GA_MEASUREMENT_ID`          | site            | no               | GA4; nothing loads if unset                         |
| `PUBLIC_CF_ANALYTICS_TOKEN`         | site            | no               | Cloudflare Web Analytics                            |
| `PUBLIC_GSC_VERIFICATION`           | site            | no               | Search Console meta tag                             |
| `SANITY_STUDIO_PROJECT_ID`          | studio          | yes              |                                                     |
| `DEPLOY_ENV`                        | site + worker   | yes (prod)       | `production` enables every refusal in production.md |
| `PRODUCTION_REHEARSAL`              | site            | no               | local rehearsal only; never deployable              |
| `SANITY_API_HOST`                   | site            | no               | rehearsal stub only (refused otherwise)             |
| `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` | worker          | yes (prod)       | Cloudflare Access JWT verification for `/internal`  |
| `REVIEW_USER` / `REVIEW_PASSWORD`   | worker (secret) | for review       | Basic auth for `/internal/*`; fails closed if unset |
| `SANITY_WRITE_TOKEN`                | worker (secret) | for submissions  | server-only; never in the build                     |
| `SUBMISSIONS_PRIVATE_DATASET`       | worker          | for submissions  | must be `true`; hard prerequisite                   |
| `SANITY_STUDIO_DATASET`             | studio          | no               |                                                     |

Variables are validated by Astro's `env.schema` (`astro.config.mjs`). Never commit `.env`.

## Analytics events

GA4 events (via `src/lib/analytics/events.ts`): `product_view`, `search`, `comparison_view`,
`compare`, `affiliate_click`, `buy_click`, `goal_view`, `ingredient_view`, `analyse_url`,
`analyse_result`, `submit_verification`, `receipt_view` and `receipt_share`. Mark `affiliate_click`
and `buy_click` as key events in GA4.

Every parameter passes an allowlist (`sanitizeParams`): public slugs, enums, counts and our own
paths only. Search text, submitted URLs, e-mails, phones, free text, Sanity ids, R2 keys and
secrets are dropped. Page views are sent without query strings or fragments.
