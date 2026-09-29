import type { APIRoute } from 'astro';
import { compareIngredient, ingredientSearchTerms } from '@/lib/comparison';
import { getContentGraph } from '@/lib/content/repository';

/** Maps search terms to ingredient comparisons (served as static partials). */
export const GET: APIRoute = async () => {
  const graph = await getContentGraph();
  const index = graph.ingredients
    .map((i) => ({
      slug: i.slug,
      name: i.name,
      terms: ingredientSearchTerms(i),
      count: compareIngredient(graph, i._id).length,
    }))
    .filter((x) => x.count > 0);
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
