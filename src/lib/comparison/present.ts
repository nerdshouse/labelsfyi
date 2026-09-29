import type { Money } from '@/lib/calculations';
import type { DiscrepancyData, ObservationData, Quantity, SourceKind } from '@/lib/content/types';
import {
  BRAND_RESOLUTION,
  DISCREPANCY_SEVERITY,
  DISCREPANCY_STATUS,
  LABEL_VERIFICATION,
  OBSERVATION_TYPE,
  SOURCE_KIND,
  VEG,
} from '@/lib/editorial/meta';
import { formatDate } from '@/lib/formatting/dates';
import { formatMoney } from '@/lib/formatting/money';
import { formatQuantity } from '@/lib/formatting/quantity';
import { formatServing } from '@/lib/identity/serving';
import { routes } from '@/lib/seo/site';
import type { productDecoder } from './decoder';
import { discrepancyView } from './discrepancy';
import type { ComparisonRow } from './search';

/**
 * Presentation decisions for the comparison and decoder UI, kept pure so
 * they can be tested. Rules:
 *  - a missing value is "Not disclosed" (or an explicit reason), never a guess
 *  - compound and elemental amounts are separate strings, each labelled
 *  - no scores, ranks or "best": views carry facts only
 */

export const NOT_DISCLOSED = 'Not disclosed';

const amount = (q: Quantity | null) => (q ? formatQuantity(q) : NOT_DISCLOSED);
const money = (m: Money | null) => (m ? formatMoney(m, { precise: true }) : null);

export interface ComparisonRowView {
  id: string;
  href: string;
  brand: string;
  product: string;
  variant: string | null;
  serving: string;
  form: string;
  compound: string;
  elemental: string;
  activeCount: string;
  price: string;
  pricePerServing: string;
  pricePer100MgElemental: string;
  veg: { status: ComparisonRow['vegStatus']; label: string };
  verification: { key: ComparisonRow['labelVerification']; label: string; description: string };
  discrepancies: { count: number; label: string };
  isDemo: boolean;
  /** Raw values for client-side filtering (not for ordering by "best"). */
  filter: { form: string; veg: string; pricePerServing: number | null };
}

/** Why ₹/100 mg elemental is unavailable, if it is. */
export function elementalCostReason(row: ComparisonRow): string | null {
  if (row.pricePer100MgElemental) return null;
  if (!row.elementalAmount) return 'Elemental amount not disclosed';
  if (!row.pricePerServing) return 'No price observed';
  return 'Not calculable';
}

export function presentComparisonRow(row: ComparisonRow): ComparisonRowView {
  const verification = LABEL_VERIFICATION[row.labelVerification];
  const count = row.openDiscrepancyCount;
  return {
    id: row.product._id,
    href: routes.product(row.product.slug),
    brand: row.brand.name,
    product: row.product.name,
    variant: row.product.variant,
    serving: formatServing(row.serving) ?? NOT_DISCLOSED,
    form: row.form ?? NOT_DISCLOSED,
    compound: amount(row.compoundAmount),
    // Elemental is only ever the declared elemental amount. Never the compound weight.
    elemental: amount(row.elementalAmount),
    activeCount: `${row.disclosedActiveCount} of ${row.activeCount} with amounts`,
    price: row.price
      ? `${formatMoney({ amount: row.price.price, currency: row.price.currency })} · ${row.price.merchant.name}, ${formatDate(row.price.capturedAt)}`
      : 'No price observed',
    pricePerServing: money(row.pricePerServing) ?? 'No price observed',
    pricePer100MgElemental:
      money(row.pricePer100MgElemental) ?? (elementalCostReason(row) as string),
    veg: { status: row.vegStatus, label: VEG[row.vegStatus].label },
    verification: { key: row.labelVerification, ...verification },
    discrepancies: {
      count,
      label:
        count === 0
          ? 'None recorded'
          : `${count} open ${count === 1 ? 'difference' : 'differences'}`,
    },
    isDemo: row.isDemo,
    filter: {
      form: row.form ?? '',
      veg: row.vegStatus,
      pricePerServing: row.pricePerServing?.amount ?? null,
    },
  };
}

/**
 * Show the elemental column only when it is meaningful for this set: some
 * product declares an elemental amount, or products declare a compound form.
 */
export function showsElemental(rows: ComparisonRow[]): boolean {
  return rows.some((r) => r.elementalAmount !== null || r.compoundAmount !== null);
}

// ─── Decoder views ───────────────────────────────────────────────────────

type Decoder = ReturnType<typeof productDecoder>;

export function presentIngredients(d: Decoder) {
  return d.ingredients.map((i) => ({
    name: i.canonicalIngredient?.name ?? i.displayName,
    href: i.canonicalIngredient ? routes.ingredient(i.canonicalIngredient.slug) : null,
    asPrinted: i.displayName,
    form: i.form ?? NOT_DISCLOSED,
    compound: amount(i.compound),
    elemental: amount(i.elemental),
    elementalBasis:
      i.elemental === null
        ? null
        : i.elementalBasis === 'label_declared'
          ? 'Declared on label'
          : 'Editorial calculation (cited)',
    // Rows without a compound split (e.g. creatine) still show the declared amount.
    declared: amount(i.declared),
    blend: i.proprietaryBlend,
    locator: i.sourceLocator,
    note: i.editorialNote,
  }));
}

/** Primary-active amounts for the at-a-glance block; null when there is nothing to split. */
export function presentAmountSplit(d: Decoder) {
  const primary = d.ingredients.find((i) => i.compound || i.elemental);
  if (!primary) return null;
  return {
    ingredient: primary.canonicalIngredient?.name ?? primary.displayName,
    form: primary.form ?? NOT_DISCLOSED,
    compound: amount(primary.compound),
    elemental: amount(primary.elemental),
  };
}

const GROUPS: Array<{ key: string; title: string; kinds: SourceKind[] }> = [
  {
    key: 'pack',
    title: 'On the pack',
    kinds: ['PHYSICAL_PACK', 'BRAND_SUPPLIED_LABEL', 'PRODUCT_ARTWORK'],
  },
  { key: 'website', title: 'Brand website', kinds: ['BRAND_WEBSITE', 'MARKETING_COPY'] },
  { key: 'marketplace', title: 'Marketplaces', kinds: ['MARKETPLACE'] },
];

export function presentObservationGroups(d: Decoder) {
  const all: ObservationData[] = [...d.packObservations, ...d.websiteObservations];
  return GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    items: all
      .filter((o) => o.sourceType && g.kinds.includes(o.sourceType) && !o.supersededAt)
      .map((o) => ({
        id: o._id,
        kind: OBSERVATION_TYPE[o.type],
        value: o.value,
        sourceKind: o.sourceType ? SOURCE_KIND[o.sourceType] : null,
        locator: o.sourceLocator,
        observedAt: formatDate(o.observedAt),
        observedAtIso: o.observedAt,
        verifiedBy: o.verifiedBy,
        sourceId: o.source?._id ?? null,
        snapshotUrl: o.snapshot?.url ?? null,
      })),
  }));
}

export function presentDiscrepancies(ds: DiscrepancyData[]) {
  return ds.map((d) => {
    const view = discrepancyView(d);
    return {
      id: d._id,
      field: d.field,
      status: DISCREPANCY_STATUS[d.status],
      isOpen: view.isOpen,
      severity: DISCREPANCY_SEVERITY[d.severity],
      detectedAt: formatDate(d.detectedAt),
      notes: d.notes,
      resolution: d.resolvedAt ? { at: formatDate(d.resolvedAt), note: d.resolutionNote } : null,
      values: d.values.map((v) => ({
        key: v._key,
        source: SOURCE_KIND[v.sourceType],
        value: v.value,
        locator: v.locator,
        observedAt: v.observedAt ? formatDate(v.observedAt) : null,
        sourceId: v.source?._id ?? null,
        snapshotUrl: v.snapshotUrl,
      })),
      // Brand responses: public fields only. Contact address and respondent
      // name are never part of the read model.
      brandResponses: d.brandResponses.map((r) => ({
        id: r._id,
        respondedAt: r.respondedAt ? formatDate(r.respondedAt) : null,
        contactedAt: r.contactedAt ? formatDate(r.contactedAt) : null,
        respondentRole: r.respondentRole,
        response: r.response,
        statedResolution: r.resolution ? BRAND_RESOLUTION[r.resolution] : null,
        supportingSourceIds: r.supportingSources.map((s) => s._id),
      })),
      awaitingEditorialDecision: view.awaitingEditorialDecision,
    };
  });
}
