import type { LabelPanelData, ProductDetail } from '@/lib/content/types';

/**
 * Label-evidence rules. Web content is discovery/input; label evidence and
 * verified observations are the basis for published product facts.
 *
 *   strong      physical pack, brand-supplied label file, or a confirmed photo of the pack
 *   provisional confirmed print artwork of this exact product
 *   rejected    web/marketing sources, unclassified or unconfirmed images,
 *               marketing graphics, re-typeset tables, another product's image
 *
 * Rejected panels are never rendered.
 */
export type PanelEvidence = 'strong' | 'provisional' | 'rejected';

export function panelEvidence(
  panel: Pick<LabelPanelData, 'sourceType' | 'imageEvidence'>,
): PanelEvidence {
  const img = panel.imageEvidence;
  if (img) {
    // An image filename or gallery position is not proof of identity.
    if (img.depictsExactProduct !== 'CONFIRMED') return 'rejected';
    if (img.imageKind === 'PACK_PHOTO') return 'strong';
    if (img.imageKind === 'PRINT_ARTWORK') return 'provisional';
    return 'rejected';
  }
  switch (panel.sourceType) {
    case 'PHYSICAL_PACK':
    case 'BRAND_SUPPLIED_LABEL':
      return 'strong';
    // Artwork must point at a classified, confirmed image; web copy is never label evidence.
    default:
      return 'rejected';
  }
}

export const isPublishablePanel = (panel: Pick<LabelPanelData, 'sourceType' | 'imageEvidence'>) =>
  panelEvidence(panel) !== 'rejected';

export type LabelVerification = 'label_verified' | 'artwork_only' | 'no_label_evidence';

/** Product-level label verification, from its current publishable panels. */
export function labelVerification(p: Pick<ProductDetail, 'panels'>): LabelVerification {
  const current = p.panels.filter((x) => x.isCurrent).map(panelEvidence);
  if (current.includes('strong')) return 'label_verified';
  if (current.includes('provisional')) return 'artwork_only';
  return 'no_label_evidence';
}
