# labels.fyi

**Decode the label. Know what's actually inside.**

India-first, evidence-based supplement label intelligence: what a label says, what the ingredients
are, how claims hold up against evidence, what a serving actually costs, and how products compare.

Built with Astro (static), TypeScript, Tailwind CSS 4, Sanity and Cloudflare.

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:4321
```

With no Sanity credentials, the site builds from a **fictional demo dataset** (`src/fixtures`). A
banner says so, and every page is `noindex`.

```bash
pnpm verify       # astro check + eslint + vitest + build
pnpm studio       # Sanity Studio (needs sanity/.env, see docs/deployment.md)
pnpm deploy:cf    # build + deploy to Cloudflare
```

## Layout

```
src/
  components/   ui · layout · product · ingredient · comparison · editorial · affiliate · search · seo · home
  layouts/      BaseLayout
  pages/        / · products · ingredients · brands · compare · guides · categories · reviewers · search · methodology
  lib/
    content/      GROQ queries, client (Sanity or groq-js demo), repository (content graph), types
    calculations/ pure price & unit maths (+ tests)
    editorial/    assessment vocabulary, review state, provenance/history
    seo/          site config, titles, JSON-LD
    search/       index builder + engine abstraction (+ tests)
    affiliates/   link rules & disclosure
    analytics/    GA4 event wrapper
    formatting/   money, dates, quantities
  fixtures/     fictional demo dataset (raw Sanity documents)
  styles/       design tokens (global.css)
sanity/         Studio workspace: schemas, desk structure, workflow publish gate
docs/           architecture · data-model · editorial-workflow · seo · design-system · deployment
```

## Principles

1. Data integrity, 2. editorial provenance, 3. UX, 4. performance, 5. SEO, 6. accessibility,
2. polish, 8. breadth.

No fabricated sources, reviewers, ratings or lab results. Missing data is shown as missing.
