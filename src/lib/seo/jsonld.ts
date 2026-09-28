import type {
  BrandDetail,
  ComparisonDetail,
  GuideDetail,
  IngredientDetail,
  ProductDetail,
  ReviewerDetail,
} from '@/lib/content/types';
import { latestReview } from '@/lib/editorial/review';
import { isoDate } from '@/lib/formatting/dates';
import { absoluteUrl, routes, SITE } from './site';

/**
 * JSON-LD builders. Rule: only describe what is visibly on the page and true.
 * No ratings, no aggregateRating, no reviews-as-stars, no Offer objects
 * (our prices are dated observations, not offers we make).
 */

type Json = Record<string, unknown>;

export interface Crumb {
  name: string;
  href: string;
}

const ORG_ID = `${SITE.url}/#organization`;

export function organization(): Json {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
  };
}

export function website(): Json {
  return {
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    name: SITE.name,
    url: SITE.url,
    inLanguage: SITE.language,
    publisher: { '@id': ORG_ID },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE.url}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbList(crumbs: Crumb[]): Json {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.href),
    })),
  };
}

function reviewedBy(meta: { reviews: ProductDetail['reviews'] }): Json | undefined {
  const r = latestReview(meta);
  // Never emit a placeholder reviewer as a real Person.
  if (!r || r.reviewer.isPlaceholder) return undefined;
  return {
    '@type': 'Person',
    name: r.reviewer.name,
    url: absoluteUrl(routes.reviewer(r.reviewer.slug)),
    ...(r.reviewer.credentials ? { hasCredential: r.reviewer.credentials } : {}),
  };
}

function lastReviewed(meta: { reviews: ProductDetail['reviews'] }): string | undefined {
  const r = latestReview(meta);
  // A placeholder reviewer's date is not a real review; don't assert one.
  return r && !r.reviewer.isPlaceholder ? isoDate(r.reviewedAt) : undefined;
}

/**
 * Product JSON-LD only when we have a current, captured label: the Product
 * node describes the product as documented on the page, nothing more.
 */
export function productPage(p: ProductDetail): Json[] {
  const url = absoluteUrl(routes.product(p.slug));
  const documented = p.panels.some((x) => x.isCurrent);
  return [
    ...(documented
      ? [
          {
            '@type': 'Product',
            '@id': `${url}#product`,
            name: `${p.brand.name} ${p.name}`,
            brand: {
              '@type': 'Brand',
              name: p.brand.name,
              url: absoluteUrl(routes.brand(p.brand.slug)),
            },
            category: p.category?.name,
            description: p.description ?? undefined,
            ...(p.labelImages.length ? { image: p.labelImages.map((i) => i.url) } : {}),
            countryOfOrigin: p.countryOfOrigin ?? undefined,
            url,
          },
        ]
      : []),
    {
      '@type': 'WebPage',
      '@id': url,
      url,
      name: `${p.brand.name} ${p.name}: label breakdown`,
      ...(documented ? { about: { '@id': `${url}#product` } } : {}),
      dateModified: isoDate(p._updatedAt),
      lastReviewed: lastReviewed(p),
      reviewedBy: reviewedBy(p),
      publisher: { '@id': ORG_ID },
    },
  ];
}

export function ingredientPage(i: IngredientDetail): Json[] {
  const url = absoluteUrl(routes.ingredient(i.slug));
  return [
    {
      '@type': 'WebPage',
      '@id': url,
      url,
      name: i.name,
      description: i.summary ?? undefined,
      dateModified: isoDate(i._updatedAt),
      lastReviewed: lastReviewed(i),
      reviewedBy: reviewedBy(i),
      publisher: { '@id': ORG_ID },
      citation: i.sources.map((s) => s.url ?? (s.doi ? `https://doi.org/${s.doi}` : s.title)),
    },
  ];
}

export function articlePage(doc: GuideDetail | ComparisonDetail, path: string): Json[] {
  const url = absoluteUrl(path);
  const review = latestReview(doc);
  return [
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: doc.title,
      description: doc.dek ?? undefined,
      url,
      mainEntityOfPage: url,
      datePublished: isoDate('publishedAt' in doc ? doc.publishedAt : doc._createdAt),
      dateModified: isoDate(doc._updatedAt),
      author: { '@id': ORG_ID },
      publisher: { '@id': ORG_ID },
      ...(review && !review.reviewer.isPlaceholder ? { reviewedBy: reviewedBy(doc) } : {}),
      inLanguage: SITE.language,
    },
  ];
}

export function brandPage(b: BrandDetail): Json[] {
  return [
    {
      '@type': 'Brand',
      name: b.name,
      url: absoluteUrl(routes.brand(b.slug)),
      description: b.description ?? undefined,
    },
  ];
}

export function personPage(r: ReviewerDetail): Json[] {
  if (r.isPlaceholder) return [];
  return [
    {
      '@type': 'Person',
      name: r.name,
      url: absoluteUrl(routes.reviewer(r.slug)),
      description: r.bio ?? undefined,
      hasCredential: r.credentials,
      affiliation: r.organization ? { '@type': 'Organization', name: r.organization } : undefined,
    },
  ];
}

/** Serialise a graph, dropping undefined values. Escapes "<" to prevent script breakout. */
export function serializeJsonLd(nodes: Json[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(
    /</g,
    '\\u003c',
  );
}
