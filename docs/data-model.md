# Data model

> **Principles**
>
> 1. **Web content is discovery/input. Label evidence and verified observations are the basis for
>    published product facts.**
> 2. **More ingredients or a higher dose is not automatically a quality judgment.** labels.fyi exposes
>    form, amount, transparency, evidence and cost so users can make their own comparisons. No scores,
>    ranks or "best" lists.
> 3. **Brand responses are preserved as provenance and clarification, not treated as automatic
>    editorial approval.**

Write models live in `sanity/schemas`; read models (GROQ projections) live in
`src/lib/content/types.ts`. Keep them aligned.

## Entities

| Entity          | Sanity type       | Kind                               | Notes                                                                                                                             |
| --------------- | ----------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Brand           | `brand`           | document, workflow-gated           |                                                                                                                                   |
| Category        | `category`        | document                           | `/categories/[slug]`                                                                                                              |
| Product         | `product`         | document, workflow-gated           | Identity, serving, veg status. **No price** and **no label rows** on the product itself.                                          |
| Ingredient      | `ingredient`      | document, workflow-gated           | Reference page: forms, findings, studied doses, safety, buying notes.                                                             |
| LabelPanel      | `labelPanel`      | document → product                 | One panel at one point in time. `status: current \| superseded`.                                                                  |
| LabelNutrient   | `labelNutrient`   | object in panel                    | `perServing`, `per100`, `%DV`, `nutrientKey` (drives calculations).                                                               |
| LabelIngredient | `labelIngredient` | object in panel                    | `amount` as printed, normalised `amountPerServing`, blend info, `orderOnLabel`, `isKeyActive`. Amounts are optional: never guess. |
| Claim           | `claim`           | document → product, workflow-gated | Verbatim claim, type, location, neutral assessment, evidence, sources, reviewer.                                                  |
| Evidence        | `evidence`        | object in claim                    | Summary, source, relevance (direct/indirect/background), population.                                                              |
| Source          | `source`          | document                           | Validated DOI/PMID format; must have URL, DOI or PMID unless it's a label or marketplace source.                                  |
| Observation     | `observation`     | document → product, append-only    | Dated fact with source. Corrections use `supersededBy`/`supersededAt`. Delete and unpublish are disabled.                         |
| Reviewer        | `reviewer`        | document                           | `isPlaceholder` for development only; never emitted as a schema.org Person.                                                       |
| EditorialReview | `editorialReview` | document, append-only              | Weak reference to the reviewed doc; reviewer, dates, scope, status.                                                               |
| PriceSnapshot   | `priceSnapshot`   | document, append-only              | Merchant, price, currency, pack size, servings, availability, capturedAt.                                                         |
| Merchant        | `merchant`        | document                           |                                                                                                                                   |
| AffiliateOffer  | `affiliateOffer`  | document                           | destination + affiliate URL, relationship (affiliate/sponsored/none), active, lastCheckedAt.                                      |
| Guide           | `guide`           | document, workflow-gated           | Portable Text body, sources, related ingredients/products.                                                                        |
| Comparison      | `comparison`      | document, workflow-gated           | Product list + `doseBasis`. Tables are computed; never typed.                                                                     |

## Veg status

`VEGETARIAN | NON_VEGETARIAN | VEGAN | UNKNOWN`, always with `vegStatusReason`. Default is `UNKNOWN`.
Supporting `veg_mark` / `ingredient_presence` observations are shown next to the status.

## Claim assessment

`supported | partially_supported | requires_context | not_verifiable | insufficient_evidence`.
The UI shows these as shape-coded glyphs (filled, half, centred dot, dashed, struck), never red/green.
There is no product score.

## Calculations (`src/lib/calculations`)

| Function                | Formula                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `resolveServings`       | label servings, else pack size ÷ serving size (`basis: 'derived_from_pack_size'`) |
| `pricePerServing`       | pack price ÷ servings                                                             |
| `pricePerGram`          | pack price ÷ pack grams (mass packs only)                                         |
| `pricePerEffectiveDose` | pack price ÷ (servings × amount per serving ÷ reference dose)                     |
| `referencePrice`        | lowest per-serving price among the latest in-stock snapshot per merchant          |

Units: `mcg, mg, g, kg` inter-convert; `ml, l` inter-convert; `kcal ↔ kJ`. IU is never converted to
mass. Currency is carried through; INR is the default and USD is supported by type.

For comparisons, the dose-basis ingredient must be flagged **Key active** on the label row (or be a
nutrient with a `nutrientKey`). If any matching row hides its amount, cost per dose is unavailable.

## Invariants

1. Every factual product assertion traces to an observation or a label panel with a source and date.
2. Observations, price snapshots and reviews are never overwritten; they are superseded.
3. Nothing is rendered unless its workflow status is Published or Needs review.
4. No fabricated reviewers, sources, DOIs, PMIDs, ratings or lab results.

## Versioning over time

| Change                    | How it's represented                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| New label / reformulation | New `labelPanel` docs (current); old ones `superseded`. A `label_change` observation describes the change.                             |
| Claims that change        | `claim.status: current \| superseded` + `supersededAt`. Superseded claims stay visible under "Claims from earlier labels".             |
| Veg status change         | Product holds the _current_ status; the history lives in veg-mark/ingredient observations (old ones superseded).                       |
| Prices                    | New `priceSnapshot` per observation; each carries its own pack size and servings.                                                      |
| Reviewer changes          | Each `editorialReview` names its reviewer; the latest approved dietitian review is shown. Reviews are due within 12 months (enforced). |
| Corrections to facts      | New observation + `supersededBy`; factual fields lock 24 h after creation.                                                             |

## Ingestion types (not rendered by the site)

See [ingestion.md](./ingestion.md) for the full design.

| Type                 | Kind                  | Purpose                                                                                                                                                                               |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dataSource`         | document              | A site/organisation we may collect from (domain, type, active, access terms)                                                                                                          |
| `sourceSnapshot`     | document, append-only | What a URL showed at a time (hash, status, storage key, short excerpt, image refs with roles)                                                                                         |
| `ingestionRun`       | document, append-only | One adapter run (status, counts, errors)                                                                                                                                              |
| `ingestionCandidate` | document              | Extracted product awaiting human verification; embeds `extractedFact[]` and `possibleMatch[]`                                                                                         |
| `productReference`   | document              | External listing (URL and/or GTIN, SKU/ASIN, variant, pack size) → one canonical product                                                                                              |
| `labelSubmission`    | document, private     | A label submitted via /submit: status, typed metadata, photo keys + classifications, **internal** submitter name/contact. Never queried by the site except for photo classifications. |
| `submissionImage`    | object                | Opaque R2 key, type, size, sha256, role, `imageKind`, `depictsExactProduct` (+ who/when confirmed)                                                                                    |

Submission fields (Sprint 4): `ingestionCandidate.submission / unresolved / proposedProductChanges`
(dataSource, snapshot and sourceUrl are required only when there is no submission),
`observation.submission`, `labelPanel.sourceImage.submission / verifiedAt / supersedes`. See
[submissions.md](./submissions.md).

Provenance fields added to existing types: `observation.snapshot / extractedFrom / verifiedBy / verifiedAt`,
`priceSnapshot.mrp / sourceUrl / snapshot / listing`, `labelPanel.snapshot`,
`claim.observedAt / observation`, `labelIngredient.editorialNote` (Layer C), and
`product.aliases / marketStatus / discontinuedAt`.

**Three layers:** A = what a source said (`extractedFact`, never rendered) · B = what labels.fyi observed
(`observation`, label panels, `claim.exactClaim`) · C = what it means (`editorialNote`, claim
assessment/explanation). The site renders B and C, and never A.

## Comparison-ready fields

| Where                                                     | Field                                                                                                                                                            | Notes                                                                                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product`                                                 | `variant`                                                                                                                                                        | Flavour/strength. Different flavours are usually separate products.                                                                                            |
| `product`, `labelPanel`                                   | `serving` (`servingSpec`)                                                                                                                                        | `count` + `unit` (serving, capsule, tablet, softgel, strip, scoop, sachet, gummy, ml, g) + optional `mass`/`massUnit`.                                         |
| `labelIngredient`                                         | `form`                                                                                                                                                           | Declared form, e.g. "Magnesium bisglycinate".                                                                                                                  |
| `labelIngredient`                                         | `compoundAmount` / `compoundUnit`                                                                                                                                | Weight of the named compound per serving.                                                                                                                      |
| `labelIngredient`                                         | `elementalAmount` / `elementalUnit` / `elementalBasis` (+ `elementalSource`)                                                                                     | Only when the label declares it (`label_declared`) or an editorial calculation cites its basis. Otherwise **unknown**, never derived from the compound weight. |
| `labelIngredient`                                         | `sourceLocator`                                                                                                                                                  | e.g. "Supplement facts, row 2".                                                                                                                                |
| `labelPanel`                                              | `sourceType`                                                                                                                                                     | `PHYSICAL_PACK`, `BRAND_SUPPLIED_LABEL` or `PRODUCT_ARTWORK`. Required.                                                                                        |
| `labelPanel`                                              | `sourceImage` (`snapshot` + `imageKey`)                                                                                                                          | Required for artwork; the image must be classified and confirmed.                                                                                              |
| `observation`                                             | `sourceType`, `sourceLocator`, `extractionMethod`, `verificationStatus`                                                                                          | Only `verified` observations render.                                                                                                                           |
| `claim`                                                   | `claimSourceType`, `claimSourceLocator` (claim source) · `sources` (evidence sources) · `assessment`/`explanation` (editorial interpretation) · `researchStatus` | Claims render only with research status `EVIDENCE_IDENTIFIED` or `INSUFFICIENT_EVIDENCE_IDENTIFIED`.                                                           |
| `snapshotImage`                                           | `imageKind`, `depictsExactProduct`, `depictsConfirmedBy/At`, `galleryPosition`                                                                                   | `PACK_PHOTO`, `PRINT_ARTWORK`, `MARKETING_GRAPHIC`, `RETYPESET_TABLE`, `UNKNOWN` × `CONFIRMED` / `UNCONFIRMED` / `NOT_THIS_PRODUCT`.                           |
| `productReference`, `priceSnapshot`, `ingestionCandidate` | `gtin`                                                                                                                                                           | Digits only; validated check digit.                                                                                                                            |
| `possibleMatch`                                           | `level`, `relation`, `reasons`                                                                                                                                   | Replaces the old name-similarity `score`.                                                                                                                      |

### Label evidence strength

| Evidence                                                                                                                        | Strength                           | Rendered      |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------- |
| Physical pack, brand-supplied label file, confirmed pack photo                                                                  | strong ("label verified")          | yes           |
| Confirmed print artwork of this exact product                                                                                   | provisional ("from label artwork") | yes, labelled |
| Web/marketing/marketplace copy, unclassified or unconfirmed image, marketing graphic, re-typeset table, another product's image | rejected                           | **no**        |

## Discrepancy & BrandResponse

| Type            | Kind                     | Purpose                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discrepancy`   | document, workflow-gated | Product + field + `values[]` (≥2 `discrepancyValue`s, each with source type, value as stated, locator, observedAt and citation/snapshot/observation) + status (`OPEN`, `AWAITING_BRAND`, `BRAND_RESPONDED`, `RESOLVED`, `UNRESOLVED`, `SUPERSEDED`) + severity (`INFORMATIONAL`, `MATERIAL`, `HIGH_ATTENTION`). Values lock after 24 h; resolution needs a named editor, date and note. |
| `brandResponse` | document, workflow-gated | Contact details (internal), question, response as received, respondent role, supporting sources, the brand's stated resolution. **Never changes the discrepancy status.**                                                                                                                                                                                                               |

Both render only when live and reviewed (named reviewer + review date), like claims. Severity
describes how much a difference matters to a reader, never intent.
