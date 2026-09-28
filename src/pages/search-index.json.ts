import type { APIRoute } from 'astro';
import { getContentGraph } from '@/lib/content/repository';
import { buildSearchIndex } from '@/lib/search/build-index';

export const GET: APIRoute = async () => {
  const index = buildSearchIndex(await getContentGraph());
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
