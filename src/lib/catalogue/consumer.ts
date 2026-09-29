import { convert } from '@/lib/calculations/units';
import { labelFacts, type ActiveFact } from '@/lib/comparison/label-facts';
import type { ContentGraph } from '@/lib/content/repository';
import type { IngredientDetail, ProductDetail } from '@/lib/content/types';
import { VEG } from '@/lib/editorial/meta';
import { formatDate } from '@/lib/formatting/dates';
import { baseCard, elementalIngredientKeys, type GoalCard } from '@/lib/goals/goals';

/**
 * Consumer comparison layer (docs/comparison.md).
 *
 * No quality score, rank, "best" or "worst". "Quality" is decomposed into
 * factual dimensions, each with its own plain value. A "match" is only a
 * summary of named factors, and every factor is shown next to it.
 */

// ─── Dimensions ──────────────────────────────────────────────────────────

export type DimensionState = 'ok' | 'attention' | 'info';
export interface Dimension {
  key:
    | 'disclosure'
    | 'label'
    | 'evidence'
    | 'serving'
    | 'price'
    | 'discrepancies'
    | 'veg'
    | 'freshness';
  label: string;
  value: string;
  state: DimensionState;
}

const STALE_PRICE_DAYS = 30;

export function productDimensions(p: ProductDetail, now = new Date()): Dimension[] {
  const f = labelFacts(p);
  const actives = f.actives;
  const disclosed = actives.filter((a) => a.compound || a.elemental || a.declared).length;
  const blend = actives.some((a) => a.blend);
  const claims = p.claims.filter((c) => c.status !== 'superseded').length;
  const priceAge = f.price ? (now.getTime() - Date.parse(f.price.observedAt)) / 86_400_000 : null;
  const captured = f.evidence.labelCapturedAt;
  return [
    {
      key: 'disclosure',
      label: 'Ingredient disclosure',
      value: !actives.length
        ? 'No actives recorded'
        : disclosed === actives.length
          ? 'Full'
          : blend
            ? `Partial: proprietary blend (${disclosed} of ${actives.length} amounts)`
            : `Partial (${disclosed} of ${actives.length} amounts)`,
      state: actives.length && disclosed === actives.length ? 'ok' : 'attention',
    },
    {
      key: 'label',
      label: 'Label verification',
      value:
        f.evidence.verification === 'label_verified'
          ? 'Verified'
          : f.evidence.verification === 'artwork_only'
            ? 'Label artwork only'
            : 'Not verified',
      state: f.evidence.verification === 'label_verified' ? 'ok' : 'attention',
    },
    {
      key: 'evidence',
      label: 'Evidence review',
      value: claims
        ? `Reviewed (${claims} claim${claims === 1 ? '' : 's'})`
        : 'No claims reviewed yet',
      state: claims ? 'ok' : 'info',
    },
    {
      key: 'serving',
      label: 'Serving clarity',
      value:
        f.serving && f.servingsPerPack
          ? 'Clear'
          : f.serving || f.servingText
            ? 'Serving stated; servings per pack not printed'
            : 'Not disclosed',
      state: f.serving && f.servingsPerPack ? 'ok' : 'attention',
    },
    {
      key: 'price',
      label: 'Price transparency',
      value: !f.price
        ? 'No price observed'
        : priceAge !== null && priceAge > STALE_PRICE_DAYS
          ? `Observed ${formatDate(f.price.observedAt)} (older than ${STALE_PRICE_DAYS} days)`
          : `Observed ${formatDate(f.price.observedAt)}`,
      state: f.price && priceAge !== null && priceAge <= STALE_PRICE_DAYS ? 'ok' : 'attention',
    },
    {
      key: 'discrepancies',
      label: 'Open discrepancies',
      value: String(f.discrepancies.length),
      state: f.discrepancies.length ? 'attention' : 'ok',
    },
    {
      key: 'veg',
      label: 'Vegetarian status',
      value: VEG[p.vegStatus].label,
      state: p.vegStatus === 'UNKNOWN' ? 'attention' : 'info',
    },
    {
      key: 'freshness',
      label: 'Source freshness',
      value: captured ? `Label captured ${formatDate(captured)}` : 'No dated label capture',
      state: captured ? 'info' : 'attention',
    },
  ];
}

// ─── Match (explained) ───────────────────────────────────────────────────

export interface MatchFactor {
  ok: boolean | null; // null = informational
  text: string;
}
export interface Match {
  level: 'Strong match' | 'Good match' | 'Limited information';
  /** Lower is closer; only used for the "Match" sort, always shown with its factors. */
  rank: 0 | 1 | 2;
  factors: MatchFactor[];
  explanation: string;
}

export function consumerMatch(card: GoalCard, ingredientName: string, others: string[]): Match {
  const amount = card.amounts.some((a) => a.value !== 'Not disclosed');
  const veg = card.vegStatus === 'VEGETARIAN' || card.vegStatus === 'VEGAN';
  const factors: MatchFactor[] = [
    { ok: true, text: `Contains ${ingredientName}` },
    { ok: amount, text: amount ? 'Amount disclosed' : 'Amount not disclosed' },
    {
      ok: card.labelVerified,
      text: card.labelVerified
        ? 'Label verified'
        : `Label not verified (${card.labelEvidence.toLowerCase()})`,
    },
    { ok: Boolean(card.price), text: card.price ? 'Price observed' : 'No price observed' },
    {
      ok: veg ? true : card.vegStatus === 'UNKNOWN' ? false : null,
      text: veg
        ? 'Vegetarian'
        : card.vegStatus === 'UNKNOWN'
          ? 'Veg status unknown'
          : 'Non-vegetarian',
    },
    ...(others.length
      ? [{ ok: null, text: `Also contains ${others.slice(0, 3).join(', ')}` }]
      : []),
  ];
  const strong = amount && card.labelVerified && Boolean(card.price);
  const level = strong ? 'Strong match' : amount ? 'Good match' : 'Limited information';
  return {
    level,
    rank: strong ? 0 : amount ? 1 : 2,
    factors,
    explanation: strong
      ? 'Amount disclosed, label verified and a price observed.'
      : amount
        ? 'Amount disclosed; some information is missing.'
        : 'The label does not disclose an amount for this ingredient.',
  };
}

// ─── Ingredient listing ──────────────────────────────────────────────────

export interface ConsumerCard extends GoalCard {
  dimensions: Dimension[];
  match: Match;
  forms: string[];
  /** Stated ELEMENTAL amount of the requested ingredient, in facets.elemental.unit. Never calculated. */
  elementalValue: number | null;
  /**
   * Stated COMPOUND amount (or, for ingredients without a compound/elemental
   * split, the declared amount), in facets.compound.unit.
   */
  compoundValue: number | null;
  /** The form the compound amount refers to (e.g. "Magnesium citrate"). */
  compoundForm: string | null;
  others: string[];
  verifiedAt: string | null;
}

export interface AmountFacet {
  unit: string;
  /** Present only when ≥2 products have distinct comparable values. */
  range: { min: number; max: number } | null;
  /** Filter/sort offered: ≥2 products have a value AND the values are comparable. */
  sortable: boolean;
}

export interface Facets {
  /** Elemental amounts: only figures the label states as elemental. */
  elemental: AmountFacet | null;
  /**
   * Compound (or declared) amounts. Comparable only when every product with a
   * value declares the SAME form: 400 mg oxide and 400 mg bisglycinate are not
   * the same amount of magnesium, so mixed forms → not sortable.
   */
  compound: (AmountFacet & { kind: 'compound' | 'declared'; form: string | null }) | null;
  forms: string[];
  veg: boolean;
  verified: boolean;
  evidence: boolean;
  brands: string[];
  single: boolean;
  price: boolean;
}

export interface IngredientListing {
  ingredient: Pick<IngredientDetail, '_id' | 'name' | 'slug'>;
  path: string;
  cards: ConsumerCard[];
  facets: Facets;
  goals: Array<{ slug: string; name: string }>;
  indexable: boolean;
}

/**
 * Two explicit amount dimensions, never mixed (docs/comparison.md):
 *   elemental — only figures the label itself states as elemental
 *   compound  — the compound weight with its form (or the declared amount for
 *               ingredients without a compound/elemental split)
 * A product without a value sorts last and is excluded by that amount filter.
 * A compound weight is never compared with an elemental amount.
 */
const elementalOf = (actives: ActiveFact[]) => actives.find((x) => x.elemental)?.elemental ?? null;
const compoundOf = (actives: ActiveFact[]) => {
  const a = actives.find((x) => x.compound) ?? actives.find((x) => x.declared);
  if (!a) return null;
  return a.compound
    ? { q: a.compound, form: a.form ?? a.printedName, kind: 'compound' as const }
    : { q: a.declared!, form: null, kind: 'declared' as const };
};
const commonUnit = (units: string[]) =>
  [...units].sort(
    (a, b) => units.filter((u) => u === b).length - units.filter((u) => u === a).length,
  )[0] ?? null;

export function ingredientListing(
  graph: ContentGraph,
  ingredient: IngredientDetail,
  now = new Date(),
): IngredientListing {
  const elementalKeys = elementalIngredientKeys(graph.products);
  const products = graph.products.filter((p) => ingredient.products.some((x) => x._id === p._id));
  const withFacts = products.map((p) => ({ p, f: labelFacts(p) }));
  // Each dimension's unit: the most common unit among its stated amounts.
  const mineOf = (f: (typeof withFacts)[number]['f']) =>
    f.actives.filter((a) => a.key === ingredient._id);
  const elementalUnit = commonUnit(
    withFacts.map(({ f }) => elementalOf(mineOf(f))?.unit).filter(Boolean) as string[],
  );
  const compoundUnit = commonUnit(
    withFacts.map(({ f }) => compoundOf(mineOf(f))?.q.unit).filter(Boolean) as string[],
  );
  const inUnit = (q: { amount: number; unit: string } | null, unit: string | null) =>
    q && unit ? convert(q.amount, q.unit as never, unit as never) : null;

  const cards: ConsumerCard[] = withFacts
    .map(({ p, f }) => {
      const mine = f.actives.filter((a) => a.key === ingredient._id);
      const others = [
        ...new Set(f.actives.filter((a) => a.key !== ingredient._id).map((a) => a.ingredient)),
      ];
      const base = baseCard(
        p,
        { actives: mine, names: [ingredient.name], keys: [ingredient.slug], why: [] },
        { now, elementalKeys },
      );
      const compound = compoundOf(mine);
      return {
        ...base,
        dimensions: productDimensions(p, now),
        match: consumerMatch(base, ingredient.name.toLowerCase(), others),
        forms: [...new Set(mine.map((a) => a.form).filter(Boolean) as string[])],
        elementalValue: inUnit(elementalOf(mine), elementalUnit),
        compoundValue: inUnit(compound?.q ?? null, compoundUnit),
        compoundForm: compound?.form ?? null,
        others,
        verifiedAt:
          f.evidence.verification === 'label_verified' ? f.evidence.labelCapturedAt : null,
      };
    })
    .sort(
      (a, b) =>
        a.match.rank - b.match.rank ||
        a.brand.localeCompare(b.brand) ||
        a.name.localeCompare(b.name),
    );

  const distinct = <T>(xs: T[]) => [...new Set(xs)];
  const facet = (values: Array<number | null>, unit: string | null, comparable = true) => {
    const xs = values.filter((x): x is number => x !== null);
    if (!xs.length || !unit) return null;
    const range = distinct(xs).length >= 2 ? { min: Math.min(...xs), max: Math.max(...xs) } : null;
    return { unit, range, sortable: comparable && xs.length >= 2 };
  };
  const withCompound = cards.filter((c) => c.compoundValue !== null);
  const compoundForms = distinct(withCompound.map((c) => c.compoundForm?.toLowerCase() ?? null));
  const compoundKind = withFacts.some(({ f }) => mineOf(f).some((a) => a.compound))
    ? ('compound' as const)
    : ('declared' as const);
  const compoundFacet = facet(
    cards.map((c) => c.compoundValue),
    compoundUnit,
    compoundForms.length === 1,
  );
  const forms = distinct(cards.flatMap((c) => c.forms)).sort();
  const vegValues = distinct(
    cards.map((c) => c.vegStatus === 'VEGETARIAN' || c.vegStatus === 'VEGAN'),
  );
  return {
    ingredient: { _id: ingredient._id, name: ingredient.name, slug: ingredient.slug },
    path: `/supplements/${ingredient.slug}`,
    cards,
    // Only facets that actually split this set of products.
    facets: {
      elemental: facet(
        cards.map((c) => c.elementalValue),
        elementalUnit,
      ),
      compound: compoundFacet && {
        ...compoundFacet,
        // Without a comparable set there is no meaningful range to filter on.
        range: compoundFacet.sortable ? compoundFacet.range : null,
        kind: compoundKind,
        form: compoundForms.length === 1 ? (withCompound[0]!.compoundForm ?? null) : null,
      },
      forms: forms.length >= 2 ? forms : [],
      veg: vegValues.length > 1,
      verified: distinct(cards.map((c) => c.labelVerified)).length > 1,
      evidence: distinct(cards.map((c) => c.claimsChecked > 0)).length > 1,
      brands:
        distinct(cards.map((c) => c.brand)).sort().length >= 2
          ? distinct(cards.map((c) => c.brand)).sort()
          : [],
      single: distinct(cards.map((c) => c.others.length === 0)).length > 1,
      price: cards.some((c) => c.price?.perServingValue != null),
    },
    goals: graph.goals
      .filter((g) => g.ingredients.some((gi) => gi.ingredient?._id === ingredient._id))
      .map((g) => ({ slug: g.slug, name: g.name })),
    indexable: cards.some((c) => !c.isDemo),
  };
}

/** Ingredients that get a listing page: published, with at least one published product. */
export function listingIngredients(graph: ContentGraph): IngredientDetail[] {
  return graph.ingredients.filter((i) => i.products.length > 0);
}
