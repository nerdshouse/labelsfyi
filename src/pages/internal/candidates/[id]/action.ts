import type { APIRoute } from 'astro';
import { serverEnv } from '@/lib/server/env';
import { parseAction, runCandidateAction } from '@/lib/candidates/review';
import { getDocStore } from '@/lib/submissions/store-factory';

export const prerender = false;

/**
 * Reviewer actions on one ingestion candidate (lib/candidates/review.ts).
 * The /internal middleware has already required Cloudflare Access, Basic auth
 * and a same-origin POST; the actor it recorded is written as reviewedBy.
 */
export const POST: APIRoute = async ({ params, request, url, locals }) => {
  const id = params.id ?? '';
  const store = await getDocStore(await serverEnv());
  const result = await runCandidateAction(
    store,
    id,
    parseAction(await request.formData()),
    locals.internalActor ?? null,
  );
  if ('status' in result)
    return new Response(result.status === 401 ? 'Authentication required.' : 'Not found', {
      status: result.status,
    });
  const to = new URL(`/internal/candidates/${encodeURIComponent(id)}`, url);
  if (result.ok) to.searchParams.set('msg', result.message);
  else for (const e of result.errors) to.searchParams.append('error', e);
  return Response.redirect(to, 303);
};
