import { productCosts, referencePrice } from '@/lib/calculations';
import { productDecoder } from '@/lib/comparison/decoder';
import { discrepancyView } from '@/lib/comparison/discrepancy';
import { NOT_DISCLOSED } from '@/lib/comparison/present';
import type { ProductDetail, SourceKind } from '@/lib/content/types';
import { labelVerification } from '@/lib/editorial/evidence';
import { LABEL_VERIFICATION, SOURCE_KIND, VEG } from '@/lib/editorial/meta';
import { inlineName } from '@/lib/editorial/product';
import { latestReview } from '@/lib/editorial/review';
import { formatDate } from '@/lib/formatting/dates';
import { formatMoney } from '@/lib/formatting/money';
import { formatQuantity } from '@/lib/formatting/quantity';
import { formatServing } from '@/lib/identity/serving';
import { routes } from '@/lib/seo/site';

/**
 * Supplement Receipt: a shareable, single-product summary built only from
 * data that already passed the site's publishing gates.
 *
 * Rules (all tested):
 *  - FRONT OF PACK only when a verified front-label observation exists;
 *    otherwise null. Never inferred from the panel or a claim.
 *  - Compound and elemental amounts are separate strings; a missing
 *    elemental amount is "Not disclosed". Never "1,000 mg magnesium" for a
 *    compound weight.
 *  - Price only from a real, dated price observation.
 *  - Facts only: no scores, rankings, "best" or recommendations.
 */

export interface ReceiptCheck {
  label: string;
  value: string;
  /** Neutral state for styling: declared / not disclosed / informational. */
  state: 'declared' | 'not_disclosed' | 'info';
}

export interface Receipt {
  slug: string;
  href: string;
  productHref: string;
  brand: string;
  productName: string;
  variant: string | null;
  isDemo: boolean;
  frontOfPack: { text: string; observedAt: string; source: string | null } | null;
  labelPanel: {
    ingredient: string;
    /** Active as the label names it (form when recorded, else the printed name). */
    active: string;
    /** True only when the label declares a compound and/or elemental amount. */
    hasSplit: boolean;
    form: string;
    compound: string;
    elemental: string;
    elementalBasis: string | null;
    /** For actives without a compound/elemental split (e.g. creatine) or a key nutrient (protein). */
    declared: string | null;
    serving: string;
    servingsPerPack: string;
  } | null;
  meaning: string;
  note: string | null;
  checks: ReceiptCheck[];
  evidence: {
    verification: string;
    verificationDetail: string;
    labelCapturedAt: string | null;
    sourceKind: string | null;
    sourceTitle: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    reviewerIsPlaceholder: boolean;
  };
  price: { pack: string; perServing: string | null; merchant: string; observedAt: string } | null;
}

const PACK_SOURCES: SourceKind[] = ['PHYSICAL_PACK', 'BRAND_SUPPLIED_LABEL', 'PRODUCT_ARTWORK'];

/** The verbatim front-of-pack wording from a verified observation, or null. */
function frontOfPack(p: ProductDetail): Receipt['frontOfPack'] {
  const obs = p.observations
    .filter(
      (o) =>
        o.type === 'front_label_claim' &&
        o.verificationStatus === 'verified' &&
        !o.supersededAt &&
        o.sourceType !== null &&
        PACK_SOURCES.includes(o.sourceType),
    )
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  if (!obs) return null;
  // Observations record wording as: Front label states "…". Use the quoted text when present.
  const quoted = /"([^"]+)"|“([^”]+)”/.exec(obs.value);
  return {
    text: quoted ? (quoted[1] ?? quoted[2])! : obs.value,
    observedAt: formatDate(obs.observedAt),
    source: obs.source?.title ?? null,
  };
}

/** Receipts are only built for products with acceptable label evidence. */
export function isReceiptEligible(p: ProductDetail): boolean {
  return labelVerification(p) !== 'no_label_evidence';
}

export function buildReceipt(p: ProductDetail): Receipt | null {
  if (!isReceiptEligible(p)) return null;
  const d = productDecoder(p);
  const current = p.panels.filter((x) => x.isCurrent);
  const primary = d.ingredients.find((i) => i.compound || i.elemental) ?? d.ingredients[0] ?? null;
  const nutrient = p.keyNutrients.find((n) => n.perServing !== null) ?? null;
  const serving = formatServing(p.serving) ?? p.servingSizeText ?? NOT_DISCLOSED;
  const servingsPerPack = p.servingsPerContainer ? String(p.servingsPerContainer) : 'Not printed';

  const ingredientName = primary
    ? (primary.canonicalIngredient?.name ?? primary.displayName)
    : null;
  const compound = primary?.compound ? formatQuantity(primary.compound) : NOT_DISCLOSED;
  const elemental = primary?.elemental ? formatQuantity(primary.elemental) : NOT_DISCLOSED;
  const hasSplit = Boolean(primary?.compound || primary?.elemental);
  const declared = nutrient
    ? `${formatQuantity({ amount: nutrient.perServing!, unit: nutrient.unit })} ${inlineName(nutrient.name)}`
    : !hasSplit && primary?.declared
      ? `${formatQuantity(primary.declared)} ${inlineName(primary.form ?? primary.displayName)}`
      : null;

  const labelPanel: Receipt['labelPanel'] =
    primary || nutrient
      ? {
          ingredient: ingredientName ?? nutrient!.name,
          active: primary?.form ?? primary?.displayName ?? nutrient!.name,
          hasSplit,
          form: primary?.form ?? NOT_DISCLOSED,
          compound: hasSplit
            ? `${compound}${primary?.compound && primary.form ? ` ${inlineName(primary.form)}` : ''}`
            : NOT_DISCLOSED,
          elemental:
            hasSplit && primary?.elemental
              ? `${elemental} ${inlineName(ingredientName ?? '')}`.trim()
              : NOT_DISCLOSED,
          elementalBasis:
            primary?.elemental && primary.elementalBasis
              ? primary.elementalBasis === 'label_declared'
                ? 'Declared on label'
                : 'Editorial calculation (cited)'
              : null,
          declared,
          serving,
          servingsPerPack,
        }
      : null;

  // WHAT THIS NUMBER MEANS: generated only from declared values.
  let meaning: string;
  if (primary?.compound && primary.elemental && primary.form && ingredientName) {
    meaning = `${formatQuantity(primary.compound)} is the weight of ${inlineName(primary.form)}. The label declares ${formatQuantity(primary.elemental)} of elemental ${inlineName(ingredientName)} in it.`;
  } else if (primary?.compound && primary.form && ingredientName) {
    meaning = `${formatQuantity(primary.compound)} is the weight of ${inlineName(primary.form)}. The label does not declare how much elemental ${inlineName(ingredientName)} that provides.`;
  } else if (primary?.elemental && ingredientName) {
    meaning = `The label declares ${formatQuantity(primary.elemental)} of elemental ${inlineName(ingredientName)} per serving. The weight of the compound is not declared.`;
  } else if (declared) {
    meaning = `The label declares ${declared} per serving of ${serving}.`;
  } else {
    meaning = 'The label does not disclose amounts for its actives.';
  }

  const actives = d.ingredients;
  const disclosed = actives.filter((i) => i.compound || i.elemental || i.declared).length;
  const blend = actives.some((i) => i.proprietaryBlend);
  const openDiffs = p.discrepancies.filter((x) => discrepancyView(x).isOpen).length;
  const checks: ReceiptCheck[] = [
    {
      label: 'Serving size printed',
      value: p.servingSizeText ? 'Yes' : 'No',
      state: p.servingSizeText ? 'declared' : 'not_disclosed',
    },
    {
      label: 'Servings per pack printed',
      value: p.servingsPerContainer ? 'Yes' : 'No',
      state: p.servingsPerContainer ? 'declared' : 'not_disclosed',
    },
    {
      label: 'Active amounts disclosed',
      value: `${disclosed} of ${actives.length}`,
      state: disclosed === actives.length && actives.length > 0 ? 'declared' : 'not_disclosed',
    },
    ...(hasSplit
      ? [
          {
            label: 'Elemental amount declared',
            value: primary?.elemental ? 'Yes' : 'No',
            state: primary?.elemental ? 'declared' : 'not_disclosed',
          } as ReceiptCheck,
        ]
      : []),
    {
      label: 'Proprietary blend',
      value: blend ? 'Yes: amounts not disclosed' : 'None',
      state: blend ? 'not_disclosed' : 'info',
    },
    {
      label: 'Veg status',
      value: VEG[p.vegStatus].label,
      state: p.vegStatus === 'UNKNOWN' ? 'not_disclosed' : 'info',
    },
    {
      label: 'Pack vs web differences',
      value: openDiffs ? `${openDiffs} open` : 'None recorded',
      state: 'info',
    },
  ];

  const panel = current[0] ?? null;
  const review = latestReview(p);
  const verification = LABEL_VERIFICATION[labelVerification(p)];
  const snap = referencePrice(p);
  const perServing = snap ? productCosts(p, snap).perServing : null;

  return {
    slug: p.slug,
    href: `/receipt/${p.slug}`,
    productHref: routes.product(p.slug),
    brand: p.brand.name,
    productName: p.name,
    variant: p.variant,
    isDemo: p.isDemo,
    frontOfPack: frontOfPack(p),
    labelPanel,
    meaning,
    note: primary?.editorialNote ?? null,
    checks,
    evidence: {
      verification: verification.label,
      verificationDetail: verification.description,
      labelCapturedAt: panel ? formatDate(panel.capturedAt) : null,
      sourceKind: panel?.sourceType ? SOURCE_KIND[panel.sourceType] : null,
      sourceTitle: panel?.source?.title ?? null,
      reviewedBy: review ? review.reviewer.name : null,
      reviewedAt: review ? formatDate(review.reviewedAt) : null,
      reviewerIsPlaceholder: review?.reviewer.isPlaceholder ?? false,
    },
    price:
      snap && perServing
        ? {
            pack: formatMoney({ amount: snap.price, currency: snap.currency }),
            perServing: perServing.ok ? formatMoney(perServing.value, { precise: true }) : null,
            merchant: snap.merchant.name,
            observedAt: formatDate(snap.capturedAt),
          }
        : null,
  };
}
