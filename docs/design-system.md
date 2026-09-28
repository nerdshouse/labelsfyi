# Design system

**Idea:** the interface borrows the typographic grammar of the thing it decodes, the printed
supplement label: heavy and hairline rules, tabular numerals, compact uppercase captions, warm paper,
black ink, and one highlighter colour. Trust comes from clarity and visible sourcing, not medical
blue.

All tokens live in `src/styles/global.css` (`@theme`). Don't introduce raw hex values or one-off sizes
in components.

## Tokens

| Group    | Tokens                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces | `paper` (page), `paper-2/3` (bands), `sheet` (panels, inputs)                                                                            |
| Ink      | `ink`, `ink-2` (body), `ink-3` (meta; ≥4.5:1 on paper)                                                                                   |
| Lines    | `line`, `line-2` (hairlines); rules are always `ink`                                                                                     |
| Accent   | `marker` / `marker-soft`: highlighter for the single most important fact, focus rings, notices                                           |
| Semantic | `veg`, `nonveg`, `unknown` (veg marks only), `alert` (errors only)                                                                       |
| Type     | `font-sans` Geist (UI/body), `font-serif` Newsreader (headings, editorial voice), `font-mono` Geist Mono (numbers, captions, label text) |
| Scale    | `2xs … xl`, fluid `2xl`, `3xl`, `display`                                                                                                |
| Rules    | `rule-heavy` (6px), `rule-medium` (3px), `rule` (1px ink), `hairline` (1px line)                                                         |
| Radii    | `xs` 2px, `sm` 3px, `md` 6px. The system is mostly square.                                                                               |

## Primitives

- `.caption`: mono uppercase kicker for section labels, table headers and metadata
- `.num`: tabular, slashed-zero numerals. Use on every number that may be compared.
- `.display`, `.h1`, `.h2`, `.h3`, `.lede`: the type hierarchy
- `.marker`: highlighter; at most one per view
- `.link`, `.btn`, `.btn-primary`, `.btn-quiet`, `.tag`
- `.notice` (attention) and `.notice-quiet` (information): ruled callouts, not rounded boxes
- `.section-head`: heavy rule, caption kicker, serif heading
- `.facts`: label-style table
- `.prose-lf`: Portable Text

## Components

| Component                                              | Role                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `VegMark`                                              | Indian-style square/circle/triangle mark; dashed "?" for unknown                                      |
| `AssessmentGlyph`                                      | Shape-coded, colour-independent claim status                                                          |
| `AtAGlance`                                            | The fast answer at the top of the product page, styled as a label panel                               |
| `LabelPanel`                                           | Nutrition/supplement facts table, ingredients in label order with blend brackets, as-printed text     |
| `ClaimCard`                                            | "On the label" (boxed, verbatim, packaging voice) → "What the evidence says" (serif, editorial voice) |
| `CostBreakdown`                                        | Stat row, visible formula, per-retailer observations                                                  |
| `ComparisonTable`                                      | Dense sortable table ≥768px; ranked list with a headline metric on mobile                             |
| `SourceList`                                           | Numbered, anchor-addressable citations                                                                |
| `ReviewLine` / `ReviewerBlock`                         | Provenance near the top and in full at the bottom                                                     |
| `UpdateHistory`                                        | Dated audit trail                                                                                     |
| `AffiliateLink` / `WhereToBuy` / `AffiliateDisclosure` | The only way retail links render                                                                      |
| `PackVisual`                                           | Real label photo, or an honest typographic stand-in ("No label photo captured yet")                   |
| `InPageNav`                                            | Sticky, swipeable section nav                                                                         |
| `EmptyState`                                           | Says what's missing and why                                                                           |

## Rules of thumb

- Prefer rows and rules to cards. There are no drop-shadowed card grids.
- Numbers are mono and tabular, and right-aligned in tables.
- Mobile first: tables become purpose-built mobile layouts, not horizontal scrollers.
- No emojis, gradients (other than the highlighter), stock photos or illustrations of things we
  haven't checked.
- Every unhappy state has a designed message: missing price, missing serving info, unknown veg,
  insufficient evidence, outdated review, no affiliate link, no results.

## Not yet done

- Dark mode: tokens are ready; add a `prefers-color-scheme` override block.
- Real label photography guidelines (lighting, flat panels, include the batch/date panel).
