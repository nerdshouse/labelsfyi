import { productCosts, referencePrice, type Money } from '@/lib/calculations';
import type { Currency, ProductDetail, Quantity, SourceKind } from '@/lib/content/types';
import { labelVerification, type LabelVerification } from '@/lib/editorial/evidence';
import type { ServingSpec } from '@/lib/identity/serving';
import { productDecoder } from './decoder';
import { discrepancyView } from './discrepancy';
import { activeRows, ingredientAmounts } from './ingredients';

/**
 * The label facts two-product comparison reads, derived from the published
 * product graph (decoder + derive functions). Not a record: it is rebuilt from
 * the graph on every build and serialised per product (/compare-data/<slug>.json)
 * so the on-demand compare route never queries the CMS. A file exists only for
 * published products, so it doubles as the "is this product public?" check.
 */
export const LABEL_FACTS_VERSION = 1;

export interface ActiveFact {
  /** Alignment key across products: canonical ingredient id, else the printed name. */
  key: string;
  /** Canonical ingredient name, else the name as printed. */
  ingredient: string;
  ingredientSlug: string | null;
  printedName: string;
  form: string | null;
  compound: Quantity | null;
  elemental: Quantity | null;
  /** Amount-per-serving as printed, for actives without a compound/elemental split. */
  declared: Quantity | null;
  isKeyActive: boolean;
  /** Proprietary blend name when the row is inside one. */
  blend: string | null;
}

export interface NutrientFact {
  key: string;
  name: string;
  amount: Quantity;
}

export interface LabelFacts {
  v: typeof LABEL_FACTS_VERSION;
  slug: string;
  name: string;
  variant: string | null;
  brand: { name: string; slug: string };
  category: { name: string; slug: string } | null;
  isDemo: boolean;
  serving: ServingSpec | null;
  servingText: string | null;
  servingsPerPack: number | null;
  actives: ActiveFact[];
  nutrients: NutrientFact[];
  /** Only from a real, dated price observation. */
  price: {
    amount: number;
    currency: Currency;
    merchant: string;
    observedAt: string;
    perServing: Money | null;
  } | null;
  evidence: {
    verification: LabelVerification;
    sourceType: SourceKind | null;
    labelCapturedAt: string | null;
    /** Latest verified pack observation (actual observation date). */
    lastPackObservationAt: string | null;
  };
  /** Open discrepancies only, as neutral facts. */
  discrepancies: Array<{ field: string; sources: SourceKind[] }>;
}

const PACK: SourceKind[] = ['PHYSICAL_PACK', 'BRAND_SUPPLIED_LABEL', 'PRODUCT_ARTWORK'];
const keyFor = (name: string) => `name:${name.toLowerCase().replace(/\s+/g, ' ').trim()}`;
/** "Vitamin B6 (as pyridoxine hydrochloride)" → "Vitamin B6" (the form is kept separately). */
const baseName = (printed: string) =>
  printed.replace(/\s*\((?:as|from)\s[^)]*\)\s*$/i, '').trim() || printed;

export function labelFacts(p: ProductDetail): LabelFacts {
  const d = productDecoder(p);
  const snap = referencePrice(p);
  const perServing = snap ? productCosts(p, snap).perServing : null;
  const panel = d.labelEvidence[0] ?? null;
  const packObs = p.observations
    .filter((o) => o.sourceType && PACK.includes(o.sourceType) && !o.supersededAt)
    .map((o) => o.observedAt)
    .sort();
  return {
    v: LABEL_FACTS_VERSION,
    slug: p.slug,
    name: p.name,
    variant: p.variant,
    brand: { name: p.brand.name, slug: p.brand.slug },
    category: p.category ? { name: p.category.name, slug: p.category.slug } : null,
    isDemo: p.isDemo,
    serving: p.serving,
    servingText: p.servingSizeText,
    servingsPerPack: p.servingsPerContainer,
    actives: activeRows(p).map((r) => ({
      key: r.ingredient?._id ?? keyFor(baseName(r.displayName)),
      ingredient: r.ingredient?.name ?? baseName(r.displayName),
      ingredientSlug: r.ingredient?.slug ?? null,
      printedName: r.displayName,
      form: r.form,
      ...ingredientAmounts(r),
      isKeyActive: r.isKeyActive,
      blend: r.proprietaryBlend ? (r.blendName ?? 'Proprietary blend') : null,
    })),
    nutrients: p.keyNutrients
      .filter((n) => n.perServing !== null)
      .map((n) => ({
        key: n.nutrientKey ?? keyFor(n.name),
        name: n.name,
        amount: { amount: n.perServing!, unit: n.unit },
      })),
    price: snap
      ? {
          amount: snap.price,
          currency: snap.currency,
          merchant: snap.merchant.name,
          observedAt: snap.capturedAt,
          perServing: perServing?.ok ? perServing.value : null,
        }
      : null,
    evidence: {
      verification: labelVerification(p),
      sourceType: panel?.sourceType ?? null,
      labelCapturedAt: panel?.capturedAt ?? null,
      lastPackObservationAt: packObs.at(-1) ?? null,
    },
    discrepancies: p.discrepancies
      .filter((x) => discrepancyView(x).isOpen)
      .map((x) => ({ field: x.field, sources: x.values.map((v) => v.sourceType) })),
  };
}
