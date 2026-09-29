import type { APIRoute } from 'astro';
import { labelFacts } from '@/lib/comparison/label-facts';
import { getContentGraph } from '@/lib/content/repository';
import type { ProductDetail } from '@/lib/content/types';

/**
 * Per-product label facts for Compare Two Labels, built from the published
 * graph. Only published products get a file, so the on-demand compare route
 * (which reads these through the ASSETS binding) can never show anything
 * unpublished. Disallowed in robots.txt; not a page.
 */
export async function getStaticPaths() {
  const graph = await getContentGraph();
  return graph.products.map((product) => ({ params: { slug: product.slug }, props: { product } }));
}

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(labelFacts((props as { product: ProductDetail }).product)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
