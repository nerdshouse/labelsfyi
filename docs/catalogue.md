# Catalogue research & ingestion

**Nothing collected from a website is published.** Imports create unverified Layer A candidates
(docs/ingestion.md). Facts reach the site only after a person verifies them against **label
evidence** (the Sprint 4 review pipeline or Studio) and the product passes the editorial workflow.

## Access modes (`dataSource.accessMode`)

| Mode                                      | Meaning                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `NOT_PERMITTED`                           | The terms prohibit copying, storing or scraping. Nothing is collected. |
| `MANUAL_RESEARCH`                         | A person may note facts by hand; no automation.                        |
| `BRAND_PERMISSION`                        | The brand has permitted use (file the written permission).             |
| `BRAND_SUPPLIED_FEED` / `AUTHORIZED_FEED` | The brand or partner supplies a feed or API.                           |
| `USER_SUBMITTED_LABEL`                    | Labels submitted by people via /submit.                                |

The feed adapter (`src/lib/ingestion/shopify-feed.ts`) refuses any source not in
`BRAND_PERMISSION`, `BRAND_SUPPLIED_FEED` or `AUTHORIZED_FEED`. There is no crawler: one request to
a store's public product feed, no link following, no image downloads.

```bash
pnpm research:feed briyo                                   # permitted sources only
pnpm research:feed briyo --from-file products.json         # from a saved/brand-supplied file
```

Output: `research/catalogue/<source>-<date>.ndjson`, containing:

- `dataSource`, recording the terms decision
- `sourceSnapshot`, with URL, fetch time, content hash, a ≤600-char excerpt, and image URLs as
  references only
- `ingestionCandidate`, with every fact `unverified`, prices/MRP per variant, amounts exactly as
  stated, and `goalSuggestions` from the brand's own product type, tags and title

Import it into a **private** dataset with `sanity dataset import`, then verify in Studio. Accepted
candidates become `productGoal` candidates (`goalCandidatesFromSuggestions`) for review at
`/internal/goals`.

**Never inferred:** elemental amounts, standard ratios, veg status, servings, efficacy. A title
saying "Magnesium Glycinate 1000 mg" stays a compound figure with elemental unknown.

## Source review: 29 Sept 2026 (`research/sources.json`)

| Source                    | Robots                                    | Terms                                                                       | Decision                                                                                                                           |
| ------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| briyosupplements.com      | Product pages allowed; ClaudeBot welcomed | Copying/reproduction prohibited without permission                          | `BRAND_PERMISSION` (operator-stated client brand; file written permission). **28 candidates imported**, 8 samples/bundles skipped. |
| mycf.in (Carbamide Forte) | Allowed                                   | Prohibits "crawl, or scrape" and copying without written permission         | `NOT_PERMITTED`: nothing collected                                                                                                 |
| wellbeingnutrition.com    | Allowed                                   | Only personal, non-commercial use; copying or storing prohibited            | `NOT_PERMITTED`: nothing collected                                                                                                 |
| rasayanam.in              | Allowed                                   | Prohibits "spider, crawl, or scrape" and copying without written permission | `NOT_PERMITTED`: nothing collected                                                                                                 |
| rasayan.in                | n/a                                       | A water-treatment chemicals business                                        | Out of scope                                                                                                                       |

Routes for the blocked brands: written permission, a brand-supplied feed, or physical labels
submitted via `/submit` (label facts come from the pack, not the website).

## What is and isn't published

| Published (after review)                                         | Never published                                           |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| Verified label facts (panels, observations) with source and date | Unverified website facts (Layer A)                        |
| Dated price observations with a source                           | Internal permission evidence, contacts, submitter details |
| Approved goal relationships with their basis                     | Candidate or rejected relationships                       |
| Authorized or editorial images                                   | Scraped or unauthorized images                            |

## Sprint 7: real data, production and the analyser

- **Production shows only real, reviewed products.** `DEPLOY_ENV=production` (used by
  `pnpm deploy:cf`) refuses demo content and strips demo documents and placeholder-reviewed
  approvals. Fixtures remain for tests and demo builds only.
- **Real catalogue status (29 Sept 2026): 0 published.** 28 Briyo research candidates are
  unverified. Publishing needs a named reviewer to verify each against a physical pack or
  brand-supplied label file (Sprint 4 pipeline), then Studio review. Suggested first set (10–20):
  3 magnesium, 2 melatonin, 2 creatine, 2 vitamin D3, 1 hydration. Briyo covers melatonin, D3
  (×3), hydration (H2Lyte) and B12; magnesium and creatine need other permitted sources or
  submitted labels.
- **Consumer URL analysis** adds candidates in the same model (docs/ingestion.md).
