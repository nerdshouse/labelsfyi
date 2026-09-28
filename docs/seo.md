# SEO

## URLs

`/products/[slug]`, `/brands/[slug]`, `/ingredients/[slug]`, `/compare/[slug]`, `/guides/[slug]`,
`/categories/[slug]`, `/reviewers/[slug]`, `/search`, `/methodology`. No `/blog`, no trailing slashes
(`trailingSlash: 'never'`, `build.format: 'file'`, and Cloudflare `drop-trailing-slash`).

## Metadata (`src/components/seo/Seo.astro`, `src/lib/seo/site.ts`)

- Title template: `{title} · labels.fyi`; the homepage uses the tagline. Editors can override via
  `seo.title`.
- Descriptions are generated from data (per-serving facts for products) and trimmed to ~155 chars.
  Editors can override via `seo.description`.
- Canonical URL is always absolute, built from `PUBLIC_SITE_URL`.
- Open Graph and X/Twitter cards on every page. `og:image` is only set when a real label photo exists.
- `noindex` sources: a document's `noindex` flag, placeholder reviewer pages, empty categories,
  `/search`, 404, and **every page in a demo-data build**.

## Structured data (`src/lib/seo/jsonld.ts`)

| Page               | Types                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| All                | `Organization`, `BreadcrumbList` (when crumbs exist)                                                      |
| Home               | `WebSite` + `SearchAction`                                                                                |
| Product            | `Product` (name, brand, category, description, images, origin) + `WebPage` (`lastReviewed`, `reviewedBy`) |
| Ingredient         | `WebPage` with `citation`, `lastReviewed`, `reviewedBy`                                                   |
| Guide / Comparison | `Article`                                                                                                 |
| Brand              | `Brand`                                                                                                   |
| Reviewer           | `Person` (never for placeholders)                                                                         |

**Never emitted:** `Review`, `AggregateRating`, `Offer`, or medical condition/treatment types. Our
prices are dated observations, not offers, and we don't rate products.

## Sitemap & robots

- `/sitemap.xml` lists indexable pages only, with `lastmod` from `_updatedAt`.
- `/robots.txt` allows everything except `/search-index.json` and points to the sitemap.

## Internal linking

Every product links to its brand, category, ingredient pages, comparisons, peer products and guides.
Ingredients link back to every product containing them. Sources are numbered and anchor-linked. See
`docs/architecture.md → Internal linking graph`.

## Search Console / analytics

Set `PUBLIC_GSC_VERIFICATION` to emit the verification meta tag. Submit `https://labels.fyi/sitemap.xml`.
