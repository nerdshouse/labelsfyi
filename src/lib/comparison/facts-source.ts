import type { CatalogueIndex } from '@/lib/analyse/catalogue';
import type { LabelFacts } from './label-facts';
import { LABEL_FACTS_VERSION } from './label-facts';
import { SLUG } from './compare-two';

/**
 * Server-side (on-demand routes only): the published label facts for a slug,
 * or null when no published product has that slug.
 *
 * Production reads the build artifact /compare-data/<slug>.json through the
 * Worker's ASSETS binding: the same snapshot as every static page, and no CMS
 * access at request time. In dev the graph is built directly (dev assets do
 * not include prerendered output).
 */
export async function loadLabelFacts(slug: string, origin: URL): Promise<LabelFacts | null> {
  if (!SLUG.test(slug) || slug.length > 200) return null;
  if (import.meta.env.DEV) {
    const [{ getContentGraph }, { labelFacts }] = await Promise.all([
      import('@/lib/content/repository'),
      import('./label-facts'),
    ]);
    const p = (await getContentGraph()).products.find((x) => x.slug === slug);
    return p ? labelFacts(p) : null;
  }
  const { serverEnv } = await import('@/lib/server/env');
  const env = await serverEnv();
  if (!env.ASSETS) return null;
  const res = await env.ASSETS.fetch(new URL(`/compare-data/${slug}.json`, origin));
  if (!res.ok) return null;
  const facts = (await res.json().catch(() => null)) as LabelFacts | null;
  return facts?.v === LABEL_FACTS_VERSION && facts.slug === slug ? facts : null;
}

/** The published catalogue index (/catalogue-index.json), same rules as above. */
export async function loadCatalogueIndex(origin: URL): Promise<CatalogueIndex> {
  if (import.meta.env.DEV) {
    const [{ getContentGraph }, { buildCatalogueIndex }] = await Promise.all([
      import('@/lib/content/repository'),
      import('@/lib/analyse/catalogue'),
    ]);
    return buildCatalogueIndex(await getContentGraph());
  }
  const { serverEnv } = await import('@/lib/server/env');
  const env = await serverEnv();
  const empty = { v: 1 as const, products: [], ingredients: [] };
  if (!env.ASSETS) return empty;
  const res = await env.ASSETS.fetch(new URL('/catalogue-index.json', origin));
  if (!res.ok) return empty;
  return ((await res.json().catch(() => null)) as CatalogueIndex | null) ?? empty;
}
