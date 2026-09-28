# Editorial workflow

```
DRAFT → FACT_CHECK → DIETITIAN_REVIEW → APPROVED → PUBLISHED
                                                      │
                                    NEEDS_REVIEW ◄────┘ (review date passed / label changed)
```

## How it is enforced

- **Publish gate** (`sanity/actions/workflow.ts`): for brand, product, ingredient, claim, guide and
  comparison, the Publish button is disabled unless `workflowStatus` is Approved (or already
  Published / Needs review). Publishing an Approved document sets it to Published.
- **Stage validation** (`sanity/lib/fields.ts`):
  - leaving Draft requires label photos (products), serving size, label-verified date, and evidence
    and sources (claims, ingredients)
  - Approved requires a reviewer and review date (claims)
- **Site filter**: GROQ only selects `PUBLISHED` and `NEEDS_REVIEW` documents, so an accidentally
  published draft-status document still never renders.
- **Append-only records**: delete and unpublish are removed for observations, price snapshots and
  editorial reviews. Sanity's revision history covers everything else.

## Adding a product (step by step)

1. **Brand**: create it if missing and move it through the workflow.
2. **Ingredient(s)**: create reference pages for key actives if missing.
3. **Source**: one `product_label` source per label capture ("Brand X 1 kg, back label, Sep 2026").
4. **Product**: identity, format, serving size as printed, veg status and reason. Leave
   `servingsPerContainer` empty if it isn't printed.
5. **Label panels**: one per panel. Transcribe rows exactly and in label order. Link rows to
   ingredients, mark key actives, and leave amounts empty when not disclosed.
6. **Observations**: serving size, front-label claims, veg mark, notable ingredients. Each is dated
   and sourced.
7. **Claims**: verbatim claim, type, location, neutral assessment and status, evidence and sources.
8. **Prices & offers**: add a price snapshot per merchant. Add affiliate offers with `lastCheckedAt`.
9. **Fact check → Dietitian review**: the reviewer checks and creates an `editorialReview` (approved,
   next review date, typically 6 months).
10. **Approve → Publish**. The Sanity webhook rebuilds the site.

## Label changes

Create a new panel with `status: current` and set the old one to `superseded` with a note. Add new
observations and set `supersededBy`/`supersededAt` on the old ones. The product page shows earlier
labels and the history automatically.

## Language rules

- Describe, don't judge: "The label does not disclose individual amounts", not "hides", "scam" or "fake".
- Avoid "toxic" and "dangerous" unless there is strong, direct evidence and editorial sign-off.
- No diagnosis, treatment instructions or disease-cure framing. Health context always ends with
  "speak to a doctor".
- Separate the four voices: label says / manufacturer claims / evidence says / we conclude.
- Never state or imply laboratory testing unless a real test report is linked.

## Exactly what prevents unreviewed content from going live

Four independent layers. Any one of them stops unreviewed health content from appearing on the site.

1. **Publish button gate** (Studio UI). Disabled unless status is Approved, Published or Needs review.
2. **Blocking validation** (Studio). Sanity refuses to publish a document with validation errors,
   whatever the status radio says:
   - product / ingredient / guide / comparison in Approved, Published or Needs review **must have a
     published `editorialReview` with status `approved` referencing it** (`requireApprovedReview`)
   - claims in those statuses must have a reviewer and review date
   - a product with a veg status other than Unknown must have a current veg-mark or ingredient observation
3. **Site query filter.** Only `PUBLISHED` / `NEEDS_REVIEW` documents are fetched, and claims only
   when they have a reviewer and review date.
4. **Site graph filter.** Products, ingredients, guides and comparisons without an approved review are
   dropped at build time, even if published (`assembleGraph`, covered by tests).

**Residual risk:** anyone with a write API token can bypass Studio validation (layers 1–2). Layers
3–4 still hold. Restrict write tokens and Studio roles.

## Reformulations & label versions

When a product changes (e.g. January: 30 g protein, gelatin capsule → September: 25 g protein, HPMC
capsule):

1. Create new label panels (Current); set the old ones to Superseded with a note. Never edit old panels.
2. Add a `label_change` observation describing what changed, plus new veg-mark/ingredient observations.
   Set `supersededBy`/`supersededAt` on the old observations.
3. Mark claims that no longer appear as Superseded (with date); add new claims.
4. Update the product's _current_ fields (serving size, veg status and reason).
5. Old price snapshots keep their own pack/servings, so historical costs stay correct.

The product page then shows a "label has changed" notice, the earlier label, earlier claims and the
full dated history.

## Record locking

Observations and price snapshots lock their factual fields 24 hours after creation, and cannot be
deleted or unpublished. Sanity's revision history also retains every edit.

## Ingested data (future)

Ingested candidates sit _before_ this workflow. A person confirms the product match, verifies each
extracted fact against the source/label, and records verified facts as observations or label rows
(with `extractedFrom`, `snapshot`, `verifiedBy`). The product then goes through Draft → Fact check →
Dietitian review as usual. AI or parser output is never authoritative and can't mark anything
verified. Full design: [ingestion.md](./ingestion.md).
