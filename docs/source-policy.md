# Source access policy

**Publicly visible does not mean permission to copy.** labels.fyi reads an external site
automatically only when its terms allow it or its owner has given permission, and never copies
creative assets.

## The register

`research/sources.json` is the single register. The research importer reads it, and at request
time the URL analyser reads it through `src/lib/sources/policy.ts`. Each source records:

- `hosts` (exact hostnames) and `productPath` (a regex a product page path must match)
- `accessMode`
- `sourceKind` (`BRAND_WEBSITE` / `MARKETPLACE`, used to label facts publicly)
- a short terms excerpt, robots notes, and the permission basis

| Access mode                                                  | Automated reading?      |
| ------------------------------------------------------------ | ----------------------- |
| `BRAND_PERMISSION`, `BRAND_SUPPLIED_FEED`, `AUTHORIZED_FEED` | Yes, product pages only |
| `MANUAL_RESEARCH`, `USER_SUBMITTED_LABEL`, `NOT_PERMITTED`   | No                      |
| Host not in the register                                     | No: **fail closed**     |

An automated mode is necessary but **not sufficient**. The source also needs
`permissionVerified: true` and a `permissionRecord` naming an AUTHORIZED `assetPermission` that
records the written permission (scope, grantedBy, evidence, verifiedBy, verifiedAt). Until then
both the analyser and the feed importer refuse it (`PERMISSION_UNVERIFIED`).

The analyser additionally obeys robots.txt at request time: a disallow means refusal, a 4xx
robots.txt means no rules, and a 5xx or unreachable robots.txt means refusal. It never uses
alternative endpoints, caches, search-engine copies or other indirect routes to reach a refused
source.

## Current decisions (reviewed 29 Sept 2026)

| Source                 | Mode               | Why                                                                                                            |
| ---------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| briyosupplements.com   | `BRAND_PERMISSION` | Operator-stated client brand. **Refused (`permissionVerified: false`) until the written permission is filed.** |
| mycf.in                | `NOT_PERMITTED`    | Terms prohibit crawling or scraping, and copying without permission                                            |
| wellbeingnutrition.com | `NOT_PERMITTED`    | Personal, non-commercial use only                                                                              |
| rasayanam.in           | `NOT_PERMITTED`    | Terms prohibit spidering, crawling or scraping, and copying                                                    |

Adding a source: record the terms excerpt and robots notes, set the mode, and add `hosts` and
`productPath`. A refused source still has two routes in: brand permission or a feed, and
user-submitted labels (`/submit`).

## What we store and what we never copy

| Stored (as unverified facts, with provenance)                               | Never copied or stored                                                       |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Brand, product title, variant, pack size, serving, servings per pack, form  | Product photography, packshots, label artwork, logos, banners, videos        |
| Ingredient names as printed, amounts, units; elemental **only** when stated | Brand descriptions, marketing prose, slogans, testimonials, reviews, ratings |
| Observed price, MRP, merchant, URL, GTIN where explicit                     | Screenshots of product pages                                                 |
| Explicit veg statements, manufacturer/licence where appropriate             | Anything behind login, paywall or technical access control                   |

Images are displayed only with an asset permission (docs/assets.md). The analyser records only
that an image existed ("Label image not collected").
