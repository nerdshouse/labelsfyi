import type { APIRoute } from 'astro';
import { serverEnv } from '@/lib/server/env';
import { isValidObjectKey } from '@/lib/submissions/keys';

export const prerender = false;

/** Streams a private submission image to an authenticated reviewer (middleware). */
export const GET: APIRoute = async ({ params }) => {
  const key = params.key ?? '';
  if (!isValidObjectKey(key)) return new Response('Not found', { status: 404 });
  const env = await serverEnv();
  const obj = await env.SUBMISSIONS?.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const type = obj.httpMetadata?.contentType ?? '';
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cache-Control': 'private, no-store',
    },
  });
};
