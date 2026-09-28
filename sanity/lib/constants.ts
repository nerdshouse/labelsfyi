/**
 * Enumerations shared by the studio schemas. Keep in sync with
 * src/lib/content/types.ts (the site's read models).
 */
const opt = (value: string, title: string) => ({ value, title });

export const WORKFLOW_STATUS = [
  opt('DRAFT', 'Draft'),
  opt('FACT_CHECK', 'Fact check'),
  opt('DIETITIAN_REVIEW', 'Dietitian review'),
  opt('APPROVED', 'Approved'),
  opt('PUBLISHED', 'Published'),
  opt('NEEDS_REVIEW', 'Needs review'),
];
export const PUBLISHABLE_STATUSES = ['APPROVED', 'PUBLISHED', 'NEEDS_REVIEW'];
/** Types whose publishing is gated by the editorial workflow. */
export const WORKFLOW_TYPES = ['product', 'ingredient', 'claim', 'guide', 'comparison', 'brand'];
/** Append-only record types: no delete/unpublish, corrections via supersession. */
export const AUDIT_TYPES = [
  'observation',
  'priceSnapshot',
  'editorialReview',
  'sourceSnapshot',
  'ingestionRun',
];

export const VEG_STATUS = [
  opt('VEGETARIAN', 'Vegetarian'),
  opt('NON_VEGETARIAN', 'Non-vegetarian'),
  opt('VEGAN', 'Vegan'),
  opt('UNKNOWN', 'Unknown'),
];
export const ASSESSMENT_STATUS = [
  opt('supported', 'Supported'),
  opt('partially_supported', 'Partly supported'),
  opt('requires_context', 'Needs context'),
  opt('not_verifiable', 'Not verifiable'),
  opt('insufficient_evidence', 'Limited evidence'),
];
export const CLAIM_TYPE = [
  'performance',
  'nutrition',
  'health',
  'quality',
  'purity',
  'formulation',
  'manufacturing',
  'lifestyle',
  'other',
].map((v) => opt(v, v[0]!.toUpperCase() + v.slice(1)));
export const SOURCE_TYPE = [
  opt('peer_reviewed_study', 'Peer-reviewed study'),
  opt('systematic_review', 'Systematic review'),
  opt('meta_analysis', 'Meta-analysis'),
  opt('government', 'Government'),
  opt('regulatory', 'Regulatory'),
  opt('professional_organization', 'Professional organisation'),
  opt('manufacturer', 'Manufacturer'),
  opt('product_label', 'Product label'),
  opt('marketplace', 'Marketplace'),
  opt('other', 'Other'),
];
export const PANEL_TYPE = [
  opt('nutrition', 'Nutrition information'),
  opt('supplement_facts', 'Supplement facts'),
  opt('ingredients', 'Ingredients'),
  opt('directions', 'Directions'),
  opt('warnings', 'Warnings'),
  opt('other', 'Other'),
];
export const OBSERVATION_TYPE = [
  opt('serving_size', 'Serving size'),
  opt('servings_per_container', 'Servings per container'),
  opt('front_label_claim', 'Front-label claim'),
  opt('ingredient_presence', 'Ingredient presence'),
  opt('veg_mark', 'Veg / non-veg mark'),
  opt('price', 'Price'),
  opt('label_text', 'Label text'),
  opt('label_change', 'Label change / reformulation'),
  opt('pack_size', 'Pack size'),
  opt('ingredient_amount', 'Ingredient amount'),
  opt('ingredient_form', 'Ingredient form'),
  opt('product_image', 'Product / label image'),
  opt('other', 'Other'),
];
export const UNITS = ['mcg', 'mg', 'g', 'kg', 'ml', 'l', 'IU', 'kcal', 'kJ', 'CFU', 'count'].map(
  (u) => opt(u, u),
);
export const FORMATS = [
  'powder',
  'capsule',
  'tablet',
  'softgel',
  'gummy',
  'liquid',
  'bar',
  'sachet',
  'other',
].map((f) => opt(f, f[0]!.toUpperCase() + f.slice(1)));
export const NUTRIENT_KEYS = [
  'energy',
  'protein',
  'carbohydrate',
  'total_sugars',
  'added_sugars',
  'total_fat',
  'saturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'fibre',
  'other',
].map((k) => opt(k, k.replace(/_/g, ' ')));

// ─── Ingestion (see docs/ingestion.md) ────────────────────────────────────
export const DATA_SOURCE_TYPE = [
  opt('brand', 'Brand (D2C site)'),
  opt('retailer', 'Retailer'),
  opt('marketplace', 'Marketplace'),
  opt('regulatory', 'Regulatory'),
  opt('scientific', 'Scientific'),
  opt('other', 'Other'),
];
export const INGESTION_RUN_STATUS = [
  opt('running', 'Running'),
  opt('completed', 'Completed'),
  opt('partial', 'Partial'),
  opt('failed', 'Failed'),
];
export const IMAGE_ROLE = [
  opt('front', 'Front of pack'),
  opt('ingredients', 'Ingredient panel'),
  opt('nutrition', 'Nutrition / supplement facts'),
  opt('back', 'Back label'),
  opt('other', 'Other product image'),
  opt('unknown', 'Unclassified'),
];
/** How a fact was extracted. "ai" output is candidate data only, never authoritative. */
export const EXTRACTION_METHOD = [
  opt('manual', 'Manual transcription'),
  opt('structured_data', 'Structured data on page (JSON-LD etc.)'),
  opt('parser', 'Source-specific parser'),
  opt('ocr', 'OCR'),
  opt('ai', 'AI-assisted extraction'),
];
export const VERIFICATION_STATUS = [
  opt('unverified', 'Unverified'),
  opt('verified', 'Verified'),
  opt('rejected', 'Rejected'),
];
export const EXTRACTED_FIELD = [
  opt('name', 'Product name'),
  opt('brand', 'Brand'),
  opt('variant', 'Variant / flavour'),
  opt('pack_size', 'Pack size'),
  opt('serving_size', 'Serving size'),
  opt('servings_per_container', 'Servings per container'),
  opt('ingredient_amount', 'Ingredient amount'),
  opt('ingredient_form', 'Ingredient form'),
  opt('ingredient_list', 'Ingredient list text'),
  opt('nutrient', 'Nutrient value'),
  opt('claim', 'Claim'),
  opt('veg_marker', 'Veg / non-veg / vegan marker'),
  opt('price', 'Price'),
  opt('mrp', 'MRP'),
  opt('image', 'Product image'),
  opt('other', 'Other'),
];
export const CANDIDATE_STATUS = [
  opt('needs_verification', 'Needs verification'),
  opt('in_review', 'In review'),
  opt('accepted', 'Accepted'),
  opt('rejected', 'Rejected'),
];
export const MATCH_STATUS = [
  opt('unmatched', 'Not yet matched'),
  opt('possible_match', 'Possible match(es)'),
  opt('confirmed', 'Confirmed: existing product'),
  opt('new_product', 'Confirmed: new product'),
  opt('not_a_product', 'Not a product / ignore'),
];
export const MARKET_STATUS = [
  opt('available', 'Available'),
  opt('discontinued', 'Discontinued'),
  opt('unknown', 'Unknown'),
];
