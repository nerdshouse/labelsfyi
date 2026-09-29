import { serverEnv } from '@/lib/server/env';
import { isSubmissionId } from './keys';
import { loadReview, type ReviewData } from './load';
import type { Plan } from './review';
import { getDocStore } from './store-factory';
import type { DocStore } from './store';

/** Shared plumbing for review POST handlers: load, plan, commit, redirect (PRG). */
export async function runReviewAction(
  id: string | undefined,
  url: URL,
  plan: (data: ReviewData, store: DocStore) => Plan | Promise<Plan>,
  successMessage: string,
): Promise<Response> {
  const back = (params: Array<[string, string]>) => {
    const target = new URL(`/internal/review/${id}`, url);
    for (const [k, v] of params) target.searchParams.append(k, v);
    return Response.redirect(target, 303);
  };
  if (!id || !isSubmissionId(id)) return new Response('Not found', { status: 404 });
  const store = await getDocStore(await serverEnv());
  const data = await loadReview(store, id);
  if (!data) return new Response('Not found', { status: 404 });
  const result = await plan(data, store);
  if (!result.ok) return back(result.errors.map((e) => ['error', e]));
  await store.commit(result.ops);
  return back([['msg', successMessage]]);
}
