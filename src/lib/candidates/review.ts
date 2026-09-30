/**
 * Internal review of ingestion candidates (research/feed imports and the URL
 * analyser), at /internal/candidates. Pure planning over a DocStore so every
 * rule is unit-tested; the routes only load, plan, commit and redirect.
 *
 * A candidate is DISCOVERY data: its facts are an unverified retailer or web
 * listing, never label evidence. Nothing here verifies a fact, approves,
 * publishes or creates an editorial review. Studio stays authoritative for
 * label photos, panels, observations, fact checking, review and publishing.
 *
 * State transitions (existing fields; `rejectionReason` is the only new one):
 *
 *   needs_verification ──mark in review──▶ in_review
 *   needs_verification │ in_review ──reject(reason)──▶ rejected
 *        (+ matchStatus not_a_product when the reason is not_a_product)
 *   needs_verification │ in_review ──create draft──▶ in_review
 *        + matchStatus new_product + resolvedProduct → new DRAFT product
 *   needs_verification │ in_review ──link existing──▶ in_review
 *        + matchStatus confirmed + resolvedProduct → existing product
 *
 * Every transition records reviewedBy (the authenticated actor) and
 * reviewedAt. `accepted` stays reserved for Studio once every fact has been
 * verified against the label (schema validation enforces it). Repeating an
 * action that already took effect is a no-op; a conflicting action (e.g.
 * rejecting a linked candidate) is refused, never overwritten.
 */
import type { Doc, DocStore, WriteOp } from '@/lib/submissions/store';

// ─── Identity & loading ──────────────────────────────────────────────────

/** Published candidate IDs only (never drafts./versions.). */
export const CANDIDATE_ID = /^candidate\.[A-Za-z0-9_-][A-Za-z0-9._-]{0,120}$/;
const PRODUCT_ID = /^product\.[A-Za-z0-9_-][A-Za-z0-9._-]{0,120}$/;
const DOC_ID = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

export const REJECTION_REASONS = ['not_a_product', 'out_of_scope', 'duplicate'] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export type Fact = {
  _key?: string;
  field: string;
  label?: string;
  value: string;
  method?: string;
  sourceLocator?: string;
  confidence?: number;
  verificationStatus?: string;
};
export type Candidate = Doc & {
  title?: string;
  status?: string;
  matchStatus?: string;
  resolvedProduct?: { _ref?: string };
  submission?: unknown;
  facts?: Fact[];
  notes?: string;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  sourceUrl?: string;
  extractedAt?: string;
  extractor?: string;
  dataSource?: { _ref?: string };
  snapshot?: { _ref?: string };
};

/**
 * A candidate that may be reviewed here: a published ingestionCandidate that
 * is not part of a public label submission (those have their own pipeline at
 * /internal/review). Anything else is "not found".
 */
export function isReviewableCandidate(doc: Doc | null | undefined): doc is Candidate {
  return (
    !!doc &&
    doc._type === 'ingestionCandidate' &&
    CANDIDATE_ID.test(doc._id) &&
    doc.submission === undefined
  );
}

export async function loadCandidate(store: DocStore, id: string): Promise<Candidate | null> {
  if (!CANDIDATE_ID.test(id)) return null;
  const doc = await store.get<Doc>(id);
  return isReviewableCandidate(doc) ? doc : null;
}

// ─── Listing summaries (list page) ───────────────────────────────────────

/** "(listing statement; basis not stated)": an amount with no stated basis. */
export const isBasisNotStated = (f: Fact) =>
  f.field === 'other' && /basis not stated/i.test(f.label ?? '');
export const isDuplicateFlagged = (c: { notes?: string | null }) =>
  /possible duplicate/i.test(c.notes ?? '');

function rupees(value: string): number | null {
  const m = /^₹\s?([\d,]+(?:\.\d+)?)$/.exec(value.trim());
  return m ? Number(m[1]!.replace(/,/g, '')) : null;
}
const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { maximumFractionDigits: n % 1 ? 2 : 0 })}`;

/** "₹1,999" or "₹1,999–₹3,499" from price/MRP facts as listed; null when none. */
export function priceRange(facts: Fact[], field: 'price' | 'mrp'): string | null {
  const values = facts
    .filter((f) => f.field === field)
    .map((f) => rupees(f.value))
    .filter((n): n is number => n !== null);
  if (!values.length) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? inr(lo) : `${inr(lo)}–${inr(hi)}`;
}

export type CandidateRow = {
  _id: string;
  title: string;
  brand: string | null;
  source: string | null;
  sourceUrl: string | null;
  status: string;
  matchStatus: string;
  rejectionReason: string | null;
  resolvedProduct: string | null;
  fetchedAt: string | null;
  price: string | null;
  mrp: string | null;
  ingredientAmounts: number;
  basisNotStated: number;
  duplicate: boolean;
  notes: string | null;
};

export const LIST_QUERY = `*[_type == "ingestionCandidate" && !defined(submission) && !(_id in path("drafts.**"))]
  | order(extractedAt desc)[0...1000] {
    _id, title, sourceUrl, status, matchStatus, rejectionReason, notes, extractedAt,
    "resolvedProduct": resolvedProduct._ref,
    "source": dataSource->name,
    "fetchedAt": snapshot->fetchedAt,
    "facts": coalesce(facts[]{ field, label, value }, [])
  }`;

type ListRaw = {
  _id: string;
  title?: string | null;
  sourceUrl?: string | null;
  status?: string | null;
  matchStatus?: string | null;
  rejectionReason?: string | null;
  notes?: string | null;
  extractedAt?: string | null;
  resolvedProduct?: string | null;
  source?: string | null;
  fetchedAt?: string | null;
  facts?: Fact[] | null;
};

export function summarise(raw: ListRaw): CandidateRow {
  const facts = raw.facts ?? [];
  return {
    _id: raw._id,
    title: raw.title ?? '(untitled)',
    brand: facts.find((f) => f.field === 'brand')?.value ?? null,
    source: raw.source ?? null,
    sourceUrl: raw.sourceUrl ?? null,
    status: raw.status ?? 'needs_verification',
    matchStatus: raw.matchStatus ?? 'unmatched',
    rejectionReason: raw.rejectionReason ?? null,
    resolvedProduct: raw.resolvedProduct ?? null,
    fetchedAt: raw.fetchedAt ?? raw.extractedAt ?? null,
    price: priceRange(facts, 'price'),
    mrp: priceRange(facts, 'mrp'),
    ingredientAmounts: facts.filter((f) => f.field === 'ingredient_amount').length,
    basisNotStated: facts.filter(isBasisNotStated).length,
    duplicate: isDuplicateFlagged(raw),
    notes: raw.notes ?? null,
  };
}

export type ListFilters = {
  brand: string;
  status: string;
  amounts: boolean;
  basis: boolean;
  duplicate: boolean;
};

/** Filters from the query string. Unknown values are ignored (show all). */
export function parseFilters(params: URLSearchParams): ListFilters {
  const flag = (k: string) => params.get(k) === '1';
  const status = params.get('status') ?? '';
  return {
    brand: (params.get('brand') ?? '').slice(0, 120),
    status: ['needs_verification', 'in_review', 'accepted', 'rejected'].includes(status)
      ? status
      : '',
    amounts: flag('amounts'),
    basis: flag('basis'),
    duplicate: flag('duplicate'),
  };
}

export function filterRows(rows: CandidateRow[], f: ListFilters): CandidateRow[] {
  return rows.filter(
    (r) =>
      (!f.brand || r.brand === f.brand) &&
      (!f.status || r.status === f.status) &&
      (!f.amounts || r.ingredientAmounts > 0) &&
      (!f.basis || r.basisNotStated > 0) &&
      (!f.duplicate || r.duplicate),
  );
}

// ─── Actions ─────────────────────────────────────────────────────────────

export type CandidateAction =
  | { action: 'mark_in_review' }
  | { action: 'reject'; reason: string }
  | { action: 'create_draft'; categoryId?: string; brandId?: string }
  | { action: 'link_existing'; productId: string };

export type ActionContext = {
  /** Authenticated actor (Cloudflare Access email, else the review user). */
  actor: string;
  now: string;
  /** Existing documents the reviewer may pick. */
  productIds: string[];
  brandIds: string[];
  categoryIds: string[];
  /** Slugs already used by products (a new draft's slug must be unique). */
  productSlugs: string[];
  /** Whether the deterministic draft product for this candidate exists. */
  draftExists: boolean;
};

export type ActionPlan =
  | { ok: true; ops: WriteOp[]; message: string; productId?: string }
  | { ok: false; errors: string[] };

const ref = (id: string) => ({ _type: 'reference', _ref: id });
const done = (message: string, productId?: string): ActionPlan => ({
  ok: true,
  ops: [],
  message,
  ...(productId ? { productId } : {}),
});
const refuse = (...errors: string[]): ActionPlan => ({ ok: false, errors });

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/g, '');

/** The draft product created from a candidate: one per candidate, ever. */
export const draftProductId = (candidateId: string) =>
  `product.${candidateId.replace(/^candidate\./, 'candidate-')}`;
/** The source reference linking that draft back to the listing it came from. */
export const draftReferenceId = (candidateId: string) =>
  `productReference.${candidateId.replace(/^candidate\./, 'candidate-')}`;

function uniqueSlug(base: string, taken: Set<string>) {
  let slug = base || 'product';
  for (let n = 2; taken.has(slug); n++) slug = `${base || 'product'}-${n}`;
  return slug;
}

/**
 * Plan one reviewer action. Only ever writes: a patch to the candidate's
 * review fields; for "create draft", one DRAFT product (identity only) and one
 * productReference (source URL). Never touches facts, verification status,
 * workflow beyond DRAFT, editorial reviews or any existing product.
 */
export function planCandidateAction(
  c: Candidate,
  a: CandidateAction,
  ctx: ActionContext,
): ActionPlan {
  if (!ctx.actor.trim()) return refuse('No authenticated reviewer.');
  const status = c.status ?? 'needs_verification';
  const linked = c.resolvedProduct?._ref ?? null;
  const reviewed = { reviewedBy: ctx.actor.trim().slice(0, 200), reviewedAt: ctx.now };
  const patch = (set: Record<string, unknown>): WriteOp => ({
    patch: { id: c._id, set: { ...set, ...reviewed } },
  });
  const open = status === 'needs_verification' || status === 'in_review';

  switch (a.action) {
    case 'mark_in_review': {
      if (status === 'in_review') return done('Already in review.');
      if (!open) return refuse(`Cannot move a ${status} candidate to in review.`);
      return { ok: true, ops: [patch({ status: 'in_review' })], message: 'Marked in review.' };
    }

    case 'reject': {
      const reason = a.reason as RejectionReason;
      if (!REJECTION_REASONS.includes(reason)) return refuse('Choose a rejection reason.');
      if (status === 'rejected')
        return c.rejectionReason === reason
          ? done('Already rejected.')
          : refuse(`Already rejected (${c.rejectionReason ?? 'no reason'}).`);
      if (!open) return refuse(`Cannot reject a ${status} candidate.`);
      if (linked)
        return refuse(
          'This candidate is linked to a product. Unlink it in Studio before rejecting.',
        );
      return {
        ok: true,
        ops: [
          patch({
            status: 'rejected',
            rejectionReason: reason,
            ...(reason === 'not_a_product' ? { matchStatus: 'not_a_product' } : {}),
          }),
        ],
        message: 'Candidate rejected.',
      };
    }

    case 'create_draft': {
      const productId = draftProductId(c._id);
      if (linked)
        return linked === productId && c.matchStatus === 'new_product'
          ? done('Draft product already created.', productId)
          : refuse('This candidate is already linked to a product.');
      if (!open) return refuse(`Cannot create a product from a ${status} candidate.`);
      if (!DOC_ID.test(productId)) return refuse('Candidate ID is too long for a product ID.');
      const name = (c.title ?? '').trim();
      if (!name) return refuse('The candidate has no name.');
      const errors: string[] = [];
      if (a.brandId && !ctx.brandIds.includes(a.brandId)) errors.push('Unknown brand.');
      if (a.categoryId && !ctx.categoryIds.includes(a.categoryId)) errors.push('Unknown category.');
      if (errors.length) return refuse(...errors);
      const ops: WriteOp[] = [];
      // A previous attempt that created the product but was never linked
      // (commits are transactions, so this is defensive): link, don't duplicate.
      if (!ctx.draftExists) {
        ops.push({
          create: {
            _id: productId,
            _type: 'product',
            // IDENTITY ONLY. No amounts, serving, servings per container,
            // elemental figures, veg status, label facts, claims, GTIN or price:
            // those come from the physical label, verified in Studio.
            name,
            slug: {
              _type: 'slug',
              current: uniqueSlug(slugify(name), new Set(ctx.productSlugs)),
            },
            ...(a.brandId ? { brand: ref(a.brandId) } : {}),
            ...(a.categoryId ? { category: ref(a.categoryId) } : {}),
            workflowStatus: 'DRAFT',
            isDemo: false,
          },
        });
        if (c.sourceUrl && c.dataSource?._ref)
          ops.push({
            create: {
              _id: draftReferenceId(c._id),
              _type: 'productReference',
              product: ref(productId),
              dataSource: ref(c.dataSource._ref),
              url: c.sourceUrl,
              firstSeenAt: c.extractedAt ?? ctx.now,
              active: true,
              matchedBy: reviewed.reviewedBy,
              matchedAt: ctx.now,
              isDemo: false,
            },
          });
      }
      ops.push(
        patch({ status: 'in_review', matchStatus: 'new_product', resolvedProduct: ref(productId) }),
      );
      return { ok: true, ops, message: 'Draft product created (identity only).', productId };
    }

    case 'link_existing': {
      const productId = a.productId.trim();
      if (!PRODUCT_ID.test(productId) || !ctx.productIds.includes(productId))
        return refuse('Choose an existing product.');
      if (linked)
        return linked === productId
          ? done('Already linked to this product.', productId)
          : refuse('This candidate is already linked to another product.');
      if (!open) return refuse(`Cannot link a ${status} candidate.`);
      return {
        ok: true,
        ops: [
          patch({ status: 'in_review', matchStatus: 'confirmed', resolvedProduct: ref(productId) }),
        ],
        message: 'Linked to the existing product.',
        productId,
      };
    }
  }
}

/** Parse the posted form into an action (null = unknown). */
export function parseAction(fd: FormData): CandidateAction | null {
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === 'string' ? v.trim().slice(0, 200) : '';
  };
  switch (s('action')) {
    case 'mark_in_review':
      return { action: 'mark_in_review' };
    case 'reject':
      return { action: 'reject', reason: s('reason') };
    case 'create_draft':
      return {
        action: 'create_draft',
        ...(s('categoryId') ? { categoryId: s('categoryId') } : {}),
        ...(s('brandId') ? { brandId: s('brandId') } : {}),
      };
    case 'link_existing':
      return { action: 'link_existing', productId: s('productId') };
    default:
      return null;
  }
}

export const CONTEXT_QUERY = `{
  "productIds": *[_type == "product" && !(_id in path("drafts.**"))]._id,
  "productSlugs": *[_type == "product" && defined(slug.current)].slug.current,
  "brandIds": *[_type == "brand" && !(_id in path("drafts.**"))]._id,
  "categoryIds": *[_type == "category" && !(_id in path("drafts.**"))]._id,
  "draftExists": defined(*[_id == $draftId][0]._id)
}`;

/**
 * Load, plan and commit one action. Returns what the route redirects with.
 * `status` is an HTTP status for failures that are not a reviewer error.
 */
export async function runCandidateAction(
  store: DocStore,
  id: string,
  action: CandidateAction | null,
  actor: string | null,
  now = new Date().toISOString(),
): Promise<
  { status: 404 | 401 } | { ok: true; message: string } | { ok: false; errors: string[] }
> {
  if (!actor) return { status: 401 };
  const c = await loadCandidate(store, id);
  if (!c) return { status: 404 };
  if (!action) return { ok: false, errors: ['Unknown action.'] };
  const ctx = await store.query<Omit<ActionContext, 'actor' | 'now'>>(CONTEXT_QUERY, {
    draftId: draftProductId(c._id),
  });
  const plan = planCandidateAction(c, action, { ...ctx, actor, now });
  if (!plan.ok) return plan;
  if (plan.ops.length) await store.commit(plan.ops);
  return { ok: true, message: plan.message };
}

// ─── Detail ──────────────────────────────────────────────────────────────

export const DETAIL_QUERY = `{
  "dataSource": *[_id == $dataSourceId][0]{ _id, name, domain, sourceType, accessMode, active, notes },
  "snapshot": *[_id == $snapshotId][0]{ _id, url, fetchedAt, httpStatus, capturedBy, contentHash, notes },
  "product": *[_id == $productId][0]{ _id, name, workflowStatus },
  "brands": *[_type == "brand" && !(_id in path("drafts.**"))] | order(name asc){ _id, name, workflowStatus },
  "categories": *[_type == "category" && !(_id in path("drafts.**"))] | order(name asc){ _id, name },
  "products": *[_type == "product" && !(_id in path("drafts.**"))] | order(name asc)[0...500]{ _id, name, workflowStatus }
}`;

/** Sanity Studio "edit document" intent URL. */
export function studioUrl(base: string, id: string, type: string): string {
  return `${base.replace(/\/+$/, '')}/intent/edit/id=${encodeURIComponent(id)};type=${encodeURIComponent(type)}/`;
}
