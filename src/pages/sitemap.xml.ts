import type { APIRoute } from 'astro';
import { contentSource } from '@/lib/content/client';
import { getContentGraph } from '@/lib/content/repository';
import { isoDate } from '@/lib/formatting/dates';
import { absoluteUrl, routes } from '@/lib/seo/site';

/**
 * Sitemap of indexable pages only. Pages flagged noindex and demo documents
 * are excluded; a demo-data build (every page noindex) publishes an empty sitemap.
 */
export const GET: APIRoute = async () => {
  const full = await getContentGraph();
  const real = <T extends { isDemo: boolean }>(xs: T[]) => xs.filter((x) => !x.isDemo);
  const g = {
    ...full,
    products: real(full.products),
    ingredients: real(full.ingredients),
    comparisons: real(full.comparisons),
    guides: real(full.guides),
    brands: real(full.brands),
    categories: real(full.categories),
    reviewers: full.reviewers.filter((r) => !r.isDemo),
  };
  const entries: Array<{ path: string; lastmod?: string | undefined }> =
    contentSource === 'demo'
      ? []
      : [
          { path: '/' },
          { path: '/products' },
          { path: '/ingredients' },
          { path: '/compare' },
          { path: '/guides' },
          { path: '/brands' },
          { path: '/methodology' },
          ...g.products
            .filter((p) => !p.noindex)
            .map((p) => ({ path: routes.product(p.slug), lastmod: isoDate(p._updatedAt) })),
          ...g.ingredients
            .filter((i) => !i.noindex)
            .map((i) => ({ path: routes.ingredient(i.slug), lastmod: isoDate(i._updatedAt) })),
          ...g.comparisons
            .filter((c) => !c.noindex)
            .map((c) => ({ path: routes.comparison(c.slug), lastmod: isoDate(c._updatedAt) })),
          ...g.guides
            .filter((x) => !x.noindex)
            .map((x) => ({ path: routes.guide(x.slug), lastmod: isoDate(x._updatedAt) })),
          ...g.brands.filter((b) => !b.noindex).map((b) => ({ path: routes.brand(b.slug) })),
          ...g.categories
            .filter((c) => c.products.length)
            .map((c) => ({ path: routes.category(c.slug) })),
          ...g.reviewers
            .filter((r) => !r.isPlaceholder)
            .map((r) => ({ path: routes.reviewer(r.slug) })),
        ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url><loc>${absoluteUrl(e.path)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`,
  )
  .join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
