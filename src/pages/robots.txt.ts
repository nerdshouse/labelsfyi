import type { APIRoute } from 'astro';
import { absoluteUrl } from '@/lib/seo/site';

export const GET: APIRoute = () =>
  new Response(
    `User-agent: *
Allow: /
Disallow: /search-index.json
Disallow: /comparison-index.json
Disallow: /partials/
Disallow: /compare-data/
Disallow: /catalogue-index.json
Disallow: /internal/
Disallow: /api/
Disallow: /submit/received
Disallow: /build-meta.json

Sitemap: ${absoluteUrl('/sitemap.xml')}
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
