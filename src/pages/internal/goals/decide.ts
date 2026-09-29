import type { APIRoute } from 'astro';
import { serverEnv } from '@/lib/server/env';
import { planGoalDecision, type GoalDecision } from '@/lib/goals/review';
import type { Doc } from '@/lib/submissions/store';
import { getDocStore } from '@/lib/submissions/store-factory';

export const prerender = false;

const ID = /^productGoal\.[A-Za-z0-9._-]{1,200}$/;

export const POST: APIRoute = async ({ request, url }) => {
  const fd = await request.formData();
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === 'string' ? v.trim().slice(0, 500) : '';
  };
  const back = (key: 'msg' | 'error', text: string) => {
    const to = new URL('/internal/goals', url);
    to.searchParams.set(key, text);
    return Response.redirect(to, 303);
  };
  const id = s('id');
  if (!ID.test(id)) return back('error', 'Unknown relationship.');
  const action = s('action');
  const decision: GoalDecision | null =
    action === 'approve'
      ? { action: 'approve' }
      : action === 'reject'
        ? { action: 'reject', reason: s('reason') }
        : action === 'change'
          ? { action: 'change', goalId: s('goalId') }
          : null;
  if (!decision) return back('error', 'Unknown action.');
  const store = await getDocStore(await serverEnv());
  const [rel, goalIds] = await Promise.all([
    store.get<Doc>(id),
    store.query<string[]>('*[_type == "goal"]._id'),
  ]);
  const plan = planGoalDecision(rel, decision, { goalIds, reviewer: s('reviewer') });
  if (!plan.ok) return back('error', plan.errors.join(' '));
  await store.commit(plan.ops);
  return back('msg', action === 'reject' ? 'Relationship rejected.' : 'Relationship approved.');
};
