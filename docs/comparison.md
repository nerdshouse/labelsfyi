# Comparison methodology

labels.fyi helps people answer _what exactly is this product, what does the label declare, how
does it compare, what does it cost per serving, what is missing, and where can I buy it_. The
consumer decides. **There is no quality score, rank, "best" or "worst".**

## Surfaces

| Page                        | What                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/supplements/<ingredient>` | Every published product containing the ingredient, with filters and sorts                               |
| `/<goal>`                   | Products marketed for a goal (docs/goals.md)                                                            |
| `/compare/<a>-vs-<b>`       | Two labels side by side: what differs                                                                   |
| `/products/<slug>`          | The decision page: at a glance, dimensions, what's inside, evidence, differences, where to buy, receipt |
| `/analyse`                  | A pasted product URL: what the page states (unverified), what is missing, the catalogue context         |

## Rules (tested)

- Missing stays "Not disclosed", never zero, never estimated.
- A compound weight always names its form ("1,000 mg magnesium bisglycinate"). An elemental
  amount always says "elemental" and is never calculated.
- **Two explicit amount dimensions, never mixed.** Cards show them as labelled rows:
  - **Elemental amount**: only a figure the label states as elemental.
  - **Compound amount**: the weight of the named form, or "Amount" for ingredients without a
    compound/elemental split.
    Each has its own filter and sort. A compound weight is never compared with an elemental amount.
- **Compound amounts are compared only within one form.** If the products on a listing use
  different forms (oxide, citrate, bisglycinate), the compound sort and filter are withheld, and
  the page says why: equal compound weights do not mean equal amounts of the mineral.
- **Missing values always sort last**, whatever the sort direction. A stated 0 is a value.
- Two-label comparisons never compare amounts of different ingredients.
- Prices are dated observations.

## Filters (data-driven)

A filter appears only if it splits the products on the page: form (two or more forms), elemental
range (two or more stated elemental amounts), compound range (two or more compound amounts of
the same form), brand (two or more brands), vegetarian, label verified,
claims checked, "no other actives", max ₹/serving (when prices exist).

## Sorts (transparent)

- **Match**, explained below
- **Name (A–Z)**
- **Elemental amount (highest first)**: only when two or more products state one
- **Compound amount (highest first)**: only when two or more products state one, all in the
  same form
- **Price / serving (lowest first)**: only when a price was observed
- **Label verified first**
- **Claims checked first**
- **Newest verified**

Each is a single criterion; ties sort A–Z. Regression tests: `src/lib/catalogue/consumer.test.ts`.

## "Match" (explained, not scored)

Every card lists its factors: contains the ingredient ✓, amount disclosed ✓/⚠, label verified
✓/⚠, price observed ✓/⚠, veg status, and "also contains …".

| Level               | When                                                           |
| ------------------- | -------------------------------------------------------------- |
| Strong match        | Amount disclosed **and** label verified **and** price observed |
| Good match          | Amount disclosed, something else missing                       |
| Limited information | No amount disclosed for this ingredient                        |

## "Quality", decomposed

The product page shows each dimension with its own value and no total:

- ingredient disclosure (full / partial / blend)
- label verification
- evidence review (claims checked)
- serving clarity
- price transparency (observed date; flagged when older than 30 days)
- open discrepancies
- vegetarian status
- source freshness (label capture date)
