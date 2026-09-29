import { normalizeGtin } from '@/lib/identity/gtin';
import { findMatches, type IdentityRecord, type MatchResult } from '@/lib/identity/match';
import {
  formatServing,
  SERVING_UNITS,
  type ServingSpec,
  type ServingUnit,
} from '@/lib/identity/serving';
import type { Doc, DocStore, WriteOp } from './store';
import type { LabelSubmission, SubmissionImage } from './types';

/**
 * Review planners. Each takes the current documents plus a reviewer's input
 * and returns the writes to make (or errors). They never publish anything:
 * the furthest a submission can go here is entering the existing editorial
 * workflow (FACT_CHECK), where the Studio publish gates still apply.
 *
 * Data rules enforced here (and tested):
 *  - unknown stays null; "missing on the label" is recorded as its own
 *    observation; zero is a real, verified 0
 *  - compound and elemental amounts are separate inputs and separate fields;
 *    elemental is never derived from compound
 *  - an image supports label facts only after a person confirms it shows
 *    this exact product
 *  - submitter details never leave the submission document
 */

export type FactStatus = 'VERIFIED' | 'MISSING' | 'UNCLEAR';
export const SUBMISSIONS_DATA_SOURCE = 'dataSource.labels-fyi-submissions';
const ref = (id: string) => ({ _type: 'reference', _ref: id });
const key = () =>
  crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), 'k');
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export type Plan = { ok: true; ops: WriteOp[] } | { ok: false; errors: string[] };

// ─── Identity & matching ─────────────────────────────────────────────────

export const IDENTITY_QUERY = `{
  "products": *[_type == "product" && !(_id in path("drafts.**"))]{ _id, name, variant, format, "brand": brand->name },
  "references": *[_type == "productReference" && defined(gtin)]{ gtin, "product": product._ref }
}`;

export function identityRecords(data: {
  products: Array<{
    _id: string;
    name: string;
    variant: string | null;
    format: string | null;
    brand: string | null;
  }>;
  references: Array<{ gtin: string; product: string }>;
}): IdentityRecord[] {
  return data.products.map((p) => ({
    id: p._id,
    brand: p.brand,
    name: p.name,
    variant: p.variant,
    form: p.format,
    gtin: data.references.find((r) => r.product === p._id)?.gtin ?? null,
  }));
}

/** Suggestions only. `requiresHumanConfirmation` is always true. */
export function suggestProducts(
  s: Pick<LabelSubmission, 'brand' | 'productName' | 'variant'>,
  existing: IdentityRecord[],
  gtin?: string | null,
): MatchResult[] {
  return findMatches(
    {
      id: 'submission',
      brand: s.brand,
      name: s.productName,
      variant: s.variant,
      gtin: gtin ?? null,
    },
    existing,
  );
}

// ─── Submission intake ───────────────────────────────────────────────────

/** The candidate created on intake: submitted metadata as unverified facts only. */
export function intakeCandidate(sub: LabelSubmission, matches: MatchResult[]): Doc {
  const fact = (field: string, value: string) => ({
    _key: key(),
    _type: 'extractedFact',
    field,
    value,
    method: 'manual',
    sourceLocator: 'Submission form (as typed by the submitter)',
    verificationStatus: 'unverified',
  });
  return {
    _id: `candidate.${sub._id}`,
    _type: 'ingestionCandidate',
    title: [sub.brand, sub.productName, sub.variant].filter(Boolean).join(' · '),
    submission: ref(sub._id),
    ...(sub.productUrl ? { sourceUrl: sub.productUrl } : {}),
    extractedAt: sub.submittedAt,
    extractor: 'label-submission',
    status: 'needs_verification',
    matchStatus: matches.length ? 'possible_match' : 'unmatched',
    possibleMatches: matches.slice(0, 5).map((m) => ({
      _key: key(),
      _type: 'possibleMatch',
      product: ref(m.existingId),
      level: m.level,
      relation: m.relation,
      reasons: m.reasons,
    })),
    facts: [
      fact('brand', sub.brand),
      fact('name', sub.productName),
      ...(sub.variant ? [fact('variant', sub.variant)] : []),
    ],
    isDemo: false,
  };
}

// ─── Match decision ──────────────────────────────────────────────────────

export type MatchDecision =
  | { action: 'accept'; productId: string }
  | {
      action: 'create';
      product: {
        name: string;
        variant: string | null;
        brandId: string | null;
        newBrandName: string | null;
        categoryId: string;
        format: string;
      };
    }
  | { action: 'reject'; reason: string };

export interface DecisionContext {
  submission: LabelSubmission;
  candidate: Doc;
  existingProductIds: string[];
  existingBrandIds: string[];
  categoryIds: string[];
  takenIds: Set<string>;
}

export const FORMATS = [
  'powder',
  'capsule',
  'tablet',
  'softgel',
  'gummy',
  'liquid',
  'bar',
  'sachet',
  'strip',
  'other',
];

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

function uniqueId(base: string, taken: Set<string>) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export function planMatchDecision(
  ctx: DecisionContext,
  decision: MatchDecision,
  gtin: { raw: string | null; notObserved: boolean },
  reviewer: string,
  now = new Date().toISOString(),
): Plan {
  const errors: string[] = [];
  const s = ctx.submission;
  if (!reviewer.trim()) errors.push('Reviewer name is required.');
  if (s.status === 'REJECTED' || s.status === 'VERIFIED' || s.status === 'PUBLISHED')
    errors.push(`Submission is already ${s.status.toLowerCase()}.`);

  if (decision.action === 'reject') {
    if (!decision.reason.trim()) errors.push('Give a reason for rejecting.');
    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      ops: [
        {
          patch: {
            id: s._id,
            set: {
              status: 'REJECTED',
              rejectionReason: decision.reason.trim(),
              reviewedBy: reviewer,
              reviewedAt: now,
            },
          },
        },
        {
          patch: {
            id: String(ctx.candidate._id),
            set: {
              status: 'rejected',
              matchStatus: 'not_a_product',
              reviewedBy: reviewer,
              reviewedAt: now,
            },
          },
        },
      ],
    };
  }

  let gtinDigits: string | null = null;
  if (gtin.raw && gtin.raw.trim()) {
    const g = normalizeGtin(gtin.raw);
    if (g.status !== 'valid')
      errors.push(
        g.status === 'invalid_check_digit'
          ? 'GTIN check digit does not match. Re-read the barcode.'
          : 'Not a GTIN-8/12/13/14.',
      );
    else gtinDigits = g.digits;
  } else if (!gtin.notObserved) {
    errors.push('Enter the GTIN from the barcode, or mark it as not observed.');
  }

  const ops: WriteOp[] = [];
  let productId: string;
  if (decision.action === 'accept') {
    if (!ctx.existingProductIds.includes(decision.productId))
      errors.push('Choose an existing product.');
    productId = decision.productId;
  } else {
    const p = decision.product;
    const name = p.name.trim();
    if (!name) errors.push('Product name is required.');
    if (!ctx.categoryIds.includes(p.categoryId)) errors.push('Choose a category.');
    if (!FORMATS.includes(p.format)) errors.push('Choose a format.');
    if (!p.brandId && !p.newBrandName?.trim())
      errors.push('Choose a brand or enter a new brand name.');
    if (p.brandId && !ctx.existingBrandIds.includes(p.brandId)) errors.push('Unknown brand.');
    if (errors.length) return { ok: false, errors };
    let brandId = p.brandId;
    let brandName = p.newBrandName?.trim() ?? '';
    if (!brandId) {
      brandId = uniqueId(`brand.${slugify(brandName)}`, ctx.takenIds);
      ops.push({
        create: {
          _id: brandId,
          _type: 'brand',
          name: brandName,
          slug: { _type: 'slug', current: brandId.replace(/^brand\./, '') },
          workflowStatus: 'DRAFT',
          isDemo: false,
        },
      });
    } else {
      brandName = '';
    }
    const slug = slugify(
      [brandName || '', name, p.variant ?? ''].filter(Boolean).join(' ') || name,
    );
    productId = uniqueId(`product.${slug}`, ctx.takenIds);
    // Minimum structure only. Unknown values are left out (null), not defaulted.
    ops.push({
      create: {
        _id: productId,
        _type: 'product',
        name,
        variant: p.variant?.trim() || null,
        slug: { _type: 'slug', current: productId.replace(/^product\./, '') },
        brand: ref(brandId),
        category: ref(p.categoryId),
        format: p.format,
        vegStatus: 'UNKNOWN',
        vegStatusReason: 'Not yet verified from the label.',
        workflowStatus: 'DRAFT',
        isDemo: false,
      },
    });
  }
  if (errors.length) return { ok: false, errors };

  ops.push(
    {
      patch: {
        id: String(ctx.candidate._id),
        set: {
          status: 'in_review',
          matchStatus: decision.action === 'accept' ? 'confirmed' : 'new_product',
          resolvedProduct: ref(productId),
          reviewedBy: reviewer,
          reviewedAt: now,
          ...(gtinDigits ? { gtin: gtinDigits } : {}),
          facts: [
            ...((ctx.candidate.facts as unknown[]) ?? []),
            {
              _key: key(),
              _type: 'extractedFact',
              field: 'gtin',
              value: gtinDigits ?? 'Not observed on the submitted label',
              method: 'manual',
              sourceLocator: 'Submitted label photos (barcode)',
              verificationStatus: 'verified',
              verifiedBy: reviewer,
              verifiedAt: now,
            },
          ],
        },
      },
    },
    {
      patch: {
        id: s._id,
        set: {
          status: 'IN_REVIEW',
          product: ref(productId),
          reviewedBy: reviewer,
          reviewedAt: now,
        },
      },
    },
  );
  // A GTIN belongs on the external reference (per SKU), not on the product.
  if (gtinDigits || s.productUrl) {
    ops.push({
      create: {
        _id: uniqueId(`productReference.${s._id}`, ctx.takenIds),
        _type: 'productReference',
        product: ref(productId),
        dataSource: ref(SUBMISSIONS_DATA_SOURCE),
        ...(s.productUrl ? { url: s.productUrl } : {}),
        ...(gtinDigits ? { gtin: gtinDigits } : {}),
        ...(s.variant ? { variantLabel: s.variant } : {}),
        firstSeenAt: s.submittedAt,
        lastSeenAt: s.submittedAt,
        active: true,
        matchedBy: reviewer,
        matchedAt: now,
        isDemo: false,
      },
    });
  }
  return { ok: true, ops };
}

// ─── Fact review ─────────────────────────────────────────────────────────

export interface Amount {
  status: FactStatus;
  amount?: number | null;
  unit?: string | null;
}

export interface ActiveInput {
  displayName: string;
  ingredientId: string | null;
  form: string | null;
  compound: Amount;
  elemental: Amount & { basis?: 'label_declared' | null };
  locator: string | null;
  notes: string | null;
}

export interface FactReviewInput {
  reviewer: string;
  images: Array<{
    key: string;
    imageKind: SubmissionImage['imageKind'];
    depictsExactProduct: SubmissionImage['depictsExactProduct'];
  }>;
  factsImageKey: string;
  /** Only for an existing product: is this a new label version? */
  labelVersion: 'new' | 'unchanged';
  serving: {
    status: FactStatus;
    count?: number | null;
    unit?: string | null;
    mass?: number | null;
    massUnit?: string | null;
    locator?: string | null;
  };
  servingsPerContainer: { status: FactStatus; value?: number | null };
  frontOfPack: { status: FactStatus | 'NOT_REVIEWED'; text?: string | null };
  vegMark: {
    status: FactStatus | 'NOT_REVIEWED';
    value?: 'VEGETARIAN' | 'NON_VEGETARIAN' | 'VEGAN' | null;
  };
  actives: ActiveInput[];
}

export interface FactContext {
  submission: LabelSubmission;
  candidate: Doc;
  product: Doc;
  currentPanelIds: string[];
  /** Observations already recorded from this submission (a re-review supersedes them). */
  priorObservationIds?: string[];
  ingredientIds: string[];
  takenIds: Set<string>;
}

const MASS_UNITS = ['mcg', 'mg', 'g', 'kg', 'IU', 'CFU', 'ml'];

export function planFactReview(
  ctx: FactContext,
  input: FactReviewInput,
  now = new Date().toISOString(),
): Plan {
  const errors: string[] = [];
  const s = ctx.submission;
  const reviewer = input.reviewer.trim();
  if (!reviewer) errors.push('Reviewer name is required.');
  if (!s.product || s.status !== 'IN_REVIEW')
    errors.push('Confirm the product match before reviewing facts.');
  // Re-review is only for resolving values that were unclear.
  if (ctx.candidate.status === 'accepted')
    errors.push('Facts for this submission are already recorded.');

  // 1. Image confirmations (per image, by a person).
  const images: SubmissionImage[] = s.images.map((img) => {
    const r = input.images.find((i) => i.key === img._key);
    if (!r) return img;
    const decided = r.depictsExactProduct !== 'UNCONFIRMED';
    return {
      ...img,
      imageKind: r.imageKind,
      depictsExactProduct: r.depictsExactProduct,
      depictsConfirmedBy: decided ? reviewer : null,
      depictsConfirmedAt: decided ? now : null,
    };
  });
  const factsImage = images.find((i) => i._key === input.factsImageKey);
  if (!factsImage) errors.push('Choose the photo the facts were read from.');
  else if (factsImage.depictsExactProduct !== 'CONFIRMED' || factsImage.imageKind !== 'PACK_PHOTO')
    errors.push(
      'The facts photo must be confirmed as a photo of this exact product’s pack before its facts can be verified.',
    );

  // 2. Serving.
  let serving: ServingSpec | null = null;
  if (input.serving.status === 'VERIFIED') {
    const { count, unit, mass, massUnit } = input.serving;
    if (!isNum(count) || count <= 0) errors.push('Serving count must be a positive number.');
    if (!unit || !(SERVING_UNITS as readonly string[]).includes(unit))
      errors.push('Choose a serving unit.');
    if (isNum(mass) && !['g', 'mg', 'ml'].includes(massUnit ?? ''))
      errors.push('Give a unit for the serving weight.');
    if (!errors.length)
      serving = {
        count: count!,
        unit: unit as ServingUnit,
        mass: isNum(mass) ? mass : null,
        massUnit: isNum(mass) ? (massUnit as 'g' | 'mg' | 'ml') : null,
      };
  }
  const servings =
    input.servingsPerContainer.status === 'VERIFIED'
      ? isNum(input.servingsPerContainer.value) && input.servingsPerContainer.value >= 0
        ? input.servingsPerContainer.value
        : (errors.push('Servings per pack must be a number.'), null)
      : null;

  // 3. Actives: compound and elemental are independent; nothing is derived.
  const rows: Doc[] = [];
  input.actives.forEach((a, n) => {
    const label = `Active ${n + 1}`;
    if (!a.displayName.trim()) return void errors.push(`${label}: name as printed is required.`);
    if (a.ingredientId && !ctx.ingredientIds.includes(a.ingredientId))
      errors.push(`${label}: unknown canonical ingredient.`);
    const check = (x: Amount, what: string) => {
      if (x.status !== 'VERIFIED') return;
      if (!isNum(x.amount) || x.amount < 0)
        errors.push(`${label}: ${what} amount must be a number (0 is allowed).`);
      if (!x.unit || !MASS_UNITS.includes(x.unit)) errors.push(`${label}: choose a ${what} unit.`);
    };
    check(a.compound, 'compound');
    check(a.elemental, 'elemental');
    if (a.compound.status === 'VERIFIED' && !a.form?.trim())
      errors.push(
        `${label}: a compound amount needs the form it refers to (e.g. magnesium bisglycinate).`,
      );
    if (a.elemental.status === 'VERIFIED' && a.elemental.basis !== 'label_declared')
      errors.push(`${label}: elemental amounts can only be entered when the label declares them.`);
    const compound =
      a.compound.status === 'VERIFIED'
        ? { amount: a.compound.amount!, unit: a.compound.unit! }
        : null;
    const elemental =
      a.elemental.status === 'VERIFIED'
        ? { amount: a.elemental.amount!, unit: a.elemental.unit! }
        : null;
    rows.push({
      _key: key(),
      _type: 'labelIngredient',
      displayName: a.displayName.trim(),
      ingredient: a.ingredientId ? ref(a.ingredientId) : null,
      form: a.form?.trim() || null,
      // As printed per serving: the compound figure (the name the label prints it under).
      amount: compound?.amount ?? null,
      unit: compound?.unit ?? elemental?.unit ?? null,
      amountPerServing: compound?.amount ?? null,
      compoundAmount: compound?.amount ?? null,
      compoundUnit: compound?.unit ?? null,
      elementalAmount: elemental?.amount ?? null,
      elementalUnit: elemental?.unit ?? null,
      elementalBasis: elemental ? 'label_declared' : null,
      proprietaryBlend: false,
      blendName: null,
      orderOnLabel: n + 1,
      isKeyActive: Boolean(a.ingredientId),
      sourceLocator: a.locator?.trim() || `Submitted facts photo, row ${n + 1}`,
      observation: a.notes?.trim() || null,
      editorialNote: null,
      dailyValue: null,
      dailyValuePercent: null,
    } as unknown as Doc);
  });
  if (input.frontOfPack.status === 'VERIFIED' && !input.frontOfPack.text?.trim())
    errors.push('Enter the front-of-pack wording exactly as printed.');
  if (input.vegMark.status === 'VERIFIED' && !input.vegMark.value)
    errors.push('Choose the veg status shown on the label.');
  if (errors.length) return { ok: false, errors };

  // 4. Writes.
  const productId = s.product!._ref;
  const candidateId = String(ctx.candidate._id);
  const sourceId = `source.${s._id}`;
  const locator = (what: string) => `Submitted label photo (${factsImage!.role}) → ${what}`;
  const obs = (type: string, value: string, where: string): WriteOp => ({
    create: {
      _id: `observation.${s._id}.${type}.${key()}`,
      _type: 'observation',
      product: ref(productId),
      type,
      value,
      source: ref(sourceId),
      submission: ref(s._id),
      extractedFrom: ref(candidateId),
      sourceType: 'PHYSICAL_PACK',
      sourceLocator: where,
      extractionMethod: 'manual',
      verificationStatus: 'verified',
      observedAt: s.submittedAt,
      observedBy: reviewer,
      verifiedBy: reviewer,
      verifiedAt: now,
      isDemo: false,
    },
  });
  const ops: WriteOp[] = [];
  if (!ctx.takenIds.has(sourceId)) {
    ops.push({
      create: {
        _id: sourceId,
        _type: 'source',
        // No submitter details: the citation describes the evidence, not the person.
        title: `Label photos submitted to labels.fyi (${s.submittedAt.slice(0, 10)})`,
        sourceType: 'product_label',
        accessedAt: s.submittedAt.slice(0, 10),
        notes: `Photos of the physical pack; product identity confirmed by ${reviewer} on ${now.slice(0, 10)}.`,
      },
    });
  }
  ops.push({ patch: { id: s._id, set: { images } } });

  const servingText = formatServing(serving);
  if (serving)
    ops.push(
      obs('serving_size', `Serving size printed as ${servingText}.`, locator('serving size')),
    );
  else if (input.serving.status === 'MISSING')
    ops.push(
      obs(
        'label_text',
        'Serving size is not printed on the submitted label.',
        locator('serving size'),
      ),
    );
  if (servings !== null)
    ops.push(
      obs(
        'servings_per_container',
        `Servings per pack printed as ${servings}.`,
        locator('servings per pack'),
      ),
    );
  else if (input.servingsPerContainer.status === 'MISSING')
    ops.push(
      obs(
        'label_text',
        'Servings per pack are not printed on the submitted label.',
        locator('servings per pack'),
      ),
    );
  input.actives.forEach((a, n) => {
    const where = rows[n]!.sourceLocator as string;
    if (a.compound.status === 'VERIFIED')
      ops.push(
        obs(
          'ingredient_amount',
          `Label declares ${a.compound.amount} ${a.compound.unit} ${a.form} per serving.`,
          where,
        ),
      );
    if (a.elemental.status === 'VERIFIED')
      ops.push(
        obs(
          'ingredient_amount',
          `Label declares ${a.elemental.amount} ${a.elemental.unit} elemental ${a.displayName} per serving.`,
          where,
        ),
      );
    else if (a.elemental.status === 'MISSING' && a.compound.status === 'VERIFIED')
      ops.push(
        obs(
          'label_text',
          `Label does not declare the elemental amount for ${a.displayName}.`,
          where,
        ),
      );
  });
  if (input.frontOfPack.status === 'VERIFIED')
    ops.push(
      obs(
        'front_label_claim',
        `Front label states "${input.frontOfPack.text!.trim()}".`,
        'Submitted label photo (front) → front of pack',
      ),
    );
  const vegReason =
    input.vegMark.status === 'VERIFIED'
      ? `${input.vegMark.value === 'NON_VEGETARIAN' ? 'Brown non-vegetarian' : 'Green vegetarian'} mark on the submitted label${input.vegMark.value === 'VEGAN' ? ', with a vegan statement' : ''}.`
      : input.vegMark.status === 'MISSING'
        ? 'The submitted label photos show no vegetarian or non-vegetarian mark.'
        : input.vegMark.status === 'UNCLEAR'
          ? 'The veg mark is not legible in the submitted photos.'
          : null;
  if (input.vegMark.status === 'VERIFIED')
    ops.push(obs('veg_mark', vegReason!, 'Submitted label photos → veg mark'));

  // A re-review (after resolving unclear values) supersedes this
  // submission's earlier observations instead of editing them.
  const prior = ctx.priorObservationIds ?? [];
  const firstNew = ops.find(
    (o): o is { create: Doc } => 'create' in o && o.create._type === 'observation',
  );
  for (const id of prior)
    ops.push({
      patch: {
        id,
        set: { supersededAt: now, ...(firstNew ? { supersededBy: ref(firstNew.create._id) } : {}) },
      },
    });

  const isNewProduct = ctx.candidate.matchStatus === 'new_product';
  const newPanel = isNewProduct || input.labelVersion === 'new';
  // A live product's public facts must not change before editorial review:
  // its new panel/observations are hidden by the approval gate (queries.ts),
  // and product-field changes wait on the candidate until release.
  const productLive = ['PUBLISHED', 'NEEDS_REVIEW'].includes(String(ctx.product.workflowStatus));
  if (newPanel) {
    const ownPanel = `panel.${s._id}`;
    const earlierLabels = ctx.currentPanelIds.filter((id) => !id.startsWith(ownPanel));
    if (earlierLabels.length && !prior.length)
      ops.push(
        obs(
          'label_change',
          'A newer label was submitted and verified; earlier panels are kept as superseded.',
          'Submitted label photos',
        ),
      );
    ops.push({
      create: {
        _id: uniqueId(ownPanel, ctx.takenIds),
        _type: 'labelPanel',
        product: ref(productId),
        panelType: 'supplement_facts',
        title: 'Supplement facts',
        sourceType: 'PHYSICAL_PACK',
        sourceImage: { submission: ref(s._id), imageKey: factsImage!._key },
        serving: serving ? { _type: 'servingSpec', ...serving } : null,
        servingSize: serving
          ? serving.mass !== null
            ? { amount: serving.mass, unit: serving.massUnit }
            : { amount: serving.count, unit: 'count' }
          : null,
        servingSizeText: servingText,
        servingsPerContainer: servings,
        per100Basis: null,
        nutrients: [],
        ingredients: rows,
        capturedAt: s.submittedAt,
        capturedBy: reviewer,
        verifiedAt: now,
        source: ref(sourceId),
        status: 'current',
        // Append-only history: earlier panels are never edited. The site
        // treats them as superseded once this panel passes editorial review.
        supersedes: ctx.currentPanelIds.map((id) => ({ ...ref(id), _key: key() })),
        isDemo: false,
      },
    });
  }

  // Product: only verified values; unknown stays null.
  const productChanges = {
    ...(newPanel
      ? {
          serving: serving ? { _type: 'servingSpec', ...serving } : null,
          servingSize: serving
            ? serving.mass !== null
              ? { amount: serving.mass, unit: serving.massUnit }
              : { amount: serving.count, unit: 'count' }
            : null,
          servingSizeText: servingText,
          servingsPerContainer: servings,
        }
      : {}),
    ...(vegReason && (input.vegMark.status === 'VERIFIED' || newPanel)
      ? {
          vegStatus: input.vegMark.status === 'VERIFIED' ? input.vegMark.value : 'UNKNOWN',
          vegStatusReason: vegReason,
        }
      : {}),
    lastVerifiedAt: now,
  };
  if (!productLive) ops.push({ patch: { id: productId, set: productChanges } });

  const unclear = [
    input.serving.status === 'UNCLEAR' && 'serving size',
    input.servingsPerContainer.status === 'UNCLEAR' && 'servings per pack',
    ...input.actives.flatMap((a) => [
      a.compound.status === 'UNCLEAR' && `${a.displayName} compound amount`,
      a.elemental.status === 'UNCLEAR' && `${a.displayName} elemental amount`,
    ]),
    input.frontOfPack.status === 'UNCLEAR' && 'front of pack',
    input.vegMark.status === 'UNCLEAR' && 'veg mark',
  ].filter(Boolean) as string[];
  ops.push({
    patch: {
      id: candidateId,
      set: {
        status: unclear.length ? 'in_review' : 'accepted',
        unresolved: unclear,
        proposedProductChanges: productLive ? productChanges : null,
        reviewedBy: reviewer,
        reviewedAt: now,
      },
    },
  });
  return { ok: true, ops };
}

// ─── Readiness gate & workflow entry ─────────────────────────────────────

export interface ReadinessContext {
  submission: LabelSubmission;
  candidate: Doc | null;
  product: Doc | null;
  packObservations: Doc[];
  currentPanels: Doc[];
}

export interface Check {
  key: string;
  label: string;
  ok: boolean;
  detail?: string | undefined;
}

export function readiness(ctx: ReadinessContext): Check[] {
  const p = ctx.product;
  const confirmedPack = ctx.submission.images.some(
    (i) => i.depictsExactProduct === 'CONFIRMED' && i.imageKind === 'PACK_PHOTO',
  );
  const unresolved = (ctx.candidate?.unresolved as string[] | undefined) ?? [];
  const serving = p?.serving as ServingSpec | null | undefined;
  return [
    {
      key: 'identity',
      label: 'Product identity verified',
      ok: Boolean(
        p &&
        ctx.candidate &&
        ['confirmed', 'new_product'].includes(String(ctx.candidate.matchStatus)),
      ),
    },
    { key: 'evidence', label: 'Source evidence present (confirmed pack photo)', ok: confirmedPack },
    {
      key: 'pack-observation',
      label: 'Physical-pack observation verified',
      ok: ctx.packObservations.some(
        (o) =>
          o.sourceType === 'PHYSICAL_PACK' &&
          o.verificationStatus === 'verified' &&
          Boolean(o.verifiedBy),
      ),
    },
    {
      key: 'fields',
      label: 'Required product fields valid',
      ok: Boolean(
        p &&
        p.name &&
        p.brand &&
        p.category &&
        p.format &&
        p.vegStatus &&
        p.vegStatusReason &&
        serving &&
        p.lastVerifiedAt &&
        ctx.currentPanels.length,
      ),
      detail: !serving
        ? 'Structured serving is required.'
        : !ctx.currentPanels.length
          ? 'A current label panel is required.'
          : undefined,
    },
    {
      key: 'blocking',
      label: 'No unresolved blocking issue',
      ok: unresolved.length === 0 && ctx.candidate?.status === 'accepted',
      detail: unresolved.length ? `Unclear: ${unresolved.join(', ')}` : undefined,
    },
  ];
}

/**
 * Enter the existing editorial workflow (DRAFT → FACT_CHECK). This is not
 * publication: the Studio's review requirement and publish gates still apply.
 */
export function planEnterWorkflow(
  ctx: ReadinessContext,
  brand: Doc | null,
  now = new Date().toISOString(),
): Plan {
  const failing = readiness(ctx).filter((c) => !c.ok);
  if (failing.length)
    return {
      ok: false,
      errors: failing.map((c) => `${c.label}${c.detail ? `: ${c.detail}` : ''}`),
    };
  const ops: WriteOp[] = [];
  if (ctx.product!.workflowStatus === 'DRAFT')
    ops.push({ patch: { id: String(ctx.product!._id), set: { workflowStatus: 'FACT_CHECK' } } });
  if (brand && brand.workflowStatus === 'DRAFT')
    ops.push({ patch: { id: String(brand._id), set: { workflowStatus: 'FACT_CHECK' } } });
  ops.push({ patch: { id: ctx.submission._id, set: { status: 'VERIFIED', reviewedAt: now } } });
  return { ok: true, ops };
}

// ─── Release (after editorial approval) ──────────────────────────────────

export interface ReleaseContext extends ReadinessContext {
  /** Editorial reviews of the product (from Studio). */
  reviews: Array<{ status?: string; reviewedAt?: string }>;
}

const isLive = (p: Doc | null) => ['PUBLISHED', 'NEEDS_REVIEW'].includes(String(p?.workflowStatus));

/**
 * The facts were verified at candidate.reviewedAt. They count as approved
 * only when a named reviewer approved the product at or after that moment:
 * the same rule the site queries apply to submission-derived records.
 */
export function approvedAfterVerification(ctx: ReleaseContext): boolean {
  const verifiedAt = Date.parse(String(ctx.candidate?.reviewedAt ?? ''));
  return (
    Number.isFinite(verifiedAt) &&
    ctx.reviews.some((r) => r.status === 'approved' && Date.parse(r.reviewedAt ?? '') >= verifiedAt)
  );
}

/**
 * Record that a verified submission is live. Only allowed once the product
 * is published and an approved editorial review postdates the verification.
 * For a label update to a live product this also applies the product-field
 * changes (serving, veg status) that were held back until approval.
 */
export function planRelease(ctx: ReleaseContext, now = new Date().toISOString()): Plan {
  const errors: string[] = [];
  if (ctx.submission.status !== 'VERIFIED')
    errors.push('Send the submission to editorial review first.');
  if (!isLive(ctx.product))
    errors.push('The product is not published yet (publish it in Studio after review).');
  if (!approvedAfterVerification(ctx))
    errors.push(
      'No approved editorial review of this product since the label facts were verified.',
    );
  if (errors.length) return { ok: false, errors };
  const changes = ctx.candidate?.proposedProductChanges as
    Record<string, unknown> | null | undefined;
  return {
    ok: true,
    ops: [
      ...(changes ? [{ patch: { id: String(ctx.product!._id), set: changes } }] : []),
      ...(changes
        ? [{ patch: { id: String(ctx.candidate!._id), set: { proposedChangesAppliedAt: now } } }]
        : []),
      { patch: { id: ctx.submission._id, set: { status: 'PUBLISHED' } } },
    ],
  };
}

export type { DocStore };
