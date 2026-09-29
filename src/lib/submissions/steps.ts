/**
 * One function per review step, from loaded review data + submitted form to a
 * write plan. The internal routes call these; the tests call exactly the same
 * functions against an in-memory store.
 */
import { parseDecision, parseFactReview } from './forms';
import type { ReviewData } from './load';
import {
  planEnterWorkflow,
  planFactReview,
  planMatchDecision,
  planRelease,
  readiness,
  type Plan,
  type ReadinessContext,
} from './review';
import type { DocStore } from './store';

const readinessContext = (d: ReviewData): ReadinessContext => ({
  submission: d.submission,
  candidate: d.candidate,
  product: d.product,
  packObservations: d.packObservations,
  currentPanels: d.currentPanels,
});

export function decideStep(d: ReviewData, fd: FormData, now?: string): Plan {
  if (!d.candidate) return { ok: false, errors: ['This submission has no ingestion candidate.'] };
  const { decision, gtin, reviewer } = parseDecision(fd);
  return planMatchDecision(
    {
      submission: d.submission,
      candidate: d.candidate,
      existingProductIds: d.products.map((p) => p._id),
      existingBrandIds: d.brands.map((b) => b._id),
      categoryIds: d.categories.map((c) => c._id),
      takenIds: d.takenIds,
    },
    decision,
    gtin,
    reviewer,
    now,
  );
}

export function factsStep(d: ReviewData, fd: FormData, now?: string): Plan {
  if (!d.candidate || !d.product)
    return { ok: false, errors: ['Confirm the product match first.'] };
  if (d.submission.status !== 'IN_REVIEW')
    return { ok: false, errors: [`Submission is ${d.submission.status.toLowerCase()}.`] };
  return planFactReview(
    {
      submission: d.submission,
      candidate: d.candidate,
      product: d.product,
      currentPanelIds: d.currentPanels.map((p) => String(p._id)),
      priorObservationIds: d.packObservations
        .filter((o) => !o.supersededAt)
        .map((o) => String(o._id)),
      ingredientIds: d.ingredients.map((i) => i._id),
      takenIds: d.takenIds,
    },
    parseFactReview(
      fd,
      d.submission.images.map((i) => i._key),
    ),
    now,
  );
}

export function workflowStep(d: ReviewData, now?: string): Plan {
  if (d.submission.status !== 'IN_REVIEW')
    return { ok: false, errors: [`Submission is ${d.submission.status.toLowerCase()}.`] };
  return planEnterWorkflow(readinessContext(d), d.brand, now);
}

/** Mark a verified submission as live, once Studio review has approved it. */
export function releaseStep(d: ReviewData, now?: string): Plan {
  return planRelease({ ...readinessContext(d), reviews: d.reviews }, now);
}

/**
 * LOCAL DEVELOPMENT ONLY. Simulates what an editor does in Sanity Studio
 * (approved review, then publish) and then the release step, so the local
 * end-to-end flow can be checked. Refuses on the Sanity store. Uses the
 * existing, clearly-flagged placeholder reviewer; never a real person.
 */
export function simulatePublishStep(d: ReviewData, store: DocStore, now = new Date()): Plan {
  if (store.kind !== 'local-r2')
    return { ok: false, errors: ['Only available with the local development store.'] };
  const failing = readiness(readinessContext(d)).filter((c) => !c.ok);
  const status = String(d.product?.workflowStatus);
  if (
    failing.length ||
    d.submission.status !== 'VERIFIED' ||
    !['FACT_CHECK', 'PUBLISHED', 'NEEDS_REVIEW'].includes(status)
  )
    return {
      ok: false,
      errors: ['Send to editorial review first; all readiness checks must pass.'],
    };
  const iso = now.toISOString();
  const next = new Date(now);
  next.setFullYear(next.getFullYear() + 1);
  const productId = String(d.product!._id);
  const review = {
    _id: `review.${d.submission._id}.${now.getTime().toString(36)}`,
    _type: 'editorialReview',
    content: { _type: 'reference', _ref: productId, _weak: true },
    reviewer: { _type: 'reference', _ref: 'reviewer.demo' },
    reviewedAt: iso,
    nextReviewAt: next.toISOString(),
    status: 'approved',
    scope: 'dietitian_review',
    notes: 'LOCAL DEVELOPMENT SIMULATION. Not a real review.',
  };
  const publish =
    status === 'FACT_CHECK'
      ? [
          { patch: { id: productId, set: { workflowStatus: 'PUBLISHED', firstPublishedAt: iso } } },
          ...(d.brand && d.brand.workflowStatus !== 'PUBLISHED'
            ? [{ patch: { id: String(d.brand._id), set: { workflowStatus: 'PUBLISHED' } } }]
            : []),
        ]
      : [];
  // Then the ordinary release step, as if run after the Studio publish.
  const release = planRelease(
    {
      ...readinessContext(d),
      product: { ...d.product!, workflowStatus: 'PUBLISHED' },
      reviews: [...d.reviews, review],
    },
    iso,
  );
  if (!release.ok) return release;
  return { ok: true, ops: [{ create: review }, ...publish, ...release.ops] };
}
