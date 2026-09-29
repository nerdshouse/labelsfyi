import type { Doc, WriteOp } from '@/lib/submissions/store';

/**
 * Editorial review of product ↔ goal relationships (/internal/goals).
 * Nothing is approved automatically: an ingredient match, a brand tag or a
 * machine suggestion only ever creates a CANDIDATE. A named reviewer decides.
 */

export const GOAL_REVIEW_QUERY = `{
  "rows": *[_type == "productGoal"] | order(status asc, _updatedAt desc) {
    _id, status, basis, statement, sourceUrl, sourceLocator, observedAt, reviewedBy, reviewedAt,
    "hasSource": defined(source) || defined(sourceUrl),
    "product": product->{ _id, name, "slug": slug.current, workflowStatus, "brand": brand->name },
    "goal": goal->{ _id, name, "slug": slug.current, workflowStatus }
  },
  "goals": *[_type == "goal"] | order(order asc, name asc) { _id, name, workflowStatus }
}`;

export type GoalDecision =
  | { action: 'approve' }
  | { action: 'reject'; reason: string }
  | { action: 'change'; goalId: string };

export type GoalPlan = { ok: true; ops: WriteOp[] } | { ok: false; errors: string[] };

export function planGoalDecision(
  rel: Doc | null,
  decision: GoalDecision,
  ctx: { goalIds: string[]; reviewer: string; now?: string },
): GoalPlan {
  const now = ctx.now ?? new Date().toISOString();
  const reviewer = ctx.reviewer.trim();
  const errors: string[] = [];
  if (!rel || rel._type !== 'productGoal')
    return { ok: false, errors: ['Relationship not found.'] };
  if (!reviewer) errors.push('Reviewer name is required.');
  const hasSource = Boolean(rel.source || rel.sourceUrl);

  if (decision.action === 'reject') {
    if (!decision.reason.trim()) errors.push('Give a reason for rejecting.');
    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      ops: [
        {
          patch: {
            id: rel._id,
            set: {
              status: 'REJECTED',
              reviewedBy: reviewer,
              reviewedAt: now,
              notes: decision.reason.trim().slice(0, 500),
            },
          },
        },
      ],
    };
  }

  if (rel.status !== 'CANDIDATE')
    errors.push('Only candidate relationships can be approved or re-assigned.');
  if (!hasSource) errors.push('A relationship needs a source before it can be approved.');
  if (decision.action === 'change') {
    if (!ctx.goalIds.includes(decision.goalId)) errors.push('Choose an existing goal.');
    if ((rel.goal as { _ref?: string } | undefined)?._ref === decision.goalId)
      errors.push('That is already the goal.');
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    ops: [
      {
        patch: {
          id: rel._id,
          set: {
            status: 'APPROVED',
            reviewedBy: reviewer,
            reviewedAt: now,
            ...(decision.action === 'change'
              ? {
                  goal: { _type: 'reference', _ref: decision.goalId },
                  // Re-assignment is an editorial call, whatever the original basis.
                  basis: 'EDITORIAL_CLASSIFICATION',
                }
              : {}),
          },
        },
      },
    ],
  };
}

/**
 * Turn a research candidate's goal suggestions into CANDIDATE relationships
 * once its product exists (never APPROVED: that needs a reviewer).
 */
export function goalCandidatesFromSuggestions(
  candidate: Doc,
  productId: string,
  goalIdBySlug: Record<string, string>,
): Doc[] {
  const suggestions =
    (candidate.goalSuggestions as Array<{
      goalSlug?: string;
      basis?: string;
      statement?: string;
      sourceLocator?: string;
    }>) ?? [];
  return suggestions
    .filter((s) => s.goalSlug && goalIdBySlug[s.goalSlug])
    .map((s) => ({
      _id: `productGoal.${productId.replace(/^product\./, '')}.${s.goalSlug}`,
      _type: 'productGoal',
      product: { _type: 'reference', _ref: productId },
      goal: { _type: 'reference', _ref: goalIdBySlug[s.goalSlug!]! },
      basis: s.basis ?? 'BRAND_MARKETING',
      statement: s.statement ?? null,
      sourceUrl: (candidate.sourceUrl as string | undefined) ?? null,
      sourceLocator: s.sourceLocator ?? null,
      observedAt: (candidate.extractedAt as string | undefined) ?? null,
      status: 'CANDIDATE',
      isDemo: false,
    }));
}
