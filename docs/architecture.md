# Architecture

labels.fyi is a **structured knowledge product** with editorial content layered on top. The data is
the product; pages are views over it.

```
Sanity (structured data + editorial workflow)
      │  GROQ at build time
      ▼
src/lib/content  ── repository: bulk queries → resolved content graph
      │
      ├── src/lib/calculations   pure price/unit maths (no UI)
      ├── src/lib/editorial      assessment vocabulary, review state, provenance
      ├── src/lib/seo            titles, canonicals, JSON-LD
      ├── src/lib/search         index builder + engine abstraction
      ▼
Astro pages (static HTML) ──► Cloudflare static assets
```

## Key decisions

| Decision                                               | Why                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fully static output** (`output: 'static'`)           | Every page is known at build time. Static HTML gives the best Core Web Vitals and zero runtime cost. Sanity publishes trigger a rebuild via webhook.                                                                                                                                                |
| **No database**                                        | Nothing in the MVP needs persistent application data. Newsletter signup and the future brand-response inbox are the first candidates for a store (D1 or Neon) and are documented, not built.                                                                                                        |
| **No React on the site**                               | The only interactive pieces (search autocomplete, comparison sort, analytics) are small vanilla-TS islands (~9 KB of client JS in total). React is used only inside Sanity Studio.                                                                                                                  |
| **Studio is a separate workspace package** (`sanity/`) | It keeps React, styled-components and Sanity's Vite out of the site's dependency graph. Deploy it with `sanity deploy` (hosted) or any static host.                                                                                                                                                 |
| **Same GROQ for Sanity and demo data**                 | `src/lib/content/client.ts` runs queries against Sanity, or evaluates the _same_ queries locally with `groq-js` over the fixture dataset. The demo data exercises the real query layer, and the project builds with no credentials.                                                                 |
| **Content graph resolved in TypeScript**               | Seven bulk GROQ queries load everything once per build. Relationships (ingredient → products, guide ↔ product, comparison membership) are joined in `repository.ts`. Queries stay simple and portable, and the join logic is testable. At a few thousand products this is still a few MB per build. |
| **Prices are observations, not attributes**            | `priceSnapshot` documents are dated and append-only. The UI always says _where_ and _when_ a price was seen and flags anything older than 30 days.                                                                                                                                                  |
| **Calculations never guess**                           | Every calculation returns `CalcResult` (`ok` or a reason). Missing data renders as an explanation ("Amount per serving not disclosed on label"), never a number.                                                                                                                                    |

## Content graph

`getContentGraph()` (memoised per build) returns products, ingredients, guides, comparisons, brands,
categories and reviewers with relationships resolved. Pages call it in `getStaticPaths` and receive
fully resolved entities as props. Pages never run GROQ.

Only documents with `workflowStatus in ["PUBLISHED", "NEEDS_REVIEW"]` are queried (`IS_LIVE` in
`queries.ts`). Products whose brand isn't live are dropped, so no page can link to a 404.

## Internal linking graph

```
Product ──► Ingredient ──► other Products containing it
   │            │
   │            ├──► Comparisons (by dose basis or membership)
   │            └──► Guides (relatedIngredients)
   ├──► Comparison ──► peer Products
   ├──► Guides (relatedProducts, or via shared ingredients)
   ├──► Brand, Category
   └──► Sources (numbered, anchor-linked from claims, panels, veg evidence)
```

## Demo mode

When `SANITY_PROJECT_ID` is unset (or `CONTENT_SOURCE=demo`), the build uses `src/fixtures`: fictional
brands (Specimen Nutrition, Sampleworks, Testbed Sports), a placeholder reviewer, and real, cited
public sources. In demo mode:

- a site-wide banner says the data is fictional
- every page is `noindex`
- demo entities also carry `isDemo: true`, which shows a per-page Demo flag even if they are imported into Sanity

The fixtures deliberately exercise the unhappy paths: a superseded label, a proprietary blend, servings
not printed, unknown veg status, no price, a stale price, an inactive affiliate link and an overdue review.

## Future work (designed for, not built)

- **Brand responses**: add a `brandResponse` document (product, claim?, respondent, organisation,
  statement, evidence files, receivedAt, editorial note, status). Render under the relevant claim,
  clearly attributed. The corrections copy on `/methodology` already describes the process.
- **Affiliate redirect (`/go/:offer`)**: a small Worker that logs clicks server-side and 302s to
  `offerHref`. Until then, clicks are tracked client-side via `data-track="affiliate_click"`.
- **Newsletter**: a Worker + D1 table (`email, consent, consented_at, consent_version, source_path`).
  No accounts.
- **Search**: swap `createLocalEngine` for Pagefind or Orama once the index exceeds ~1–2 MB.
- **OG images**: generate per-product label cards at build time.

## Decision record: no database in the MVP

**Decision:** labels.fyi has no Postgres/Neon (or any other application database) in the MVP. This is
intentional.

| Concern                                      | Where it lives now                  | Why that's enough                                  | When to revisit                                                                                                                                              |
| -------------------------------------------- | ----------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Editorial data, observations, label versions | Sanity                              | Versioned, reviewable, append-only by schema rules | Never; this is the system of record                                                                                                                          |
| Price history                                | `priceSnapshot` documents in Sanity | Editor-observed prices are low volume (tens/day)   | **Automated marketplace feeds** (thousands/day) should go to a time-series store (D1 or Postgres), with only the snapshots we _display_ mirrored into Sanity |
| Affiliate clicks                             | GA4 events (`affiliate_click`)      | Analytics, not application state                   | If commission reconciliation is needed: a `/go/:offer` Worker writing to Workers Analytics Engine or D1                                                      |
| Search                                       | Static JSON index built at deploy   | ~6 KB now; fine to ~1–2 MB                         | Swap the `SearchEngine` for Pagefind/Orama (still static)                                                                                                    |
| Newsletter                                   | Not built                           | —                                                  | Worker + D1 (`email, consent, consented_at, consent_version, source_path`), or a hosted ESP                                                                  |
| Brand responses                              | Not built                           | —                                                  | A Sanity document type (editorial content, needs review)                                                                                                     |

None of these paths _requires_ a database to be added up front, and adding one later touches only a
new Worker plus its writer, not the content model or the pages.

## Known architectural risks

- **Build-time "now".** Review-due flags, price staleness and offer expiry are computed at build
  time. A scheduled daily rebuild is required (see deployment.md), or pages drift.
- **Studio is the enforcement point for workflow.** Sanity has no server-side publish hooks. API tokens
  with write access can bypass Studio validation. The site-side filters (live status + approved
  review + reviewed claims) are the backstop. Keep write tokens out of the site and CI.
- **Whole-graph builds.** Each build loads all content (fine to a few thousand products). Beyond that,
  split the product query by category or move to on-demand ISR-style rendering on Workers.
- **Dose-basis rows must be flagged "Key active".** Comparisons read key-active rows. An unflagged
  row shows as "not disclosed" rather than a wrong number (fails safe, but needs editor discipline).
- **Future-scale notes:** Hindi → add a `language` field plus `/hi/…` routes, with no model change.
  Label OCR/AI extraction → write into Draft label panels with `capturedBy: "OCR (model) + <editor>"`,
  still subject to fact check. Marketplace integrations → see the price-history row above.

## Ingestion readiness

External data ingestion is designed but not built. See [ingestion.md](./ingestion.md). Key points:

- Ingestion types (`dataSource`, `sourceSnapshot`, `ingestionRun`, `ingestionCandidate`,
  `productReference`) live in Sanity but are **never queried by the site**.
- Verified external facts enter as ordinary `observation`s (with `snapshot`, `extractedFrom`,
  `verifiedBy`) and go through the unchanged editorial workflow.
- The adapter contract and the pure candidate builder live in `src/lib/ingestion`. There is no network code.
- The "no database in MVP" decision stands. High-volume ingestion events and automated price feeds
  are the Stage 3 trigger for D1/Postgres (see the decision record above and ingestion.md).
- **Risk:** Sanity datasets can be public. Before real ingestion, make the dataset private (or keep
  ingestion types in a separate private dataset). Candidates, snapshots and excerpts are internal
  working data, and the site already reads with a server-side token if one is set.
