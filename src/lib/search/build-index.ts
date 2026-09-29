import type { ContentGraph } from '@/lib/content/repository';
import type { SearchDocument } from '@/lib/content/types';
import { FORMAT_LABEL } from '@/lib/editorial/meta';
import { routes } from '@/lib/seo/site';

/**
 * Build the search index from the content graph at build time.
 * Output is served as /search-index.json and consumed by the client engine.
 */
export function buildSearchIndex(graph: ContentGraph): SearchDocument[] {
  const docs: SearchDocument[] = [];

  // Published goals (discovery categories, not medical conditions).
  for (const g of graph.goals) {
    docs.push({
      id: g._id,
      type: 'goal',
      title: g.name,
      subtitle: `Goal · ${g.memberships.length} product${g.memberships.length === 1 ? '' : 's'} marketed for ${g.name.toLowerCase()} support`,
      url: `/${g.slug}`,
      keywords: [g.name, g.slug.replace(/-/g, ' '), g.name.replace(/&/g, ' ').replace(/\s+/g, ' ')],
    });
  }
  for (const p of graph.products) {
    docs.push({
      id: p._id,
      type: 'product',
      title: p.name,
      subtitle: [p.brand.name, FORMAT_LABEL[p.format] ?? p.format, p.category?.name]
        .filter(Boolean)
        .join(' · '),
      url: routes.product(p.slug),
      keywords: [
        p.brand.name,
        p.category?.name ?? '',
        p.subcategory ?? '',
        ...p.aliases,
        ...p.ingredients.map((i) => i.name),
        ...p.keyActives.map((a) => a.displayName),
      ].filter(Boolean),
      vegStatus: p.vegStatus,
    });
  }
  for (const i of graph.ingredients) {
    docs.push({
      id: i._id,
      type: 'ingredient',
      title: i.name,
      subtitle: `Ingredient · ${i.products.length} product${i.products.length === 1 ? '' : 's'}`,
      url: routes.ingredient(i.slug),
      keywords: [...i.commonLabelNames, ...i.forms.map((f) => f.name)],
    });
  }
  for (const b of graph.brands) {
    docs.push({
      id: b._id,
      type: 'brand',
      title: b.name,
      subtitle: `Brand · ${b.products.length} product${b.products.length === 1 ? '' : 's'}`,
      url: routes.brand(b.slug),
      keywords: b.products.map((p) => p.name),
    });
  }
  for (const c of graph.comparisons) {
    docs.push({
      id: c._id,
      type: 'comparison',
      title: c.title,
      subtitle: `Comparison · ${c.productCount} products`,
      url: routes.comparison(c.slug),
      keywords: [c.category?.name ?? '', c.doseBasis?.ingredient?.name ?? ''].filter(Boolean),
    });
  }
  for (const g of graph.guides) {
    docs.push({
      id: g._id,
      type: 'guide',
      title: g.title,
      subtitle: 'Guide',
      url: routes.guide(g.slug),
      keywords: [g.dek ?? '', ...g.ingredients.map((i) => i.name)],
    });
  }
  return docs;
}
