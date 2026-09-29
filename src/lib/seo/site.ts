import { PUBLIC_SITE_URL } from 'astro:env/client';

export const SITE = {
  name: 'labels.fyi',
  url: (PUBLIC_SITE_URL ?? 'https://labels.fyi').replace(/\/$/, ''),
  tagline: 'Decode the label. Compare the formula. Check the claims.',
  description:
    'Evidence-based breakdowns of supplement labels, ingredients, claims and prices, built for Indian consumers.',
  locale: 'en_IN',
  language: 'en-IN',
  twitter: null as string | null,
} as const;

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE.url}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Title template: "Page — labels.fyi", capped for SERP display. */
export function pageTitle(title?: string | null): string {
  if (!title) return `${SITE.name}: Decode the label. Compare the formula. Check the claims.`;
  return `${title} · ${SITE.name}`;
}

/** Trim a description to ~155 chars on a word boundary. */
export function metaDescription(
  text: string | null | undefined,
  fallback: string = SITE.description,
): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim() || fallback;
  if (t.length <= 158) return t;
  return t.slice(0, 155).replace(/\s+\S*$/, '') + '…';
}

export const routes = {
  product: (slug: string) => `/products/${slug}`,
  brand: (slug: string) => `/brands/${slug}`,
  ingredient: (slug: string) => `/ingredients/${slug}`,
  comparison: (slug: string) => `/compare/${slug}`,
  guide: (slug: string) => `/guides/${slug}`,
  category: (slug: string) => `/categories/${slug}`,
  reviewer: (slug: string) => `/reviewers/${slug}`,
  search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : '/search'),
} as const;
