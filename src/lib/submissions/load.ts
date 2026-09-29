import { IDENTITY_QUERY, identityRecords, readiness, suggestProducts, type Check } from './review';
import type { Doc, DocStore } from './store';
import type { LabelSubmission } from './types';
import type { MatchResult } from '@/lib/identity/match';

export const LIST_QUERY = `*[_type == "labelSubmission"] | order(submittedAt desc) {
  _id, status, submittedAt, brand, productName, variant, "imageCount": count(images),
  "product": product->{ name, workflowStatus }
}`;

export interface ReviewData {
  submission: LabelSubmission;
  candidate: Doc | null;
  product: Doc | null;
  brand: Doc | null;
  suggestions: Array<MatchResult & { name: string; brand: string | null }>;
  products: Array<{ _id: string; name: string; brand: string | null; variant: string | null }>;
  brands: Array<{ _id: string; name: string }>;
  categories: Array<{ _id: string; name: string }>;
  ingredients: Array<{ _id: string; name: string; forms: string[] }>;
  currentPanels: Doc[];
  packObservations: Doc[];
  reviews: Array<{ status?: string; reviewedAt?: string }>;
  checks: Check[];
  takenIds: Set<string>;
}

/** `lookupGtin`: a barcode the reviewer typed in, to check for an exact match before deciding. */
export async function loadReview(
  store: DocStore,
  id: string,
  lookupGtin: string | null = null,
): Promise<ReviewData | null> {
  const submission = await store.get<LabelSubmission & Doc>(id);
  if (!submission || submission._type !== 'labelSubmission') return null;
  const candidate = await store.get<Doc>(`candidate.${id}`);
  const productId = submission.product?._ref ?? null;
  const data = await store.query<{
    product: Doc | null;
    brands: ReviewData['brands'];
    categories: ReviewData['categories'];
    ingredients: ReviewData['ingredients'];
    currentPanels: Doc[];
    packObservations: Doc[];
    reviews: ReviewData['reviews'];
    ids: string[];
    identity: Parameters<typeof identityRecords>[0];
  }>(
    `{
      "product": *[_id == $productId][0],
      "brands": *[_type == "brand"] | order(name asc) { _id, name },
      "categories": *[_type == "category"] | order(name asc) { _id, name },
      "ingredients": *[_type == "ingredient"] | order(name asc) { _id, name, "forms": coalesce(forms[].name, []) },
      "currentPanels": *[_type == "labelPanel" && product._ref == $productId && status == "current"],
      "packObservations": *[_type == "observation" && extractedFrom._ref == $candidateId],
      "reviews": *[_type == "editorialReview" && content._ref == $productId]{ status, reviewedAt },
      "ids": *[]._id,
      "identity": ${IDENTITY_QUERY}
    }`,
    { productId: productId ?? '', candidateId: `candidate.${id}` },
  );
  const records = identityRecords(data.identity);
  const suggestions = suggestProducts(
    submission,
    records,
    lookupGtin ?? (candidate?.gtin as string | undefined) ?? null,
  ).map((m) => {
    const r = records.find((x) => x.id === m.existingId)!;
    return { ...m, name: r.name, brand: r.brand };
  });
  const product = data.product;
  const brand = product?.brand
    ? await store.get<Doc>((product.brand as { _ref: string })._ref)
    : null;
  return {
    submission,
    candidate,
    product,
    brand,
    suggestions,
    products: data.identity.products.map((p) => ({
      _id: p._id,
      name: p.name,
      brand: p.brand,
      variant: p.variant,
    })),
    brands: data.brands,
    categories: data.categories,
    ingredients: data.ingredients,
    currentPanels: data.currentPanels,
    packObservations: data.packObservations,
    reviews: data.reviews,
    checks: readiness({
      submission,
      candidate,
      product,
      packObservations: data.packObservations,
      currentPanels: data.currentPanels,
    }),
    takenIds: new Set(data.ids),
  };
}
