# Production

The runbook for taking labels.fyi live and keeping it live. Everything here is enforced in code:
if a step is skipped, the build or the deploy refuses to proceed. Nothing falls back silently.

## Architecture (unchanged by launch)

| Concern                                           | System                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Content, catalogue, reviews, submissions          | **Sanity**, private dataset (single source of truth)                                      |
| Submitted label photos                            | **Cloudflare R2** `labels-fyi-submissions`, private                                       |
| Public pages                                      | Static build (Workers static assets)                                                      |
| `/analyse`, `/compare/*`, `/api/*`, `/internal/*` | **Cloudflare Worker** `labelsfyi`                                                         |
| `/internal/*` access                              | Cloudflare Access (verified in the Worker) + Basic auth                                   |
| Deploys                                           | GitHub Actions `.github/workflows/deploy.yml`                                             |
| Render Postgres                                   | **Intentionally unused.** No database, ORM, migrations or sync jobs. See architecture.md. |

## What "production" means in code

`DEPLOY_ENV=production` (set by `pnpm build:production` and by the `env.production` vars in
`wrangler.jsonc`) turns on these refusals (`src/lib/content/production.ts`):

- `CONTENT_SOURCE` must be exactly `sanity`. Demo and auto are refused.
- `SANITY_PROJECT_ID`, `SANITY_DATASET` and `SANITY_READ_TOKEN` must be set.
- `PUBLIC_SITE_URL` must be `https://labels.fyi`.
- The dataset must be **private**. The build runs an anonymous `count(*)` query and refuses if it
  sees any document.
- The dataset must contain **no demo documents**. Any `isDemo: true` document stops the build and
  is listed by id.
- Placeholder reviewers never count as approval (`forProduction`). Studio validation also blocks a
  placeholder from approving non-demo content.
- `scripts/check-dist.ts` in `DIST_MODE=production` fails on any of: demo markers, fixture brands,
  placeholder reviewers, non-https or foreign canonicals, private paths in the sitemap, missing
  trust pages, research/submission data, token-shaped strings, or the actual token value in any
  built file.
- `scripts/deploy-guard.ts` refuses to deploy unless all of these hold:
  - `build-meta.json` says production + sanity, not a rehearsal
  - the baked Worker config is `env.production` with a filled-in `SANITY_PROJECT_ID`,
    `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`
  - `workers_dev` and `preview_urls` are off
  - the `labels.fyi` custom-domain route is present

The Worker runtime never needs the read token: on-demand routes read build artifacts through the
`ASSETS` binding. Only submissions use `SANITY_WRITE_TOKEN`, a Worker secret.

## 1. Sanity

1. sanity.io/manage → create project **labels.fyi** (or use the existing one). Note the project ID.
2. Datasets → `production` → **Visibility: Private**. The build proves this and refuses a public
   dataset.
3. API → Tokens:
   - `labels-fyi-build-read` (**Viewer**) → `SANITY_READ_TOKEN`. Store it in GitHub Actions secrets
     and never in the repo.
   - `labels-fyi-worker-write` (**Editor**) → `SANITY_WRITE_TOKEN`. Store it as a Worker secret. It
     is used only by `POST /api/submissions` and the analyser's "Submit for verification", which
     write private, unverified documents.
4. API → CORS origins: `http://localhost:3333` (Studio dev) and the hosted Studio URL, if you deploy
   one. The public site needs no CORS: it never calls Sanity from the browser.
5. Studio: `sanity/.env` with `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET=production`,
   then `pnpm studio:deploy` (optional hosted Studio).
6. Do **not** import `demo-dataset.ndjson` into `production`. If it was imported, the build lists
   every demo document it finds.

## 2. Cloudflare

Account `64046e526f11f6a2fd89e7d7ebdf55ee`. Worker `labelsfyi`, which must match `name` in
`wrangler.jsonc`.

1. **Zone**: add `labels.fyi` to this account (Websites → Add a domain). Change the nameservers at
   the registrar. The custom-domain route in `env.production` needs the zone.
2. **R2**: bucket `labels-fyi-submissions` (created 2026-09-29, APAC). Keep it private: no r2.dev
   URL and no custom domain. Check with `wrangler r2 bucket dev-url get labels-fyi-submissions`.
3. **Worker vars**: fill `env.production.vars` in `wrangler.jsonc` and commit:
   - `SANITY_PROJECT_ID`: public, not a secret. **It must be set here.** Wrangler vars override the
     build environment, so an empty value here wins over a value set in CI.
   - `ACCESS_TEAM_DOMAIN`, e.g. `labelsfyi.cloudflareaccess.com`
   - `ACCESS_AUD`: the Access application's Audience tag
   - `SUBMISSIONS_PRIVATE_DATASET`: `"true"` only after step 1.2
4. **Worker secrets** (`--env production`):

   ```bash
   pnpm exec wrangler secret put REVIEW_USER --env production
   ```

   ```bash
   pnpm exec wrangler secret put REVIEW_PASSWORD --env production
   ```

   ```bash
   pnpm exec wrangler secret put SANITY_WRITE_TOKEN --env production
   ```

5. **workers.dev**: keep it off. An early deploy of the old MVP commit re-enabled it
   (`labelsfyi.spring-queen-e318.workers.dev`). Disable it in Worker → Settings → Domains & Routes.
   From the new config onwards, `workers_dev: false` keeps it off.
6. **Workers Builds**: the dashboard Git integration deploys on push with its own settings and
   bypasses the deploy guard. Disconnect it (Worker → Settings → Build) and use GitHub Actions, or
   set its build command to `pnpm build:production && pnpm test:dist:production` and its deploy
   command to `pnpm deploy:guard && npx wrangler deploy`, with `SANITY_READ_TOKEN` as a build
   secret. Don't run both.

## 3. Cloudflare Access for `/internal/*`

Zero Trust → Access → Applications → **Self-hosted**:

- Domain `labels.fyi`, path `internal` (covers `/internal/*`).
- Policy: Allow → Emails → the reviewers' addresses only.
- Copy the **Application Audience (AUD) tag** into `ACCESS_AUD`, and your team domain into
  `ACCESS_TEAM_DOMAIN`.

The Worker verifies `Cf-Access-Jwt-Assertion` itself (`src/lib/server/access-jwt.ts`):

- RS256 signature against `https://<team>/cdn-cgi/access/certs`
- issuer, audience, expiry and not-before
- no `none` or HMAC algorithms

In production, `/internal` answers **503** until Access is configured and **403** without a valid
token. Basic auth (`REVIEW_USER`/`REVIEW_PASSWORD`) remains the second layer.

## 4. GitHub Actions

Repository `nerdshouse/labelsfyi` → Settings → Environments → **production**:

- Secrets:
  - `CLOUDFLARE_API_TOKEN`: custom token with Workers Scripts:Edit, Workers Routes:Edit (zone
    labels.fyi) and Account Settings:Read
  - `CLOUDFLARE_ACCOUNT_ID`
  - `SANITY_READ_TOKEN`
- Variables (optional): `PUBLIC_GA_MEASUREMENT_ID`, `PUBLIC_CF_ANALYTICS_TOKEN`,
  `PUBLIC_GSC_VERIFICATION`.

The workflow runs on push to `main`, on `repository_dispatch: sanity-publish`, daily at 06:00 IST,
and manually. Each run: quality gates → `build:production` → production dist checks → deploy guard
→ `wrangler deploy` → live route checks.

## 5. Rebuild on publish (Sanity webhook)

sanity.io/manage → API → Webhooks → Create:

| Field       | Value                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| URL         | `https://api.github.com/repos/nerdshouse/labelsfyi/dispatches`                                                                                                                             |
| Dataset     | `production`                                                                                                                                                                               |
| Trigger on  | Create, Update, Delete                                                                                                                                                                     |
| Filter      | `_type in ["product","ingredient","claim","guide","comparison","brand","labelPanel","priceSnapshot","affiliateOffer","editorialReview","goal","productGoal","assetPermission","reviewer"]` |
| Projection  | `{"event_type": "sanity-publish"}`                                                                                                                                                         |
| HTTP method | POST                                                                                                                                                                                       |
| Headers     | `Authorization: Bearer <fine-grained GitHub token, this repo only, Contents: Read and write>` and `Accept: application/vnd.github+json`                                                    |
| Drafts      | off (published changes only)                                                                                                                                                               |

Test it with the webhook's "Send test", then check Actions for a `repository_dispatch` run.
Webhook-to-deploy latency is a few minutes (a full build).

## 6. Local verification

```bash
pnpm verify
```

That covers typecheck, lint, tests, Studio typecheck and validation, the demo build, dist checks
and the Cloudflare dry run.

**Production rehearsal.** This runs the production code path against a local stand-in for a
private, empty Sanity dataset. It is **not** production and is never deployable: `build-meta.json`
says `rehearsal: true` and the deploy guard refuses it.

```bash
pnpm rehearsal:stub
```

```bash
pnpm build:rehearsal && pnpm test:dist:production
```

`node scripts/rehearsal/sanity-stub.ts <file.ndjson>` serves documents. `STUB_PUBLIC=1` simulates a
public dataset. Both must make the build refuse. Serve the result with the
`labels-fyi-rehearsal` preview (`wrangler dev` on `dist`), then:

```bash
pnpm test:routes http://localhost:4323 --production
```

## 7. Data onboarding

1. Brand permission first. For a brand like Briyo, file the **written** permission as an
   `assetPermission` document:
   - status `AUTHORIZED`
   - scope (FACTUAL_DATA / LABEL_INFORMATION / IMAGES / URLS) and permitted URLs
   - grantedBy, grantedAt, where the evidence is filed
   - verifiedBy (a labels.fyi reviewer) and verifiedAt
   - expiry, if any

   Studio refuses AUTHORIZED without these fields.

2. In `research/sources.json`, set that source's `permissionVerified: true` and `permissionRecord`
   to the document's `_id`. Until then the analyser and the feed importer refuse the source
   (`PERMISSION_UNVERIFIED`).
3. Import research output (`research/catalogue/*.ndjson`, gitignored) into the **private**
   production dataset. Every document is an UNVERIFIED `ingestionCandidate`, never a product:

   ```bash
   pnpm --filter @labels-fyi/studio exec sanity dataset import ../research/catalogue/briyo-2026-09-29.ndjson production --missing
   ```

4. Editors turn candidates into products from **label photos** (Submit or editorial capture), fact
   check them, and publish with an approved review by a **real** reviewer. Only published,
   approved products appear on the site.

Images: third-party product images are never shown without an AUTHORIZED, verified permission
whose scope includes IMAGES. Otherwise the neutral text tile is shown.

## 8. Status (2026-09-29)

Configured and verified:

- Sanity project `r1eiikj7` (org `oEeVgmR5i`), dataset `production` set to **private** via the CLI
  and verified (authenticated read; anonymous reads see nothing). Content is empty: only Sanity
  `system.*` documents.
- Sanity tokens:
  - `labels-fyi-build-read` (viewer, id `g-igpHOolTzDqq`): stored in the gitignored
    `.env.production.local` (mode 600) and as GitHub repo secret `SANITY_READ_TOKEN`
  - `labels-fyi-worker-write` (editor, id `g-deBCGQV8NDPh`): stored only as the Worker secret
    `SANITY_WRITE_TOKEN` (`--env production`)
- `SANITY_PROJECT_ID=r1eiikj7` and `SUBMISSIONS_PRIVATE_DATASET="true"` in `env.production.vars`.
- GitHub repo secrets `SANITY_READ_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Top-level Worker name `labelsfyi-local`; only `env.production` is `labelsfyi`, and the deploy
  guard refuses any other name. This does **not** stop Cloudflare Workers Builds: it deployed the
  first commit into `labelsfyi` even though that commit's config said `labels-fyi`. Workers Builds
  must be disconnected.
- The real `pnpm build:production` passes against Sanity, and the production dist checks pass. The
  deploy guard refuses only because `ACCESS_*` is empty.

Still manual: Cloudflare Access (Zero Trust not enabled), the `labels.fyi` zone,
`CLOUDFLARE_API_TOKEN`, the Sanity webhook with a GitHub token, disconnecting Workers Builds,
turning off workers.dev, `REVIEW_USER`/`REVIEW_PASSWORD`, a real reviewer, real products, Briyo's
written permission, legal review, and the mailboxes.
