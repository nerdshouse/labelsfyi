import type { APIRoute } from 'astro';
import { contentSource, isProductionDeploy, isProductionRehearsal } from '@/lib/content/client';
import { getContentGraph } from '@/lib/content/repository';

/**
 * What this build is. Read by scripts/deploy-guard.ts, which refuses to
 * deploy anything but a real production build (not demo, not a rehearsal).
 * Public and harmless: no secrets, no private data.
 */
export const GET: APIRoute = async () => {
  const graph = await getContentGraph();
  return new Response(
    JSON.stringify({
      deployEnv: isProductionDeploy ? 'production' : 'development',
      contentSource,
      rehearsal: isProductionRehearsal,
      builtAt: new Date().toISOString(),
      counts: {
        products: graph.products.length,
        goals: graph.goals.length,
        ingredients: graph.ingredients.length,
      },
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
};
