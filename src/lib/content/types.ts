/**
 * Shapes returned by the content repository (GROQ projections).
 *
 * These are the *read* models the site renders. The *write* models live in the
 * Sanity schemas (sanity/schemas). Keep the two aligned; docs/data-model.md
 * describes both.
 */

import type { ServingSpec, ServingUnit } from '@/lib/identity/serving';

// ─── Enumerations ─────────────────────────────────────────────────────────

export const VEG_STATUSES = ['VEGETARIAN', 'NON_VEGETARIAN', 'VEGAN', 'UNKNOWN'] as const;
export type VegStatus = (typeof VEG_STATUSES)[number];

export const WORKFLOW_STATUSES = [
  'DRAFT',
  'FACT_CHECK',
  'DIETITIAN_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'NEEDS_REVIEW',
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const ASSESSMENT_STATUSES = [
  'supported',
  'partially_supported',
  'requires_context',
  'not_verifiable',
  'insufficient_evidence',
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const CLAIM_TYPES = [
  'performance',
  'nutrition',
  'health',
  'quality',
  'purity',
  'formulation',
  'manufacturing',
  'lifestyle',
  'other',
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const SOURCE_TYPES = [
  'peer_reviewed_study',
  'systematic_review',
  'meta_analysis',
  'government',
  'regulatory',
  'professional_organization',
  'manufacturer',
  'product_label',
  'marketplace',
  'other',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const PANEL_TYPES = [
  'nutrition',
  'supplement_facts',
  'ingredients',
  'directions',
  'warnings',
  'other',
] as const;
export type PanelType = (typeof PANEL_TYPES)[number];

export const OBSERVATION_TYPES = [
  'serving_size',
  'servings_per_container',
  'front_label_claim',
  'ingredient_presence',
  'veg_mark',
  'price',
  'label_text',
  'label_change',
  'pack_size',
  'ingredient_amount',
  'ingredient_form',
  'product_image',
  'other',
] as const;
export type ObservationType = (typeof OBSERVATION_TYPES)[number];

/**
 * Where a fact was observed. Web content is discovery/input; label evidence
 * (physical pack, brand-supplied label, confirmed pack photo) is the basis
 * for published product facts.
 */
export const SOURCE_KINDS = [
  'PHYSICAL_PACK',
  'BRAND_WEBSITE',
  'MARKETPLACE',
  'BRAND_SUPPLIED_LABEL',
  'PRODUCT_ARTWORK',
  'MARKETING_COPY',
  'OTHER',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const IMAGE_KINDS = [
  'PACK_PHOTO',
  'PRINT_ARTWORK',
  'MARKETING_GRAPHIC',
  'RETYPESET_TABLE',
  'UNKNOWN',
] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];
export type DepictsExactProduct = 'CONFIRMED' | 'UNCONFIRMED' | 'NOT_THIS_PRODUCT';

export type VerificationStatus = 'unverified' | 'verified' | 'rejected';
export type ExtractionMethod = 'manual' | 'structured_data' | 'parser' | 'ocr' | 'ai';

export const CLAIM_RESEARCH_STATUSES = [
  'NEEDS_EVIDENCE',
  'IN_RESEARCH',
  'EVIDENCE_IDENTIFIED',
  'INSUFFICIENT_EVIDENCE_IDENTIFIED',
] as const;
export type ClaimResearchStatus = (typeof CLAIM_RESEARCH_STATUSES)[number];

export const DISCREPANCY_STATUSES = [
  'OPEN',
  'AWAITING_BRAND',
  'BRAND_RESPONDED',
  'RESOLVED',
  'UNRESOLVED',
  'SUPERSEDED',
] as const;
export type DiscrepancyStatus = (typeof DISCREPANCY_STATUSES)[number];
/** Factual attention level. Never implies wrongdoing. */
export type DiscrepancySeverity = 'INFORMATIONAL' | 'MATERIAL' | 'HIGH_ATTENTION';

export const BRAND_RESPONSE_RESOLUTIONS = [
  'WEBSITE_CORRECTED',
  'LABEL_CONFIRMED',
  'FORMULATION_CHANGE',
  'PACKAGING_CHANGE',
  'BOTH_CORRECT_DIFFERENT_VERSIONS',
  'UNRESOLVED',
  'OTHER',
] as const;
export type BrandResponseResolution = (typeof BRAND_RESPONSE_RESOLUTIONS)[number];

export type { ServingSpec, ServingUnit };

export const CURRENCIES = ['INR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const UNITS = [
  'mcg',
  'mg',
  'g',
  'kg',
  'ml',
  'l',
  'IU',
  'kcal',
  'kJ',
  'CFU',
  'count',
] as const;
export type Unit = (typeof UNITS)[number];

export interface Quantity {
  amount: number;
  unit: Unit;
}

// ─── Shared fragments ─────────────────────────────────────────────────────

export interface ImageData {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  lqip: string | null;
  caption: string | null;
  /** Display basis; product images are gated on it (docs/assets.md). */
  provenance?: ImageProvenance;
  permission?: AssetPermissionData | null;
}

export type ImageProvenance =
  | 'UNKNOWN'
  | 'NOT_REQUESTED'
  | 'AUTHORIZED'
  | 'EDITORIAL_LABEL_PHOTO'
  | 'USER_SUBMITTED'
  | 'RESTRICTED'
  | 'REVOKED';

export interface AssetPermissionData {
  status: 'NOT_REQUESTED' | 'REQUESTED' | 'AUTHORIZED' | 'RESTRICTED' | 'REVOKED';
  assetType: 'PRODUCT_IMAGE' | 'BRAND_LOGO' | 'PACK_IMAGE' | 'LABEL_IMAGE' | 'PRODUCT_COPY';
  grantedAt: string | null;
  expiresAt: string | null;
  /** FACTUAL_DATA | LABEL_INFORMATION | IMAGES | URLS. Display needs IMAGES. */
  scope: string[];
  /** Set when a labels.fyi person read the written permission. Display needs it. */
  verifiedAt: string | null;
  brand: string | null;
  product: string | null;
}

/** Portable Text is rendered by src/lib/content/portable-text.ts. */
export type PortableTextBlocks = ReadonlyArray<Record<string, unknown>>;

export interface Ref {
  name: string;
  slug: string;
}

export interface SourceData {
  _id: string;
  title: string;
  publisher: string | null;
  url: string | null;
  doi: string | null;
  pmid: string | null;
  sourceType: SourceType;
  publicationDate: string | null;
  accessedAt: string | null;
  authors: string[] | null;
  notes: string | null;
}

export interface ReviewerSummary {
  _id: string;
  name: string;
  credentials: string;
  organization: string | null;
  slug: string;
  photo: ImageData | null;
  isPlaceholder: boolean;
}

export interface ReviewerDetail extends ReviewerSummary {
  bio: string | null;
  isDemo: boolean;
}

export interface EditorialReviewData {
  _id: string;
  reviewer: ReviewerSummary;
  reviewedAt: string;
  nextReviewAt: string | null;
  status: 'approved' | 'changes_requested' | 'in_review';
  scope: 'fact_check' | 'dietitian_review' | 'editorial';
  notes: string | null;
}

/** Fields every editorial document carries. */
export interface EditorialMeta {
  workflowStatus: WorkflowStatus;
  isDemo: boolean;
  noindex: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  _createdAt: string;
  _updatedAt: string;
  reviews: EditorialReviewData[];
}

// ─── Label data ───────────────────────────────────────────────────────────

export interface LabelNutrientRow {
  _key: string;
  name: string;
  nutrientKey: string | null;
  unit: Unit;
  perServing: number | null;
  per100: number | null;
  dailyValuePercent: number | null;
  indent: number;
}

export interface LabelIngredientRow {
  _key: string;
  ingredient: (Ref & { _id: string }) | null;
  displayName: string;
  /** Amount exactly as printed on the label (may be null: many rows carry no amount). */
  amount: number | null;
  unit: Unit | null;
  /** Normalised per-serving amount in `unit`. Null when the label does not disclose it. */
  amountPerServing: number | null;
  dailyValue: number | null;
  dailyValuePercent: number | null;
  proprietaryBlend: boolean;
  blendName: string | null;
  orderOnLabel: number | null;
  isKeyActive: boolean;
  observation: string | null;
  /** Layer C: labels.fyi's interpretation of the printed amount. */
  editorialNote: string | null;
  /** Ingredient form as declared, e.g. "Magnesium bisglycinate". */
  form: string | null;
  /** Declared weight of the named compound/form per serving. */
  compoundAmount: number | null;
  compoundUnit: Unit | null;
  /**
   * Elemental amount per serving (e.g. elemental magnesium). Null = UNKNOWN.
   * Never derived from the compound weight unless elementalBasis says an
   * editorial calculation with a cited basis was made.
   */
  elementalAmount: number | null;
  elementalUnit: Unit | null;
  elementalBasis: 'label_declared' | 'editorial_calculation' | null;
  /** Where on the label this row is, e.g. "Supplement facts, row 2". */
  sourceLocator: string | null;
}

export interface LabelPanelData {
  _id: string;
  panelType: PanelType;
  title: string | null;
  /** What this transcription is based on. */
  sourceType: SourceKind | null;
  /** When transcribed from an image: its classification and product confirmation. */
  imageEvidence: {
    url: string | null;
    imageKind: ImageKind | null;
    depictsExactProduct: DepictsExactProduct | null;
  } | null;
  serving: ServingSpec | null;
  servingSize: Quantity | null;
  servingSizeText: string | null;
  servingsPerContainer: number | null;
  per100Basis: 'g' | 'ml' | null;
  nutrients: LabelNutrientRow[];
  ingredients: LabelIngredientRow[];
  ingredientsText: string | null;
  text: string | null;
  capturedAt: string;
  capturedBy: string | null;
  source: SourceData | null;
  image: ImageData | null;
  notes: string | null;
  isCurrent: boolean;
  /** When a person verified the transcription (panels from label submissions). */
  verifiedAt: string | null;
  /** Ids of earlier panels this one replaces (treated as history once this is approved). */
  supersedes: string[];
  /** Created from a label submission: renders only after a later approved review. */
  fromSubmission: boolean;
}

// ─── Claims & evidence ────────────────────────────────────────────────────

export interface EvidenceData {
  _key: string;
  summary: string;
  relevance: 'direct' | 'indirect' | 'background';
  population: string | null;
  source: SourceData | null;
}

export interface ClaimData {
  _id: string;
  exactClaim: string;
  claimType: ClaimType;
  locationOnProduct: string | null;
  /** One-line conclusion, e.g. "Label states 24 g protein per 33 g serving." */
  assessment: string;
  assessmentStatus: AssessmentStatus;
  explanation: string | null;
  evidence: EvidenceData[];
  sources: SourceData[];
  reviewer: ReviewerSummary | null;
  reviewedAt: string | null;
  order: number | null;
  /** When the claim was seen on the label/listing. */
  observedAt: string | null;
  /** CLAIM_SOURCE: where the brand makes the claim (distinct from evidence sources). */
  claimSource: { sourceType: SourceKind | null; locator: string | null } | null;
  /** Evidence research state; only researched claims are published. */
  researchStatus: ClaimResearchStatus;
  /** Claims from an earlier label version are kept, marked superseded. */
  status: 'current' | 'superseded';
  supersededAt: string | null;
}

// ─── Observations & prices ────────────────────────────────────────────────

export interface ObservationData {
  _id: string;
  type: ObservationType;
  value: string;
  observedAt: string;
  observedBy: string | null;
  source: SourceData | null;
  sourceImage: ImageData | null;
  notes: string | null;
  supersededAt: string | null;
  /** Named person who independently verified it (required for ingested data). */
  verifiedBy: string | null;
  verifiedAt: string | null;
  sourceType: SourceKind | null;
  /** Short pointer to where in the source, e.g. "gallery image 7 → supplement facts". */
  sourceLocator: string | null;
  extractionMethod: ExtractionMethod | null;
  verificationStatus: VerificationStatus;
  /** The captured web page this was observed on, if any. */
  snapshot: { url: string; fetchedAt: string } | null;
  /** Created from a label submission: renders only after a later approved review. */
  fromSubmission: boolean;
}

export type MerchantKind =
  'OFFICIAL_STORE' | 'MARKETPLACE' | 'QUICK_COMMERCE' | 'PHARMACY' | 'RETAILER';

export interface MerchantData {
  _id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  kind?: MerchantKind;
  /** For an official store: the brand whose store it is. */
  brand?: string | null;
}

export type Availability = 'in_stock' | 'out_of_stock' | 'unknown';

export interface PriceSnapshotData {
  _id: string;
  merchant: MerchantData;
  price: number;
  currency: Currency;
  packSize: Quantity | null;
  servings: number | null;
  capturedAt: string;
  availability: Availability;
  notes: string | null;
  /** Printed/listed maximum retail price, if observed. Not used in cost maths. */
  mrp: number | null;
  sourceUrl: string | null;
}

export interface AffiliateOfferData {
  _id: string;
  merchant: MerchantData;
  destinationUrl: string;
  affiliateUrl: string | null;
  active: boolean;
  disclosureRequired: boolean;
  lastCheckedAt: string | null;
  relationship: 'affiliate' | 'sponsored' | 'none';
  affiliateNetwork?: string | null;
  trackingId?: string | null;
}

// ─── Entities ─────────────────────────────────────────────────────────────

export interface BrandSummary extends Ref {
  _id: string;
}

export interface CategoryData extends Ref {
  _id: string;
  description: string | null;
}

export interface ProductSummary {
  _id: string;
  name: string;
  /** Flavour / strength variant, e.g. "Dark Chocolate". */
  variant: string | null;
  serving: ServingSpec | null;
  slug: string;
  brand: BrandSummary;
  category: CategoryData | null;
  format: string;
  vegStatus: VegStatus;
  servingSize: Quantity | null;
  servingSizeText: string | null;
  servingsPerContainer: number | null;
  image: ImageData | null;
  keyActives: LabelIngredientRow[];
  keyNutrients: LabelNutrientRow[];
  prices: PriceSnapshotData[];
  lastVerifiedAt: string | null;
  /** Editorially curated for the homepage. We have no popularity data, so we don't claim any. */
  featured: boolean;
  isDemo: boolean;
}

export interface ProductDetail extends ProductSummary, EditorialMeta {
  subcategory: string | null;
  vegStatusReason: string;
  aliases: string[];
  marketStatus: 'available' | 'discontinued' | 'unknown';
  discontinuedAt: string | null;
  countryOfOrigin: string | null;
  manufacturer: string | null;
  description: string | null;
  labelImages: ImageData[];
  firstPublishedAt: string | null;
  panels: LabelPanelData[];
  claims: ClaimData[];
  observations: ObservationData[];
  offers: AffiliateOfferData[];
  discrepancies: DiscrepancyData[];
  ingredients: Array<Ref & { _id: string }>;
  comparisons: ComparisonSummary[];
  related: ProductSummary[];
  guides: GuideSummary[];
}

export interface IngredientForm {
  _key: string;
  name: string;
  description: string | null;
}

export interface StudiedDose {
  _key: string;
  context: string;
  min: number | null;
  max: number | null;
  unit: Unit;
  frequency: string | null;
  duration: string | null;
  population: string | null;
  source: SourceData | null;
}

export interface EvidenceFinding {
  _key: string;
  outcome: string;
  status: AssessmentStatus;
  summary: string;
  sources: SourceData[];
}

export interface IngredientSummary extends Ref {
  _id: string;
  summary: string | null;
  commonLabelNames: string[];
  featured: boolean;
  isDemo: boolean;
}

export interface IngredientDetail extends IngredientSummary, EditorialMeta {
  overview: PortableTextBlocks | null;
  whyInSupplements: PortableTextBlocks | null;
  forms: IngredientForm[];
  studiedDoses: StudiedDose[];
  findings: EvidenceFinding[];
  safety: PortableTextBlocks | null;
  buyingNotes: PortableTextBlocks | null;
  sources: SourceData[];
  products: ProductSummary[];
  comparisons: ComparisonSummary[];
  guides: GuideSummary[];
}

export interface BrandDetail extends BrandSummary, Pick<EditorialMeta, 'isDemo' | 'noindex'> {
  description: string | null;
  websiteUrl: string | null;
  countryOfOrigin: string | null;
  products: ProductSummary[];
}

export interface GuideSummary {
  _id: string;
  title: string;
  slug: string;
  dek: string | null;
  publishedAt: string | null;
  isDemo: boolean;
}

export interface GuideDetail extends GuideSummary, EditorialMeta {
  body: PortableTextBlocks;
  sources: SourceData[];
  ingredients: IngredientSummary[];
  products: ProductSummary[];
  comparisons: ComparisonSummary[];
}

export interface DoseBasis {
  kind: 'ingredient' | 'nutrient';
  ingredient: (Ref & { _id: string }) | null;
  nutrientKey: string | null;
  amount: number;
  unit: Unit;
  label: string;
}

export interface ComparisonSummary {
  _id: string;
  title: string;
  slug: string;
  dek: string | null;
  productCount: number;
  isDemo: boolean;
}

export interface ComparisonDetail extends ComparisonSummary, EditorialMeta {
  intro: PortableTextBlocks | null;
  methodology: PortableTextBlocks | null;
  doseBasis: DoseBasis | null;
  category: CategoryData | null;
  products: ProductSummary[];
  guides: GuideSummary[];
}

export interface CategoryDetail extends CategoryData {
  isDemo: boolean;
  products: ProductSummary[];
  comparisons: ComparisonSummary[];
}

export interface SearchDocument {
  id: string;
  type: 'goal' | 'product' | 'ingredient' | 'brand' | 'guide' | 'comparison';
  title: string;
  subtitle: string;
  url: string;
  keywords: string[];
  vegStatus?: VegStatus;
}

// ─── Discrepancies & brand responses ──────────────────────────────────────

/** One source's value for a disputed field. Values are never overwritten. */
export interface DiscrepancyValue {
  _key: string;
  sourceType: SourceKind;
  value: string;
  locator: string | null;
  observedAt: string | null;
  source: SourceData | null;
  snapshotUrl: string | null;
}

export interface BrandResponseData {
  _id: string;
  contactedAt: string | null;
  contactMethod: string | null;
  respondedAt: string | null;
  respondentRole: string | null;
  response: string | null;
  resolution: BrandResponseResolution | null;
  supportingSources: SourceData[];
}

export interface DiscrepancyData {
  _id: string;
  field: string;
  values: DiscrepancyValue[];
  status: DiscrepancyStatus;
  severity: DiscrepancySeverity;
  detectedAt: string;
  notes: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  brandResponses: BrandResponseData[];
}

// ─── Goals (Sprint 6) ─────────────────────────────────────────────────────

export type GoalIngredientRelation = 'COMMONLY_FOUND' | 'EDITORIALLY_REVIEWED';

export interface GoalIngredientData {
  name: string;
  ingredient: { _id: string; name: string; slug: string } | null;
  matchNames: string[];
  relation: GoalIngredientRelation;
  evidence: string | null;
}

export type ProductGoalBasis =
  'BRAND_MARKETING' | 'RETAILER_LISTING' | 'EDITORIAL_CLASSIFICATION' | 'INGREDIENT_MATCH';

export interface ProductGoalData {
  _id: string;
  product: string;
  goal: string;
  basis: ProductGoalBasis;
  statement: string | null;
  sourceUrl: string | null;
  sourceLocator: string | null;
  observedAt: string | null;
  source: SourceData | null;
  reviewedBy: string;
  reviewedAt: string;
}

export interface GoalData {
  _id: string;
  _updatedAt: string;
  name: string;
  slug: string;
  shortDescription: string;
  discoveryDescription: string;
  order: number;
  ingredients: GoalIngredientData[];
  noindex: boolean;
  isDemo: boolean;
  reviews: EditorialReviewData[];
}

export interface GoalDetail extends GoalData {
  /** Published products with at least one approved relationship, and why. */
  memberships: Array<{ productId: string; relationships: ProductGoalData[] }>;
}
