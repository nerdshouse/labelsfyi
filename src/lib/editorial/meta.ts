import type { LabelVerification } from '@/lib/editorial/evidence';
import type {
  BrandResponseResolution,
  DiscrepancySeverity,
  DiscrepancyStatus,
  SourceKind,
  AssessmentStatus,
  ClaimType,
  ObservationType,
  PanelType,
  SourceType,
  VegStatus,
} from '@/lib/content/types';

/**
 * Display vocabulary for editorial enums. Wording is deliberately neutral:
 * labels.fyi describes evidence, it does not grade products.
 */

export const ASSESSMENT: Record<
  AssessmentStatus,
  { label: string; short: string; description: string }
> = {
  supported: {
    label: 'Supported',
    short: 'Supported',
    description: 'The label or cited evidence supports the claim as worded.',
  },
  partially_supported: {
    label: 'Partly supported',
    short: 'Partly',
    description: 'Part of the claim is supported; part is not, or it overstates the evidence.',
  },
  requires_context: {
    label: 'Needs context',
    short: 'Context',
    description: 'Broadly consistent with evidence, but depends on who you are and how it is used.',
  },
  not_verifiable: {
    label: 'Not verifiable',
    short: 'Unverifiable',
    description: 'Cannot be checked from the label or any source available to us.',
  },
  insufficient_evidence: {
    label: 'Limited evidence',
    short: 'Limited',
    description: 'The available research is too limited or inconsistent to support the claim.',
  },
};

export const ASSESSMENT_ORDER: AssessmentStatus[] = [
  'supported',
  'partially_supported',
  'requires_context',
  'insufficient_evidence',
  'not_verifiable',
];

export const CLAIM_TYPE: Record<ClaimType, string> = {
  performance: 'Performance',
  nutrition: 'Nutrition',
  health: 'Health',
  quality: 'Quality',
  purity: 'Purity',
  formulation: 'Formulation',
  manufacturing: 'Manufacturing',
  lifestyle: 'Lifestyle',
  other: 'Other',
};

export const VEG: Record<VegStatus, { label: string; short: string }> = {
  VEGETARIAN: { label: 'Vegetarian', short: 'Veg' },
  VEGAN: { label: 'Vegan', short: 'Vegan' },
  NON_VEGETARIAN: { label: 'Non-vegetarian', short: 'Non-veg' },
  UNKNOWN: { label: 'Veg status unknown', short: 'Unknown' },
};

export const SOURCE_TYPE: Record<SourceType, string> = {
  peer_reviewed_study: 'Peer-reviewed study',
  systematic_review: 'Systematic review',
  meta_analysis: 'Meta-analysis',
  government: 'Government',
  regulatory: 'Regulator',
  professional_organization: 'Professional body',
  manufacturer: 'Manufacturer',
  product_label: 'Product label',
  marketplace: 'Marketplace',
  other: 'Other',
};

export const PANEL_TYPE: Record<PanelType, string> = {
  nutrition: 'Nutrition information',
  supplement_facts: 'Supplement facts',
  ingredients: 'Ingredients',
  directions: 'Directions',
  warnings: 'Warnings',
  other: 'Label text',
};

export const OBSERVATION_TYPE: Record<ObservationType, string> = {
  serving_size: 'Serving size',
  servings_per_container: 'Servings',
  front_label_claim: 'Front label',
  ingredient_presence: 'Ingredient',
  veg_mark: 'Veg mark',
  price: 'Price',
  label_text: 'Label text',
  label_change: 'Label change',
  pack_size: 'Pack size',
  ingredient_amount: 'Ingredient amount',
  ingredient_form: 'Ingredient form',
  product_image: 'Image',
  other: 'Observation',
};

export const FORMAT_LABEL: Record<string, string> = {
  powder: 'Powder',
  capsule: 'Capsules',
  tablet: 'Tablets',
  softgel: 'Softgels',
  gummy: 'Gummies',
  liquid: 'Liquid',
  bar: 'Bar',
  sachet: 'Sachets',
  other: 'Other',
};

// ─── Provenance vocabulary (neutral wording) ─────────────────────────────

export const SOURCE_KIND: Record<SourceKind, string> = {
  PHYSICAL_PACK: 'Pack',
  BRAND_SUPPLIED_LABEL: 'Brand label file',
  PRODUCT_ARTWORK: 'Label artwork',
  BRAND_WEBSITE: 'Brand website',
  MARKETPLACE: 'Marketplace',
  MARKETING_COPY: 'Marketing copy',
  OTHER: 'Other source',
};

export const LABEL_VERIFICATION: Record<LabelVerification, { label: string; description: string }> =
  {
    label_verified: {
      label: 'Label verified',
      description: 'Transcribed from the pack or a brand-supplied label file.',
    },
    artwork_only: {
      label: 'Artwork only',
      description: 'Transcribed from confirmed label artwork; not yet checked against a pack.',
    },
    no_label_evidence: {
      label: 'No label evidence',
      description: 'No acceptable label evidence captured yet.',
    },
  };

export const DISCREPANCY_STATUS: Record<DiscrepancyStatus, string> = {
  OPEN: 'Open',
  AWAITING_BRAND: 'Awaiting brand',
  BRAND_RESPONDED: 'Brand responded',
  RESOLVED: 'Resolved',
  UNRESOLVED: 'Unresolved',
  SUPERSEDED: 'Superseded',
};

/** Attention level only; never a judgement of intent. */
export const DISCREPANCY_SEVERITY: Record<DiscrepancySeverity, string> = {
  INFORMATIONAL: 'Informational',
  MATERIAL: 'Material',
  HIGH_ATTENTION: 'High attention',
};

export const BRAND_RESOLUTION: Record<BrandResponseResolution, string> = {
  WEBSITE_CORRECTED: 'Website corrected',
  LABEL_CONFIRMED: 'Label confirmed',
  FORMULATION_CHANGE: 'Formulation change',
  PACKAGING_CHANGE: 'Packaging change',
  BOTH_CORRECT_DIFFERENT_VERSIONS: 'Both correct (different versions)',
  UNRESOLVED: 'Unresolved',
  OTHER: 'Other',
};
