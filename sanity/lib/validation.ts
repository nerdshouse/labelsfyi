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

/**
 * A label panel transcribed from an image must point at a snapshot image that
 * a person has confirmed depicts this exact product, and that is a pack photo
 * or print artwork. Marketing graphics, re-typeset tables and another
 * product's image are never label evidence. (The site enforces the same rule.)
 */
/**
 * Products past Draft need label evidence: public label photos, or a current
 * panel transcribed from a submitted pack photo that a reviewer confirmed
 * (those photos stay private, so they are not copied into labelImages).
 */
export async function requireLabelEvidence(value: unknown, ctx: ValidationContext) {
  const doc = ctx.document as
    { _id?: string; workflowStatus?: string; isDemo?: boolean } | undefined;
  if (doc?.isDemo || !doc?.workflowStatus || doc.workflowStatus === 'DRAFT') return true;
  if (Array.isArray(value) && value.length) return true;
  const id = (doc._id ?? '').replace(/^drafts\./, '');
  const confirmed = await ctx.getClient({ apiVersion: API_VERSION }).fetch<number>(
    `count(*[_type == "labelPanel" && product._ref == $id && status == "current" && defined(sourceImage.submission)
      && sourceImage.submission->images[_key == ^.sourceImage.imageKey][0].depictsExactProduct == "CONFIRMED"
      && sourceImage.submission->images[_key == ^.sourceImage.imageKey][0].imageKind == "PACK_PHOTO"])`,
    { id },
  );
  return confirmed > 0 ? true : 'Add label photos before moving past Draft.';
}

export async function validatePanelImage(value: unknown, ctx: ValidationContext) {
  const v = value as
    { snapshot?: { _ref?: string }; submission?: { _ref?: string }; imageKey?: string } | undefined;
  const doc = ctx.document as { sourceType?: string } | undefined;
  const parent = v?.snapshot?._ref ?? v?.submission?._ref;
  if (!parent || !v?.imageKey) {
    return doc?.sourceType === 'PRODUCT_ARTWORK'
      ? 'Artwork-based panels must reference the classified snapshot image they were transcribed from.'
      : true;
  }
  if (v.snapshot?._ref && v.submission?._ref)
    return 'Reference either a snapshot or a submission image, not both.';
  const img = await ctx
    .getClient({ apiVersion: API_VERSION })
    .fetch<{ imageKind?: string; depictsExactProduct?: string } | null>(
      '*[_id == $id][0].images[_key == $key][0]{ imageKind, depictsExactProduct }',
      { id: parent, key: v.imageKey },
    );
  if (!img) return 'Image key not found on that snapshot or submission.';
  if (img.depictsExactProduct !== 'CONFIRMED')
    return 'Confirm that this image depicts this exact product first (filenames and gallery positions are not proof).';
  if (!['PACK_PHOTO', 'PRINT_ARTWORK'].includes(img.imageKind ?? ''))
    return 'Only pack photos or print artwork can support label facts.';
  return true;
}
