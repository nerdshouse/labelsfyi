import type { APIRoute } from 'astro';
import { comparePath, SLUG } from '@/lib/comparison/compare-two';

export const prerender = false;

/**
 * No-JS product selection: GET /api/compare?a=<slug>&b=<slug> redirects to the
 * canonical comparison URL. Publication is checked by the comparison page
 * itself (it 404s for anything unpublished), so nothing is revealed here.
 */
export const GET: APIRoute = ({ url }) => {
  const a = url.searchParams.get('a') ?? '';
  const b = url.searchParams.get('b') ?? '';
  if (!SLUG.test(a) || !SLUG.test(b) || a === b || a.length > 200 || b.length > 200)
    return new Response('Choose two different products.', {
      status: 400,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  return new Response(null, {
    status: 303,
    headers: { Location: comparePath(a, b), 'Cache-Control': 'no-store' },
  });
};
