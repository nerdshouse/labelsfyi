import type { ValidationContext } from 'sanity';

/**
 * Validation helpers that make the workflow enforceable, not just visual.
 * Sanity refuses to publish a document with validation *errors*, so these
 * rules block publication in the Studio regardless of the status radio.
 */

const API_VERSION = '2025-02-19';
const LATE_STATUSES = ['APPROVED', 'PUBLISHED', 'NEEDS_REVIEW'];

type Doc = { _id?: string; workflowStatus?: string; vegStatus?: string; isDemo?: boolean };

const publishedId = (id: string) => id.replace(/^drafts\./, '');

/**
 * Approved / Published / Needs review require an *approved* editorialReview
 * record that references this document. Setting the status radio alone is
 * not enough.
 */
export async function requireApprovedReview(doc: unknown, ctx: ValidationContext) {
  const d = doc as Doc | undefined;
  if (!d?._id || !LATE_STATUSES.includes(d.workflowStatus ?? '')) return true;
  const count = await ctx
    .getClient({ apiVersion: API_VERSION })
    .fetch<number>(
      'count(*[_type == "editorialReview" && content._ref == $id && status == "approved" && !(_id in path("drafts.**"))])',
      { id: publishedId(d._id) },
    );
  return count > 0
    ? true
    : 'Needs a published, approved Editorial review referencing this document before it can be Approved or Published.';
}

/**
 * A veg status other than Unknown must be backed by at least one veg-mark or
 * ingredient observation once the product leaves Draft. We never infer.
 */
export async function requireVegEvidence(doc: unknown, ctx: ValidationContext) {
  const d = doc as Doc | undefined;
  if (!d?._id || !d.workflowStatus || d.workflowStatus === 'DRAFT') return true;
  if (!d.vegStatus || d.vegStatus === 'UNKNOWN') return true;
  const count = await ctx
    .getClient({ apiVersion: API_VERSION })
    .fetch<number>(
      'count(*[_type == "observation" && product._ref == $id && type in ["veg_mark", "ingredient_presence"] && !defined(supersededAt)])',
      { id: publishedId(d._id) },
    );
  return count > 0
    ? true
    : 'Record a veg-mark or ingredient observation that supports this veg status (or set it to Unknown).';
}

const SENSATIONAL = /\b(toxic|dangerous|scam|fake|poison|cures?|treats?|guaranteed?|miracle)\b/i;

/** Warn (not block) on sensational or treatment language. */
export function languageWarning(value: unknown) {
  return typeof value === 'string' && SENSATIONAL.test(value)
    ? 'Contains sensational or treatment language. Prefer precise, evidence-based wording (see editorial workflow docs).'
    : true;
}

/**
 * Append-only records get a short correction window, after which their
 * factual fields are locked. Correct a locked record by creating a new one
 * and marking the old one superseded.
 */
export const LOCK_AFTER_HOURS = 24;
export function lockedAfterWindow({ document }: { document?: { _createdAt?: string } }) {
  if (!document?._createdAt) return false;
  return Date.now() - new Date(document._createdAt).getTime() > LOCK_AFTER_HOURS * 3_600_000;
}
