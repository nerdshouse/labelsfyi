# Ingestion (readiness design)

> **Status:** schemas, contracts and boundary code only. There is **no crawler, scraper, scheduler,
> queue, OCR, AI integration or database** in this repository. Nothing has been fetched from any real
> website. Demo ingestion records use the reserved `.example` domain.

> **Principles**
>
> 1. **Web content is discovery/input. Label evidence and verified observations are the basis for
>    published product facts.**
> 2. **More ingredients or a higher dose is not automatically a quality judgment.** labels.fyi exposes
>    form, amount, transparency, evidence and cost so users can make their own comparisons. No scores,
>    ranks or "best" lists.
> 3. **Brand responses are preserved as provenance and clarification, not treated as automatic
>    editorial approval.**

## Hard prerequisite: isolated, private data

**No real external data may be ingested until ingestion data is isolated from public read access.**
This means a **private Sanity dataset** (or an equivalent, such as a separate private dataset or project
used only for ingestion types) with reads restricted to authenticated tokens. Snapshots, excerpts,
candidates and run logs are internal working material. They may contain third-party text and must
never be readable through a public dataset or API. Confirm this, and record who confirmed it and when,
before activating any `dataSource`. The demo ingestion documents contain only fictional `.example`
data and are exempt.

## Principle

**Ingestion is not publishing.** External data is evidence of _what a source said_. It becomes
labels.fyi content only when a person verifies it and records it through the normal editorial
workflow (fact check → dietitian review → approved → published).

## Flow

```
                External sources (future)
                         │
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
  Brand D2C site      Retailer        Marketplace
        └────────────────┼────────────────┘
                         ↓
              Source adapter (one per source)
                         ↓
   sourceSnapshot     URL + time + hash (+ raw body/images in object storage)
                         ↓
   Extraction         parser / structured data / OCR / AI  →  Layer A facts
                         ↓
   ingestionCandidate unverified facts + suggested (never confirmed) matches
                         ↓
   Match review       person: existing product / new product / not a product
                         ↓
   Fact check         person verifies each fact against the label/source
                         ↓                     → observation, label panel, claim (Layer B)
   Dietitian / editorial review                 → claim assessment, notes (Layer C)
                         ↓
   APPROVED → PUBLISHED (existing publish gate, review requirement, site filters)
```

## Data model

| Type                     | What it is                                                                                                                                                      | Written by                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `dataSource`             | A website/organisation we may collect from (name, domain, type, active, access terms, optional brand/merchant)                                                  | Editor                                                          |
| `sourceSnapshot`         | What a URL showed at a time: fetchedAt, HTTP status, content hash, title, **storage key** for raw body, short verification excerpt, image references with roles | Adapter (future) or editor. Append-only; fields lock after 24 h |
| `ingestionRun`           | One adapter run: status (running/completed/partial/failed), counts, errors                                                                                      | Adapter (future)                                                |
| `ingestionCandidate`     | One extracted product from one snapshot: embedded `extractedFact[]`, match status, possible matches, confirmed product                                          | Pipeline creates; editors verify                                |
| `extractedFact` (object) | Field, value **as the source states it**, parsed amount/unit, method, confidence, verification status, verifier, resulting observation                          | Embedded in candidate                                           |
| `productReference`       | An external listing of a canonical product (URL, external ID/SKU/ASIN, variant, pack size, first/last seen, matchedBy)                                          | Editor on match confirmation                                    |

Extended existing types (no new provenance system):

- `observation` gains `snapshot`, `extractedFrom`, `verifiedBy` and `verifiedAt`. An observation with
  `extractedFrom` must name its verifier, or the site won't render it. New types: `pack_size`,
  `ingredient_amount`, `ingredient_form`, `product_image`.
- `priceSnapshot` gains `mrp`, `sourceUrl`, `snapshot` and `listing`. It needs a source or listing URL.
- `labelPanel` gains `snapshot` (transcribed from a captured page/image).
- `claim` gains `observedAt` and `observation` (its front-label observation). `status` and
  `supersededAt` were already in place.
- `labelIngredient` gains `editorialNote` (Layer C).
- `product` gains `aliases` (renames, marketplace titles) and `marketStatus` / `discontinuedAt`.

**Why `extractedFact` is embedded, not a document:** a fact only has meaning in the context of its
extraction (snapshot, extractor, candidate). Keeping it inside the candidate means there is no
standalone "fact" record that could be queried or mistaken for labels.fyi data. The verified,
publishable form of a fact is an `observation`, and that type already exists.

**Why `dataSource` and not `source`:** `source` is an existing _citation_ type (a specific study,
label capture or page). `dataSource` is the _site_ we collect from. A snapshot can back a citation.

## Three layers, never collapsed

| Layer                           | Example                                                         | Stored as                                                                             | Needs                                   |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| **A. Source declaration**       | Brand page says "2,000 mg magnesium glycinate"                  | `extractedFact.value` + `sourceSnapshot`                                              | Provenance only                         |
| **B. labels.fyi observation**   | The label declares 2,000 mg magnesium glycinate per serving     | `observation`, `labelPanel` rows, `claim.exactClaim`                                  | Source + date + named observer/verifier |
| **C. Editorial interpretation** | This is the compound's weight, not 2,000 mg elemental magnesium | `labelIngredient.editorialNote`, `claim.assessment` / `explanation`, ingredient pages | Evidence + review                       |

The site renders Layer C distinctly ("labels.fyi note", "What it means"). Layer A is never rendered.

## Provenance: what answers "where did this come from?"

| Fact                                            | Where / when                                                                          | Verified by                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------- |
| Serving size, ingredient amount/form, nutrients | `labelPanel` (source, capturedAt, capturedBy, snapshot) + observations                | capturedBy / observation.verifiedBy |
| Label claims                                    | `claim.observation` → front-label observation (source, observedAt)                    | claim.reviewer                      |
| Veg / vegan status                              | veg-mark / ingredient observations (required by Studio validation)                    | observedBy / verifiedBy             |
| Pack size, price, MRP                           | `priceSnapshot` (merchant, capturedAt, sourceUrl, snapshot, listing)                  | source/listing                      |
| Label changes, reformulations                   | superseded panels + claims, `label_change` observation                                | observedBy                          |
| Product images                                  | `snapshotImage` (URL, role, who assigned role) → promoted to label photo after review | editor                              |

**Fail-safe rule (enforced by the site and tested):** label panels, observations, claims and prices
without provenance are not rendered, and observations from ingested data are not rendered without a
named verifier.

## Deduplication and variants

Many `productReference`s → one `product`. A pipeline may _suggest_ matches (`suggestMatches`, simple
token overlap). **Only a person confirms one.**

| Situation                             | Treatment                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Same formulation, different pack size | Same product. Pack size lives on `productReference` and `priceSnapshot`.                                   |
| Different flavour                     | **Different product** (different label/nutrition). May be flagged as a possible match; must not be merged. |
| Reformulated label                    | Same product; new label panels and claims, old ones superseded (see editorial-workflow.md).                |
| Renamed                               | Same product; old name added to `aliases`.                                                                 |
| Discontinued                          | `marketStatus: discontinued`; page stays as a record with a notice. Never deleted.                         |

Candidates flow `candidate → possible match → human confirms`, never `scraper → overwrite product`. A
candidate can't be marked Accepted until its match is confirmed and every fact is verified or rejected.

## Prices

Every observation is a new `priceSnapshot` per merchant. Brand site ₹1,799, Amazon ₹1,649 and HealthKart
₹1,699 are three snapshots. `mrp` is stored separately from the selling price and is not used in cost
maths. There is no mutable "current price" field anywhere.

## Label images

Snapshots reference images by URL, with a `role` (front / ingredients / nutrition / back / other /
unknown) and who assigned it (human / parser / ocr / ai). Files belong in object storage (`storageKey`),
not Sanity. A label photo shown on the site is a reviewed copy uploaded to the product/panel. Machine
role assignments are suggestions.

## AI boundary

AI (and OCR, and parsers) **may produce:** `extractedFact`s in an `ingestionCandidate`, suggested
image roles, and suggested product matches.

AI **must not produce or modify:** approved products, claims, claim assessments, evidence, label
panels, observations, veg status, reviews, or anything published.

Enforcement:

- `toCandidateDocument` forces every fact to `unverified`, whatever the extractor claims (tested).
- Verification requires a named person (`verifiedBy`, `verifiedAt`).
- Candidates are never queried by the site.
- Publishing still requires the full editorial workflow and an approved dietitian review.

## Source, legal and technical boundaries

These are operating rules, not legal advice. Take advice before large-scale collection.

- Source pages are **provenance and evidence**, not content to republish. Record facts in our own
  words; don't copy brand marketing copy or product descriptions.
- Minimise reproduction: store a short excerpt needed to verify facts, not full pages. Keep raw
  archives private (object storage). Don't republish third-party images without permission.
- Keep source URLs, fetch timestamps and content hashes for every snapshot.
- Verify extracted facts independently (ideally against a label image or physical pack) before
  publication.
- Before activating a `dataSource`, record its terms and robots.txt position in `accessPolicy`. Don't
  assume any site permits automated access. Respect access restrictions and rate limits; identify
  the crawler honestly. Some sources (notably large marketplaces) may require an official API,
  feed or partnership instead of fetching pages.
- Fail safely: a blocked, erroring or changed page produces a `FetchResult` failure and a `partial`
  run, never partial or guessed product data.
- Expect source-specific adapters. Each site's structure differs, and adapters break when sites change.

## Adapter contract

`src/lib/ingestion/types.ts` defines `SourceAdapter` (`canHandle`, `discover`, `fetch → FetchResult`,
`extract → ExtractedProduct[]`). Every adapter (one per brand or retailer) feeds the same pure
`toCandidateDocument` in `src/lib/ingestion/candidate.ts`, which enforces the provenance and
verification rules. Adapters never write labels.fyi content.

## Editor workflow (intended)

Studio → **Ingestion (not published)** → _Candidates needing verification_:

1. Open a candidate. It shows the source, snapshot (URL, fetch time, images), extracted facts with
   ✓ / ⚠ / ✕ state, and possible matches.
2. Set the match: _confirmed existing product_, _new product_ or _not a product_. On confirmation,
   create a `productReference`.
3. For each fact: check it against the snapshot image or label. If correct, record an `observation`
   (or label-panel row or claim) with `extractedFrom`, `snapshot`, `verifiedBy` and `verifiedAt`, and
   link it from the fact. Otherwise reject it with a reason.
4. Accept the candidate (allowed only when the match is confirmed and every fact is resolved).
5. Product changes then go through the normal fact check → dietitian review → approval.

A richer Studio UI (side-by-side snapshot view, one-click "record as observation") is future work.
The current schemas support it.

## Scaling path

| Stage         | Stack                                                                                                                                                        | Notes                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **MVP (now)** | Sanity + static Astro; editor-created products                                                                                                               | No database (see architecture.md)                                                         |
| **Stage 2**   | Source adapters as Cloudflare Workers + Cron Triggers; R2 for raw bodies/images; optional Queue per source                                                   | Writes snapshots, runs and candidates to Sanity via a write token held only by the Worker |
| **Stage 3**   | D1 or Postgres for high-volume ingestion events and automated price observations; R2 archive; Sanity stays the editorial CMS; search index service if needed | Only _displayed_ prices/facts are mirrored into Sanity as snapshots/observations          |

## Not implemented (deliberately)

Crawling/fetching of any site, adapters for specific brands or retailers, scheduling, queues, object
storage, OCR, AI calls, the side-by-side review UI, automatic observation creation, and any database.

## Findings from experiment 1 and what changed

The first research-only run (10 products, 141 facts) found that:

- about 56% of label facts were only in images
- 8 of 10 products had page-vs-label differences
- name-token matching produced false positives
- barcodes were present on every product

In response:

- **GTIN** fields (`productReference`, `priceSnapshot`, `ingestionCandidate`) and GTIN-first matching.
- **Brand-gated matcher** with generic-word removal. Regression tests cover the observed false
  positives ("Daily Probiotic Slow" vs "PCOS Balance Slow", "Hydrasalt" vs "Multivitamins") and the
  sibling case (Creatine Monohydrate vs Creatine Monohydrate + HCl).
- **Image classification** (`imageKind`, `depictsExactProduct`). Panels built from images must use a
  confirmed pack photo or print artwork.
- **Source-specific observations** (`sourceType`, `sourceLocator`, `extractionMethod`,
  `verificationStatus`) and `sourceLocator` on extracted facts.
- **Compound vs elemental** amounts and **structured servings**.
- **Discrepancy** and **BrandResponse** entities for website-vs-pack differences.

Still not built: crawler, OCR, AI calls, queue, workers, object storage, database.

## Label submissions

People can submit label photos directly (`/submit`). Each submission becomes a `labelSubmission`
(private) and an `ingestionCandidate` with `submission` set instead of a `dataSource` snapshot. The
submitted brand, name and variant are **unverified facts**, the same Layer A as scraped data. The
same rules apply: a person confirms the match, verifies each fact against the photo, and records
Layer B observations. The private-dataset prerequisite above is enforced in code
(`SUBMISSIONS_PRIVATE_DATASET`). Full design: [submissions.md](./submissions.md).

## Product URL analyser (Sprint 7)

`/analyse` → `analyseUrl` (`src/lib/analyse/`): validate the URL → source register (fail closed)
→ robots.txt → controlled fetch → extract facts → show results as **UNVERIFIED**. "Submit for
verification" re-runs the analysis on the server and writes `dataSource` + `sourceSnapshot` (no
excerpt, no images) + `ingestionCandidate` (`extractor: url-analyser@1`, all facts `unverified`,
possible matches from the strict matcher, never confirmed) to the private store. It never creates
a Product. Extraction order: JSON-LD Product (name, brand, sku, GTIN, offer price; **never**
description, image, review or rating) → meta tags → visible facts (serving lines,
supplement-facts table rows, "X mg of Y per tablet"). No OCR on images. Security:
docs/security.md. Policy: docs/source-policy.md.
