import { referencePrice } from '@/lib/calculations';
import { offerHref, offerRel, isCommercial, usableOffers } from '@/lib/affiliates';
import { labelFacts, type ActiveFact } from '@/lib/comparison/label-facts';
import { NOT_DISCLOSED } from '@/lib/comparison/present';
import type { ContentGraph } from '@/lib/content/repository';
import type {
  GoalDetail,
  GoalIngredientData,
  ImageData,
  ProductDetail,
  ProductGoalData,
  VegStatus,
} from '@/lib/content/types';
import { labelVerification } from '@/lib/editorial/evidence';
import { inlineName } from '@/lib/editorial/product';
import { formatDate } from '@/lib/formatting/dates';
import { formatMoney } from '@/lib/formatting/money';
import { formatQuantity } from '@/lib/formatting/quantity';
import { formatServing } from '@/lib/identity/serving';
import { buildReceipt } from '@/lib/receipt/receipt';

/**
 * Goal discovery: goal → common ingredients → products (docs/goals.md).
 *
 * A goal is a consumer discovery category ("products marketed for sleep
 * support"), never a diagnosis or an efficacy claim. Products appear only
 * through approved, sourced relationships (the graph already dropped
 * everything else); nothing here infers membership from ingredients.
 * Cards show facts only: no score, rank, "best" or recommendation. Default
 * order is alphabetical by brand, then product.
 */

// ─── Slugs & lookup ──────────────────────────────────────────────────────

/** "Hair & Skin" → "hair-skin", " Gut  Health " → "gut-health". */
export function normalizeGoalSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A published goal by slug or name ("sleep", "Gut Health", "hair & skin"). */
export function findGoal(graph: Pick<ContentGraph, 'goals'>, query: string): GoalDetail | null {
  const q = normalizeGoalSlug(query);
  if (!q) return null;
  return graph.goals.find((g) => g.slug === q || normalizeGoalSlug(g.name) === q) ?? null;
}

// ─── Ingredient matching (display only, never membership) ─────────────────

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** The goal ingredients a product's label actually lists. */
export function matchedIngredients(goal: GoalDetail, actives: ActiveFact[]): GoalIngredientData[] {
  return goal.ingredients.filter((gi) =>
    actives.some(
      (a) =>
        (gi.ingredient && a.key === gi.ingredient._id) ||
        gi.matchNames.some((m) => norm(a.ingredient) === norm(m) || a.key === `name:${norm(m)}`),
    ),
  );
}
const activesFor = (gi: GoalIngredientData, actives: ActiveFact[]) =>
  actives.filter(
    (a) =>
      (gi.ingredient && a.key === gi.ingredient._id) ||
      gi.matchNames.some((m) => norm(a.ingredient) === norm(m) || a.key === `name:${norm(m)}`),
  );

export const ingredientKey = (gi: GoalIngredientData) =>
  gi.ingredient?.slug ?? normalizeGoalSlug(gi.name);

// ─── Product cards ───────────────────────────────────────────────────────

export interface BuyLink {
  label: string;
  merchant: string;
  href: string;
  rel: string;
  affiliate: boolean;
  official: boolean;
  /** Price at this merchant, from a dated observation, when one exists. */
  price: string | null;
  observedAt: string | null;
}

export interface GoalCard {
  slug: string;
  href: string;
  receiptHref: string | null;
  brand: string;
  name: string;
  variant: string | null;
  format: string;
  vegStatus: VegStatus;
  /** Only images with a display basis survive the graph; else null → neutral tile. */
  image: ImageData | null;
  keyIngredients: string[];
  /** Keys of goal ingredients on this label (for the ingredient filter). */
  ingredientKeys: string[];
  serving: string;
  amounts: Array<{ label: string; value: string; kind: 'compound' | 'elemental' | 'declared' }>;
  price: {
    amount: string;
    perServing: string | null;
    perServingValue: number | null;
    currency: string;
    merchant: string;
    observedAt: string;
  } | null;
  labelVerified: boolean;
  labelEvidence: 'Label verified' | 'Artwork only' | 'No label evidence';
  claimsChecked: number;
  openDiscrepancies: number;
  brandResponse: boolean;
  why: string[];
  buy: BuyLink[];
  isDemo: boolean;
}

export const BASIS_TEXT = (r: ProductGoalData, goalName: string) => {
  const where = [r.sourceLocator, r.observedAt ? `observed ${formatDate(r.observedAt)}` : null]
    .filter(Boolean)
    .join(', ');
  const goal = goalName.toLowerCase();
  switch (r.basis) {
    case 'BRAND_MARKETING':
      return `Marketed by the brand for ${goal} support${r.statement ? `: “${r.statement}”` : ''}${where ? ` (${where})` : ''}.`;
    case 'RETAILER_LISTING':
      return `Listed by a retailer under ${goalName}${r.statement ? `: “${r.statement}”` : ''}${where ? ` (${where})` : ''}. This is the retailer’s categorisation, not the brand’s.`;
    case 'EDITORIAL_CLASSIFICATION':
      return `Classified under ${goalName} by labels.fyi editors${r.statement ? `: ${r.statement}` : ''}.`;
    case 'INGREDIENT_MATCH':
      return `Listed because its label includes an ingredient commonly found in products marketed for ${goal} support (editorially approved).`;
  }
};

export function buyLinks(p: ProductDetail, now: Date): BuyLink[] {
  const byMerchant = new Map(
    [...p.prices]
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
      .map((s) => [s.merchant._id, s] as const)
      .reverse(),
  );
  return usableOffers(p.offers, now)
    .map((o) => {
      const official = o.merchant.kind === 'OFFICIAL_STORE' && o.merchant.brand === p.brand._id;
      const snap = byMerchant.get(o.merchant._id) ?? null;
      return {
        label: official ? 'Buy from brand' : `Buy at ${o.merchant.name}`,
        merchant: o.merchant.name,
        href: offerHref(o),
        rel: offerRel(o),
        affiliate: isCommercial(o),
        official,
        price: snap ? formatMoney({ amount: snap.price, currency: snap.currency }) : null,
        observedAt: snap ? formatDate(snap.capturedAt) : null,
      };
    })
    .sort(
      (a, b) => Number(b.official) - Number(a.official) || a.merchant.localeCompare(b.merchant),
    );
}

/**
 * Ingredient keys that some published label declares an elemental amount for
 * (minerals such as magnesium). Only for these does a card show an
 * "Elemental … Not disclosed" line; never for extracts like ashwagandha.
 */
export function elementalIngredientKeys(products: ProductDetail[]): Set<string> {
  return new Set(
    products.flatMap((p) =>
      labelFacts(p)
        .actives.filter((a) => a.elemental)
        .map((a) => a.key),
    ),
  );
}

/** Amount lines for the given actives; compound and elemental never mixed. */
export function amountLines(
  actives: ActiveFact[],
  elementalKeys: Set<string>,
): GoalCard['amounts'] {
  // For ingredients labels do declare elementally, a missing elemental amount
  // reads "Not disclosed" rather than disappearing.
  const amounts: GoalCard['amounts'] = [];
  for (const a of actives) {
    const ing = inlineName(a.ingredient);
    if (a.compound)
      amounts.push({
        kind: 'compound',
        label: `${a.ingredient} (compound)`,
        value: `${formatQuantity(a.compound)} ${inlineName(a.form ?? a.printedName)}`,
      });
    if (a.elemental || (a.compound && elementalKeys.has(a.key)))
      amounts.push({
        kind: 'elemental',
        label: `Elemental ${ing}`,
        value: a.elemental ? formatQuantity(a.elemental) : NOT_DISCLOSED,
      });
    if (!a.compound && !a.elemental)
      amounts.push({
        kind: 'declared',
        label: a.ingredient,
        value: a.declared ? formatQuantity(a.declared) : NOT_DISCLOSED,
      });
  }
  return amounts;
}

/** Card facts shared by goal pages and ingredient listings. */
export function baseCard(
  p: ProductDetail,
  focus: { actives: ActiveFact[]; names: string[]; keys: string[]; why: string[] },
  opts: { now?: Date; elementalKeys?: Set<string> } = {},
): GoalCard {
  const now = opts.now ?? new Date();
  const f = labelFacts(p);
  const snap = referencePrice(p);
  const per = f.price?.perServing ?? null;
  const verification = labelVerification(p);
  return {
    slug: p.slug,
    href: `/products/${p.slug}`,
    receiptHref: buildReceipt(p) ? `/receipt/${p.slug}` : null,
    brand: p.brand.name,
    name: p.name,
    variant: p.variant,
    format: p.format,
    vegStatus: p.vegStatus,
    image: p.labelImages[0] ?? p.image ?? null,
    keyIngredients: [
      ...new Set([
        ...focus.names,
        ...f.actives.filter((a) => a.isKeyActive).map((a) => a.ingredient),
      ]),
    ].slice(0, 4),
    ingredientKeys: focus.keys,
    serving: formatServing(f.serving) ?? f.servingText ?? NOT_DISCLOSED,
    amounts: amountLines(focus.actives, opts.elementalKeys ?? new Set()),
    price:
      snap && f.price
        ? {
            amount: formatMoney({ amount: f.price.amount, currency: f.price.currency }),
            perServing: per ? formatMoney(per, { precise: true }) : null,
            perServingValue: per && per.currency === 'INR' ? per.amount : null,
            currency: f.price.currency,
            merchant: f.price.merchant,
            observedAt: formatDate(f.price.observedAt),
          }
        : null,
    labelVerified: verification === 'label_verified',
    labelEvidence:
      verification === 'label_verified'
        ? 'Label verified'
        : verification === 'artwork_only'
          ? 'Artwork only'
          : 'No label evidence',
    claimsChecked: p.claims.filter((c) => c.status !== 'superseded').length,
    openDiscrepancies: f.discrepancies.length,
    brandResponse: p.discrepancies.some((d) => d.brandResponses.length > 0),
    why: focus.why,
    buy: buyLinks(p, now),
    isDemo: p.isDemo,
  };
}

export function goalCard(
  p: ProductDetail,
  goal: GoalDetail,
  opts: { now?: Date; elementalKeys?: Set<string> } = {},
): GoalCard {
  const f = labelFacts(p);
  const matched = matchedIngredients(goal, f.actives);
  const relationships = goal.memberships.find((m) => m.productId === p._id)?.relationships ?? [];
  const why = [
    ...(matched.length
      ? [
          `Label lists ${matched
            .map((m) => inlineName(m.name))
            .join(
              ' and ',
            )}, commonly found in products marketed for ${goal.name.toLowerCase()} support.`,
        ]
      : []),
    ...relationships.map((r) => BASIS_TEXT(r, goal.name)),
  ];
  return baseCard(
    p,
    {
      actives: matched.flatMap((gi) => activesFor(gi, f.actives)),
      names: matched.map((m) => m.name),
      keys: matched.map(ingredientKey),
      why,
    },
    opts,
  );
}

// ─── Goal page ───────────────────────────────────────────────────────────

export interface GoalView {
  goal: GoalDetail;
  path: string;
  chips: Array<{
    key: string;
    name: string;
    href: string | null;
    relation: GoalIngredientData['relation'];
    count: number;
  }>;
  cards: GoalCard[];
  /** Indexable only with real published products (no thin/empty pages). */
  indexable: boolean;
}

export function goalView(graph: ContentGraph, goal: GoalDetail, now = new Date()): GoalView {
  const products = new Map(graph.products.map((p) => [p._id, p]));
  const elementalKeys = elementalIngredientKeys(graph.products);
  const cards = goal.memberships
    .map((m) => products.get(m.productId))
    .filter((p): p is ProductDetail => Boolean(p))
    .map((p) => goalCard(p, goal, { now, elementalKeys }))
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
  const liveIngredients = new Set(graph.ingredients.map((i) => i._id));
  return {
    goal,
    path: `/${goal.slug}`,
    chips: goal.ingredients.map((gi) => ({
      key: ingredientKey(gi),
      name: gi.name,
      href:
        gi.ingredient && liveIngredients.has(gi.ingredient._id)
          ? `/ingredients/${gi.ingredient.slug}`
          : null,
      relation: gi.relation,
      count: cards.filter((c) => c.ingredientKeys.includes(ingredientKey(gi))).length,
    })),
    cards,
    indexable: cards.length > 0 && !goal.noindex,
  };
}

/** Pairs of cards that share the goal's first common ingredient (for Compare links). */
export function comparePartners(view: GoalView, slug: string): GoalCard[] {
  const me = view.cards.find((c) => c.slug === slug);
  if (!me) return [];
  return view.cards.filter(
    (c) => c.slug !== slug && c.ingredientKeys.some((k) => me.ingredientKeys.includes(k)),
  );
}

/** Goal pages for the sitemap: published (graph), reviewed, non-demo, non-empty. */
export function goalSitemapPaths(
  graph: Pick<ContentGraph, 'goals' | 'products'>,
): Array<{ path: string; lastmod: string }> {
  const live = new Set(graph.products.filter((p) => !p.isDemo && !p.noindex).map((p) => p._id));
  return graph.goals
    .filter((g) => !g.isDemo && !g.noindex && g.memberships.some((m) => live.has(m.productId)))
    .map((g) => ({ path: `/${g.slug}`, lastmod: g._updatedAt.slice(0, 10) }));
}
