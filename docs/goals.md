# Goals

> A goal is a **consumer discovery category**: "supplements marketed for sleep support". It is not
> a diagnosis, not medical advice, and never a claim that a supplement treats anything.

Flow: **goal → common ingredients → products → decoder → compare → receipt → buy**.

## Data model

| Type                      | What                                                                                                                               | Rules                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `goal`                    | `name`, `slug` (top-level URL), `shortDescription`, `discoveryDescription`, `ingredients[]`, `order` + editorial workflow          | Published only via the normal workflow **and** an approved `editorialReview` (like ingredients and guides). The Studio blocks slugs that collide with existing routes and copy containing treat/cure/prevent/diagnose/heal. |
| `goalIngredient` (object) | `name`, optional canonical `ingredient`, `matchNames[]`, `relation`                                                                | `COMMONLY_FOUND` by default. `EDITORIALLY_REVIEWED` needs a linked evidence record (`claim`), and the site only honours it while that claim is live and publishable; otherwise it is shown as commonly found.               |
| `productGoal`             | `product`, `goal`, `basis`, `statement`, `source`/`sourceUrl`, `sourceLocator`, `observedAt`, `status`, `reviewedBy`, `reviewedAt` | Only `APPROVED` + named reviewer + a source is shown. Bases: `BRAND_MARKETING`, `EDITORIAL_CLASSIFICATION`, `INGREDIENT_MATCH` (a suggestion only; it still needs approval).                                                |

Initial goals: sleep, stress, immunity, hydration, energy, gut-health, joint-health, hair-skin,
heart-health. **Not created**, and not to be created without an editorial and evidence framework:
PCOS, anxiety, depression, ADHD, diabetes, hormonal balance and similar condition-like categories.

## How a goal is created

1. In Studio: **Goals & commerce → Goals → New**. Write the short description as "Supplements
   marketed for … support."
2. Add common ingredients. Link the canonical ingredient when it exists; otherwise add `matchNames`
   (label names).
3. Move it through Draft → Fact check → Dietitian review → Approved → Published. It needs an
   approved `editorialReview`.
4. The page `/<slug>` appears on the next build. With no approved products it renders but is
   **noindex** and left out of the sitemap.

## How products are assigned

- Research imports and editors create `productGoal` **candidates** (for example from the brand's own
  product type, tags or title: basis `BRAND_MARKETING`, with the verbatim statement and locator).
- Reviewers decide at **/internal/goals**: Approve, Reject (with a reason) or Change goal (which
  re-assigns and records `EDITORIAL_CLASSIFICATION`). Every decision records the reviewer's name
  and the time.
- Nothing is approved automatically. Containing magnesium does not make a product a sleep product.
- An approved relationship to an **unpublished** product shows nothing. The product's own publish
  gate still applies.

## The goal page

- Built at build time from the published graph (`src/pages/[goal].astro`,
  `src/lib/goals/goals.ts`), with no per-card CMS queries: one pass over the graph. Filters and
  sorting run client-side over data attributes, so without JS every product is listed.
- **Cards** show only verified or observed facts:
  - serving, and goal-ingredient amounts, with compound and elemental on separate lines
  - "Elemental … Not disclosed" for minerals when the label gives only a compound weight (the rule
    is data-driven: only for ingredients some label declares elementally)
  - a dated price, label verification, checked claims, open discrepancies
  - "Why this appears", which lists the ingredients on the label plus the approved, sourced basis
- **Filters:** ingredient chip, vegetarian, label verified, claims checked, max ₹/serving.
- **Sorting:** default is brand A–Z; price per serving only when the user chooses it. There is no
  score, rank, "best" or "recommended".
- **Compare** links appear only between products on the page that share a goal ingredient, and use
  the existing `/compare/<a>-vs-<b>`. Products that can't be fairly compared are not paired.

## Search

`/search?q=sleep` (an exact published goal name or slug) opens `/sleep`. Everything else,
`magnesium` included, keeps the existing search and ingredient comparison. Goals also appear as
search results.

## SEO

Title "Supplements marketed for X support: compare labels". Canonical is `/<slug>`. The page is
indexable only with published products, and only published, reviewed, non-empty goals go in the
sitemap. There are no generated "best-X-under-Y" or audience pages.
