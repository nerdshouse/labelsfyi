import type { ProductDetail } from '@/lib/content/types';
import { panelEvidence } from '@/lib/editorial/evidence';
import { latestReview, reviewState } from '@/lib/editorial/review';
import { activeRows, ingredientAmounts } from './ingredients';
import { discrepancyView } from './discrepancy';

/**
 * The product-decoder shape a future product page renders:
 * identity → serving → ingredients → label evidence → website vs pack
 * observations → claims → discrepancies (+ brand responses) → prices → review.
 * Pure re-shaping of the already-filtered read model.
 */
const WEB_SOURCES = new Set(['BRAND_WEBSITE', 'MARKETPLACE', 'MARKETING_COPY']);
const PACK_SOURCES = new Set(['PHYSICAL_PACK', 'BRAND_SUPPLIED_LABEL', 'PRODUCT_ARTWORK']);

export function productDecoder(p: ProductDetail) {
  const current = p.panels.filter((x) => x.isCurrent);
  return {
    identity: {
      _id: p._id,
      name: p.name,
      variant: p.variant,
      brand: p.brand,
      category: p.category,
      format: p.format,
      manufacturer: p.manufacturer,
      countryOfOrigin: p.countryOfOrigin,
      isDemo: p.isDemo,
    },
    serving: {
      spec: p.serving,
      text: p.servingSizeText,
      servingsPerContainer: p.servingsPerContainer,
    },
    ingredients: activeRows(p).map((r) => ({
      canonicalIngredient: r.ingredient,
      displayName: r.displayName,
      form: r.form,
      ...ingredientAmounts(r),
      elementalBasis: r.elementalBasis,
      proprietaryBlend: r.proprietaryBlend ? r.blendName : null,
      sourceLocator: r.sourceLocator,
      editorialNote: r.editorialNote,
    })),
    labelEvidence: current.map((x) => ({
      panelId: x._id,
      panelType: x.panelType,
      sourceType: x.sourceType,
      evidence: panelEvidence(x),
      image: x.imageEvidence,
      capturedAt: x.capturedAt,
      capturedBy: x.capturedBy,
      source: x.source,
    })),
    websiteObservations: p.observations.filter(
      (o) => o.sourceType && WEB_SOURCES.has(o.sourceType),
    ),
    packObservations: p.observations.filter((o) => o.sourceType && PACK_SOURCES.has(o.sourceType)),
    claims: p.claims,
    discrepancies: p.discrepancies.map((d) => ({ ...d, view: discrepancyView(d) })),
    priceHistory: [...p.prices].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
    editorialReview: { latest: latestReview(p), state: reviewState(p) },
  };
}
