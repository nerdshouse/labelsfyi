# Label submissions & review

> **We only record what the submitted label shows. Missing information stays missing.**
> Nothing a person submits is published automatically. Every fact is read off the photo by a
> named reviewer, and a named editorial reviewer approves it before it appears on the site.

## The flow

```
/submit ──POST /api/submissions──► R2 (private photos) + labelSubmission (NEEDS_REVIEW)
                                            + ingestionCandidate (unverified facts, suggested matches)
                                                   │
/internal/review/<id>  (Basic auth + Cloudflare Access)
  1. Match      ACCEPT EXISTING │ CREATE NEW (minimal DRAFT product) │ REJECT
                GTIN typed from the barcode photo, check-digit validated,
                stored on productReference (never on the product); or "Not observed"
                ─► submission IN_REVIEW
  2. Facts      each photo classified + confirmed (PACK_PHOTO / CONFIRMED) by the reviewer
                each value VERIFIED / MISSING / UNCLEAR, facts photo shown beside the form
                ─► source + PHYSICAL_PACK observations + labelPanel (append-only)
                   UNCLEAR anything ─► blocks step 3 until re-reviewed
  3. Workflow   readiness gate (5 checks) ─► product DRAFT → FACT_CHECK, submission VERIFIED
                ────────── Sanity Studio: fact check → dietitian review → Approved → Publish ──────────
  4. Release    product published + approved review dated after verification
                ─► submission PUBLISHED (and held-back product-field changes applied)
```

The receipt (`/receipt/<slug>`) and product page come from the normal build once the product is
published. Real products never carry the demo band; fixture products always do.

## Statuses

| Status         | Meaning                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| `RECEIVED`     | Reserved (a record is created and validated in one step, so it starts at NEEDS_REVIEW). |
| `NEEDS_REVIEW` | Stored; nobody has matched it yet.                                                      |
| `IN_REVIEW`    | Linked to a product by a reviewer; facts being verified.                                |
| `VERIFIED`     | Passed the readiness gate and entered the editorial workflow (FACT_CHECK).              |
| `PUBLISHED`    | Approved in Studio after verification and released.                                     |
| `REJECTED`     | Closed with a reason. Nothing else is created.                                          |

## Readiness gate (step 3)

All five must pass. They are shown on the review screen and enforced by `planEnterWorkflow`:

1. **Identity verified**: candidate `confirmed` (existing) or `new_product`, with a named reviewer.
2. **Source evidence**: at least one photo classified `PACK_PHOTO` and confirmed `CONFIRMED`.
3. **Pack observation verified**: a `PHYSICAL_PACK` observation with `verificationStatus: verified`
   and `verifiedBy`.
4. **Required fields**: name, brand, category, format, veg status + reason, structured serving,
   `lastVerifiedAt`, a current label panel.
5. **No unresolved blocking issue**: candidate `accepted`, nothing marked UNCLEAR.

Entering the workflow is **not** publication. The Studio publish gates (Approved status, approved
`editorialReview`, stage validation) are unchanged.

## The approval gate on the site

Panels and observations created from a submission render only when the product has an **approved
editorial review dated at or after the record's `verifiedAt`** (`gateSubmissionRecords` in
`src/lib/content/repository.ts`):

- **New product.** Studio requires that review before the product can be published, so nothing
  changes for the reader. The gate is a backstop.
- **Label update to a live product.** The new panel and observations are written immediately but
  stay invisible until an editor reviews the product again in Studio. The earlier panel is never
  edited: the new panel lists it in `supersedes`, and the site treats it as history only once the
  new panel passes the gate. Product-field changes (serving, servings per pack, veg status, label
  date) are held on the candidate as `proposedProductChanges` and applied by the release step.

## Label history

- New labels always become new observations and a new `labelPanel`. Nothing is overwritten.
- "Same label" resubmissions add dated observations only.
- "New label version" adds a panel that `supersedes` the current ones, plus a `label_change`
  observation. The product page shows the change notice and "Earlier label versions".
- Re-reviewing a submission (to resolve UNCLEAR values) supersedes that submission's earlier
  observations (`supersededAt`/`supersededBy`) rather than editing them.

## Values: unknown vs absent vs zero

| Reviewer marks | Stored as                                                              |
| -------------- | ---------------------------------------------------------------------- |
| VERIFIED `0`   | `0` (a real value)                                                     |
| MISSING        | `null` + a `label_text` observation saying the label does not print it |
| UNCLEAR        | `null` + listed in `candidate.unresolved`, blocks the workflow         |

- **Compound and elemental are independent.** A compound amount needs its form. An elemental amount
  can only be entered when the label declares it (`elementalBasis: label_declared`). Nothing is
  ever converted or derived.
- A new product starts with `vegStatus: UNKNOWN` ("Not yet verified from the label.") and no
  serving. The facts step fills only what was verified.

## Storage

| What                   | Where                                                           | Notes                                                                                                                 |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Photos                 | R2 bucket `labels-fyi-submissions` (`SUBMISSIONS` binding)      | Private: no public bucket, no r2.dev, no custom domain.                                                               |
| Object keys            | `submissions/YYYY/MM/sub-<20 hex>/NN-<16 hex>.<jpg\|png\|webp>` | Generated server-side. Submitted filenames are never used. Every key read back is checked against this exact pattern. |
| Submission + candidate | Sanity (`labelSubmission`, `ingestionCandidate`)                | **Private dataset required** (`SUBMISSIONS_PRIVATE_DATASET=true`), else the API refuses with 503.                     |
| Local development      | R2 emulation (`.wrangler/state`) as JSON docs under `dev-docs/` | `R2DocStore`, only when `import.meta.env.DEV` and no Sanity write token.                                              |

Photos are served to reviewers only through `/internal/review/image/<key>` (authenticated, strict
content type, `nosniff`, `Content-Security-Policy: default-src 'none'`, `private, no-store`).
The site shows a panel's image _classification_ from the submission, never the key or the photo.

## Security controls

- **Validation** (`src/lib/submissions/validate.ts`):
  - exactly one front and one facts photo, at most 6 photos in total
  - at most 10 MB each, 40 MB in total, 42 MB request (checked from `content-length` first)
  - JPEG, PNG or WebP only, checked by magic bytes; the declared type **and** the extension must
    match the sniffed type (so no SVG, HTML or polyglots)
- **Text** is sanitised: control, zero-width and bidi characters are removed, `<>` are stripped,
  whitespace is collapsed and length is capped. The product URL must be http(s) without
  credentials. `updateOfProduct` must be a slug.
- **Abuse**: a hidden honeypot field, an optional Workers rate limit (`SUBMIT_RATE_LIMITER`, 5/min
  per IP), multipart only, and same-origin `Origin` required.
- **Internal routes**:
  - HTTP Basic auth against Worker secrets (constant-time compare), which fails closed (503) when
    unset
  - checked on the decoded path **and** the matched route pattern, so `/%69nternal` is caught
  - same-origin required for POSTs, on top of Astro's `checkOrigin`
  - `no-store`, `noindex` and `Referrer-Policy: same-origin`. Not `no-referrer`: that makes
    browsers send `Origin: null` on form posts.
- **Privacy**: submitter name and contact live only on `labelSubmission`. They are never copied
  into products, sources, panels or observations. The public source reads "Label photos submitted
  to labels.fyi (date)", and `pnpm test:dist` fails if a submitter field, storage key or R2 host
  appears in any public file.
- **No analytics** on submit or internal pages beyond the site's existing page analytics.
  Submission contents are never sent to analytics.
- **No** OCR, AI extraction, automatic matching decisions, emails or public accounts.

## Configuration

```bash
# Local: copy and set a long random password
cp .dev.vars.example .dev.vars
pnpm dev                      # /submit, /internal/review (Basic auth from .dev.vars)
```

Production (Cloudflare):

```bash
wrangler r2 bucket create labels-fyi-submissions
wrangler secret put REVIEW_USER
wrangler secret put REVIEW_PASSWORD
wrangler secret put SANITY_WRITE_TOKEN      # Editor-role token for the (private) dataset
# vars: SANITY_PROJECT_ID, SANITY_DATASET, SUBMISSIONS_PRIVATE_DATASET=true
```

Also put **Cloudflare Access** (Zero Trust) in front of `/internal/*`. Basic auth is the in-app
backstop, not the only lock.

## Seeing the whole flow locally

Dev pages render inside workerd (no filesystem), so locally published submissions appear through a
build:

1. `pnpm dev`, then submit at `/submit` and review at `/internal/review`.
2. On a VERIFIED submission, **Simulate editorial publish (local)**. This is dev and local store
   only. It creates an approved review by the flagged placeholder reviewer with the note "LOCAL
   DEVELOPMENT SIMULATION", then publishes.
3. `pnpm local:pull` exports the local documents (candidates dropped, submissions reduced to image
   classifications) to `.data/local-dataset.ndjson` (git-ignored).
4. Stop `pnpm dev`, then `pnpm build && pnpm preview`. The demo content client layers that file
   over the fixtures, and `pnpm test:dist` checks the real receipt.

## Code map

| File                                                         | Role                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| `src/pages/submit.astro`, `components/submit/submit-form.ts` | Public form (works without JS)                            |
| `src/pages/api/submissions.ts`                               | Intake endpoint                                           |
| `src/lib/submissions/intake.ts`                              | Validate → R2 → submission + candidate                    |
| `src/lib/submissions/review.ts`                              | Pure planners: match, facts, readiness, workflow, release |
| `src/lib/submissions/steps.ts`                               | Route-level steps (what tests run)                        |
| `src/lib/submissions/store*.ts`                              | Sanity / local R2 / in-memory document stores             |
| `src/lib/server/internal-auth.ts`, `src/middleware.ts`       | Internal route protection                                 |
| `src/pages/internal/review/**`                               | Review UI and POST handlers                               |
| `src/lib/content/repository.ts` (`gateSubmissionRecords`)    | Site-side approval gate                                   |

## Known limitations

- Review form values are not preserved after a validation error (the page redirects).
- Up to 4 actives per review pass in the UI (the parser accepts 8). Nutrient rows, proprietary
  blends and claims are recorded in Studio.
- The GTIN is entered by hand from the barcode photo. There is no scanning.
- Submitted photos are not copied into Sanity `labelImages`. The Studio past-Draft rule accepts
  confirmed submission evidence instead (`requireLabelEvidence`).
- `SANITY_WRITE_TOKEN` is a dataset-wide editor token held by the Worker. Keep it as a secret and
  rotate it. A narrower custom role is advisable on plans that support it.
- Chunked uploads without `content-length` are bounded by Cloudflare's request body limit, not by
  our 42 MB pre-check (the per-file and total checks still apply after parsing).
