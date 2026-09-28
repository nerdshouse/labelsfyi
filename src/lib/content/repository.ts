import { groq } from './client';
import {
  BRANDS_QUERY,
  CATEGORIES_QUERY,
  COMPARISONS_QUERY,
  GUIDES_QUERY,
  INGREDIENTS_QUERY,
  PRODUCTS_QUERY,
  REVIEWERS_QUERY,
} from './queries';
import type {
  BrandDetail,
  CategoryData,
  CategoryDetail,
  ComparisonDetail,
  ComparisonSummary,
  GuideDetail,
  GuideSummary,
  IngredientDetail,
  IngredientSummary,
  LabelIngredientRow,
  LabelNutrientRow,
  ProductDetail,
  ProductSummary,
  Ref,
  ReviewerDetail,
} from './types';

/**
 * Content repository.
 *
 * Loads each document type once per build with a bulk GROQ query, then
 * resolves the internal-linking graph (product ↔ ingredient ↔ comparison ↔
 * guide) in TypeScript. Pages import from here and never run GROQ directly.
 */

type RawProduct = Omit<
  ProductDetail,
  'keyActives' | 'keyNutrients' | 'ingredients' | 'comparisons' | 'related' | 'guides'
>;
type RawIngredient = Omit<IngredientDetail, 'products' | 'comparisons' | 'guides'>;
type RawGuide = Omit<GuideDetail, 'ingredients' | 'products' | 'comparisons'> & {
  ingredientIds: string[];
  productIds: string[];
};
type RawComparison = Omit<ComparisonDetail, 'products' | 'guides' | 'productCount'> & {
  productIds: string[];
};
type RawBrand = Omit<BrandDetail, 'products'>;
type RawCategory = CategoryData & { isDemo: boolean };

export interface ContentGraph {
  products: ProductDetail[];
  ingredients: IngredientDetail[];
  guides: GuideDetail[];
  comparisons: ComparisonDetail[];
  brands: BrandDetail[];
  categories: CategoryDetail[];
  reviewers: ReviewerDetail[];
}

const KEY_NUTRIENTS = new Set(['protein']);

const unique = <T>(items: T[], by: (t: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((t) => (seen.has(by(t)) ? false : (seen.add(by(t)), true)));
};

function currentPanels(p: RawProduct) {
  return p.panels.filter((panel) => panel.isCurrent);
}

function keyActives(p: RawProduct): LabelIngredientRow[] {
  return currentPanels(p).flatMap((panel) => panel.ingredients.filter((row) => row.isKeyActive));
}

function keyNutrients(p: RawProduct): LabelNutrientRow[] {
  return currentPanels(p).flatMap((panel) =>
    panel.nutrients.filter((n) => n.nutrientKey !== null && KEY_NUTRIENTS.has(n.nutrientKey)),
  );
}

function ingredientRefs(p: RawProduct): Array<Ref & { _id: string }> {
  const refs = currentPanels(p).flatMap((panel) =>
    panel.ingredients.flatMap((row) => (row.ingredient ? [row.ingredient] : [])),
  );
  return unique(refs, (r) => r._id);
}

function toProductSummary(p: RawProduct | ProductDetail): ProductSummary {
  return {
    _id: p._id,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    category: p.category,
    format: p.format,
    vegStatus: p.vegStatus,
    servingSize: p.servingSize,
    servingSizeText: p.servingSizeText,
    servingsPerContainer: p.servingsPerContainer,
    image: p.image,
    keyActives: 'keyActives' in p ? p.keyActives : keyActives(p),
    keyNutrients: 'keyNutrients' in p ? p.keyNutrients : keyNutrients(p),
    prices: p.prices,
    lastVerifiedAt: p.lastVerifiedAt,
    featured: p.featured,
    isDemo: p.isDemo,
  };
}

const toGuideSummary = (g: RawGuide): GuideSummary => ({
  _id: g._id,
  title: g.title,
  slug: g.slug,
  dek: g.dek,
  publishedAt: g.publishedAt,
  isDemo: g.isDemo,
});

const toComparisonSummary = (c: RawComparison, productCount: number): ComparisonSummary => ({
  _id: c._id,
  title: c.title,
  slug: c.slug,
  dek: c.dek,
  productCount,
  isDemo: c.isDemo,
});

const toIngredientSummary = (i: RawIngredient): IngredientSummary => ({
  _id: i._id,
  name: i.name,
  slug: i.slug,
  summary: i.summary,
  commonLabelNames: i.commonLabelNames,
  featured: i.featured,
  isDemo: i.isDemo,
});

export interface RawContent {
  products: RawProduct[];
  ingredients: RawIngredient[];
  guides: RawGuide[];
  comparisons: RawComparison[];
  brands: RawBrand[];
  categories: RawCategory[];
  reviewers: ReviewerDetail[];
}

/** Fetch every live document once. */
export async function fetchRawContent(): Promise<RawContent> {
  const [products, ingredients, guides, comparisons, brands, categories, reviewers] =
    await Promise.all([
      groq<RawProduct[]>(PRODUCTS_QUERY),
      groq<RawIngredient[]>(INGREDIENTS_QUERY),
      groq<RawGuide[]>(GUIDES_QUERY),
      groq<RawComparison[]>(COMPARISONS_QUERY),
      groq<RawBrand[]>(BRANDS_QUERY),
      groq<RawCategory[]>(CATEGORIES_QUERY),
      groq<ReviewerDetail[]>(REVIEWERS_QUERY),
    ]);
  return { products, ingredients, guides, comparisons, brands, categories, reviewers };
}

/**
 * Health content must carry an approved review to render, even if its
 * workflow status says Published. This is the site-side backstop for the
 * Studio publish gate (see docs/editorial-workflow.md).
 */
const hasApprovedReview = (doc: { reviews: unknown[] }) => doc.reviews.length > 0;

/** Pure: resolve the internal-linking graph from raw query results. */
export function assembleGraph(raw: RawContent): ContentGraph {
  const rawBrands = raw.brands;
  const rawCategories = raw.categories;
  const reviewers = raw.reviewers;
  const rawIngredients = raw.ingredients.filter(hasApprovedReview);
  const rawGuides = raw.guides.filter(hasApprovedReview);
  const rawComparisons = raw.comparisons.filter(hasApprovedReview);
  const rawProducts = raw.products.filter(hasApprovedReview);

  // Products whose brand is not live are not rendered: the brand link would 404.
  const liveBrandIds = new Set(rawBrands.map((b) => b._id));
  const liveProducts = rawProducts.filter((p) => p.brand && liveBrandIds.has(p.brand._id));

  const summaries = new Map(liveProducts.map((p) => [p._id, toProductSummary(p)]));
  const ingredientIdsByProduct = new Map(
    liveProducts.map((p) => [p._id, new Set(ingredientRefs(p).map((r) => r._id))]),
  );

  const comparisonSummaries = rawComparisons.map((c) => {
    const productIds = c.productIds.filter((id) => summaries.has(id));
    return { raw: c, productIds, summary: toComparisonSummary(c, productIds.length) };
  });

  const guideLinksTo = (g: RawGuide, productId: string) =>
    g.productIds.includes(productId) ||
    g.ingredientIds.some((id) => ingredientIdsByProduct.get(productId)?.has(id));

  const products: ProductDetail[] = liveProducts.map((p) => {
    const summary = summaries.get(p._id)!;
    return {
      ...p,
      keyActives: summary.keyActives,
      keyNutrients: summary.keyNutrients,
      ingredients: ingredientRefs(p),
      comparisons: comparisonSummaries
        .filter((c) => c.productIds.includes(p._id))
        .map((c) => c.summary),
      related: liveProducts
        .filter((o) => o._id !== p._id && o.category?._id === p.category?._id)
        .slice(0, 4)
        .map((o) => summaries.get(o._id)!),
      guides: rawGuides.filter((g) => guideLinksTo(g, p._id)).map(toGuideSummary),
    };
  });

  const ingredients: IngredientDetail[] = rawIngredients.map((i) => {
    const productIds = liveProducts
      .filter((p) => ingredientIdsByProduct.get(p._id)?.has(i._id))
      .map((p) => p._id);
    return {
      ...i,
      products: productIds.map((id) => summaries.get(id)!),
      comparisons: comparisonSummaries
        .filter(
          (c) =>
            c.raw.doseBasis?.ingredient?._id === i._id ||
            c.productIds.some((id) => productIds.includes(id)),
        )
        .map((c) => c.summary),
      guides: rawGuides.filter((g) => g.ingredientIds.includes(i._id)).map(toGuideSummary),
    };
  });

  const ingredientSummaries = new Map(rawIngredients.map((i) => [i._id, toIngredientSummary(i)]));

  const guides: GuideDetail[] = rawGuides.map((g) => ({
    ...g,
    ingredients: g.ingredientIds.flatMap((id) => ingredientSummaries.get(id) ?? []),
    products: g.productIds.flatMap((id) => summaries.get(id) ?? []),
    comparisons: comparisonSummaries
      .filter(
        (c) =>
          (c.raw.doseBasis?.ingredient &&
            g.ingredientIds.includes(c.raw.doseBasis.ingredient._id)) ||
          c.productIds.some((id) => g.productIds.includes(id)),
      )
      .map((c) => c.summary),
  }));

  const comparisons: ComparisonDetail[] = comparisonSummaries.map(
    ({ raw, productIds, summary }) => ({
      ...raw,
      productCount: summary.productCount,
      products: productIds.map((id) => summaries.get(id)!),
      guides: guides
        .filter((g) => g.comparisons.some((c) => c._id === raw._id))
        .map((g) => toGuideSummary({ ...g, ingredientIds: [], productIds: [] })),
    }),
  );

  const brands: BrandDetail[] = rawBrands.map((b) => ({
    ...b,
    products: liveProducts.filter((p) => p.brand._id === b._id).map((p) => summaries.get(p._id)!),
  }));

  const categories: CategoryDetail[] = rawCategories.map((c) => ({
    ...c,
    products: liveProducts
      .filter((p) => p.category?._id === c._id)
      .map((p) => summaries.get(p._id)!),
    comparisons: comparisonSummaries
      .filter((cmp) => cmp.raw.category?._id === c._id)
      .map((cmp) => cmp.summary),
  }));

  return { products, ingredients, guides, comparisons, brands, categories, reviewers };
}

let graphPromise: Promise<ContentGraph> | undefined;

/** The full, resolved content graph. Memoised for the lifetime of a build. */
export function getContentGraph(): Promise<ContentGraph> {
  graphPromise ??= fetchRawContent().then(assembleGraph);
  return graphPromise;
}

export { toProductSummary };
