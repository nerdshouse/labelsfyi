import type { EditorialMeta, EditorialReviewData } from '@/lib/content/types';

export type ReviewState = 'current' | 'due' | 'none';

/** The build time is "now" for a static site; scheduled rebuilds keep it fresh. */
export const BUILD_TIME = new Date();

/**
 * The review shown as "Reviewed by": the latest approved dietitian review,
 * falling back to the latest approved review of any scope. Reviews arrive
 * newest first.
 */
export function latestReview(meta: Pick<EditorialMeta, 'reviews'>): EditorialReviewData | null {
  return meta.reviews.find((r) => r.scope === 'dietitian_review') ?? meta.reviews[0] ?? null;
}

export function reviewState(
  meta: Pick<EditorialMeta, 'reviews' | 'workflowStatus'>,
  now: Date = BUILD_TIME,
): ReviewState {
  const review = latestReview(meta);
  if (!review) return 'none';
  if (meta.workflowStatus === 'NEEDS_REVIEW') return 'due';
  if (review.nextReviewAt && new Date(review.nextReviewAt) < now) return 'due';
  return 'current';
}
