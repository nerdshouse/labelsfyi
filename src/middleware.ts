import { defineMiddleware } from 'astro:middleware';
import {
  checkInternalAccess,
  isInternalRequest,
  PRIVATE_HEADERS,
} from '@/lib/server/internal-auth';
import { verifyAccessJwt } from '@/lib/server/access-jwt';

/**
 * Protects /internal/* (see lib/server/internal-auth.ts). Prerendered public
 * pages are served as static assets and never reach this branch.
 *
 * Layer 1: Cloudflare Access. When ACCESS_TEAM_DOMAIN/ACCESS_AUD are set, the
 * Access JWT is verified here too. In production they are REQUIRED: without
 * them /internal answers 503 rather than relying on Basic auth alone.
 * Layer 2: HTTP Basic auth against Worker secrets (+ same-origin POSTs).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (!isInternalRequest(context.url.pathname, context.routePattern)) return next();
  const { serverEnv } = await import('@/lib/server/env');
  const env = await serverEnv();

  const accessConfigured = Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
  if (env.DEPLOY_ENV === 'production' && !accessConfigured)
    return new Response('Internal review is not configured (Cloudflare Access).', {
      status: 503,
      headers: PRIVATE_HEADERS,
    });
  if (accessConfigured) {
    const access = await verifyAccessJwt(context.request.headers.get('cf-access-jwt-assertion'), {
      teamDomain: env.ACCESS_TEAM_DOMAIN!,
      aud: env.ACCESS_AUD!,
    });
    if (!access.ok) return new Response('Forbidden.', { status: 403, headers: PRIVATE_HEADERS });
  }

  const denied = checkInternalAccess(context.request, context.url, env);
  if (denied) return denied;
  const res = await next();
  // Rebuild: redirects (Response.redirect) have immutable headers.
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(PRIVATE_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
});
