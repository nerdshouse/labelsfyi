import type { APIRoute } from 'astro';
import { absoluteUrl } from '@/lib/seo/site';

export const GET: APIRoute = () =>
  new Response(
    `User-agent: *
Allow: /
Disallow: /search-index.json

Sitemap: ${absoluteUrl('/sitemap.xml')}
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
