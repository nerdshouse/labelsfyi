import type { APIRoute } from 'astro';
import { buildCatalogueIndex } from '@/lib/analyse/catalogue';
import { getContentGraph } from '@/lib/content/repository';

/** Published catalogue identity index for the URL analyser (read via ASSETS). */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(buildCatalogueIndex(await getContentGraph())), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
