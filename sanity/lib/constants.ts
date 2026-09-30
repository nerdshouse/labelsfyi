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
export const WORKFLOW_TYPES = [
  'goal',
  'product',
  'ingredient',
  'claim',
  'guide',
  'comparison',
  'brand',
  'discrepancy',
  'brandResponse',
];
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
  opt('gtin', 'Barcode / GTIN'),
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
/** Why a reviewer rejected an ingestion candidate (internal candidate review). */
export const CANDIDATE_REJECTION_REASON = [
  opt('not_a_product', 'Not a product'),
  opt('out_of_scope', 'Out of scope'),
  opt('duplicate', 'Duplicate'),
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

// ─── Comparison & provenance layer ───────────────────────────────────────
/** Where a fact was observed. Web content is discovery; label evidence is the publishing basis. */
export const SOURCE_KIND = [
  opt('PHYSICAL_PACK', 'Physical pack'),
  opt('BRAND_SUPPLIED_LABEL', 'Brand-supplied label file'),
  opt('PRODUCT_ARTWORK', 'Product artwork / pack image (needs a classified image)'),
  opt('BRAND_WEBSITE', 'Brand website'),
  opt('MARKETPLACE', 'Marketplace listing'),
  opt('MARKETING_COPY', 'Marketing copy'),
  opt('OTHER', 'Other'),
];
export const PANEL_SOURCE_KIND = SOURCE_KIND.filter((o) =>
  ['PHYSICAL_PACK', 'BRAND_SUPPLIED_LABEL', 'PRODUCT_ARTWORK'].includes(o.value),
);
export const IMAGE_KIND = [
  opt('PACK_PHOTO', 'Photo of the actual pack'),
  opt('PRINT_ARTWORK', 'Print artwork (label file render)'),
  opt('MARKETING_GRAPHIC', 'Marketing graphic'),
  opt('RETYPESET_TABLE', 'Re-typeset table'),
  opt('UNKNOWN', 'Unknown'),
];
export const DEPICTS = [
  opt('UNCONFIRMED', 'Unconfirmed'),
  opt('CONFIRMED', 'Confirmed: this exact product'),
  opt('NOT_THIS_PRODUCT', 'Not this product'),
];
export const SERVING_UNIT = [
  'serving',
  'capsule',
  'tablet',
  'softgel',
  'strip',
  'scoop',
  'sachet',
  'gummy',
  'ml',
  'g',
].map((u) => opt(u, u));
export const ELEMENTAL_BASIS = [
  opt('label_declared', 'Declared on the label'),
  opt('editorial_calculation', 'Editorial calculation with a cited basis'),
];
export const RESEARCH_STATUS = [
  opt('NEEDS_EVIDENCE', 'Needs evidence'),
  opt('IN_RESEARCH', 'In research'),
  opt('EVIDENCE_IDENTIFIED', 'Evidence identified'),
  opt('INSUFFICIENT_EVIDENCE_IDENTIFIED', 'Insufficient evidence identified'),
];
export const DISCREPANCY_STATUS = [
  opt('OPEN', 'Open'),
  opt('AWAITING_BRAND', 'Awaiting brand'),
  opt('BRAND_RESPONDED', 'Brand responded'),
  opt('RESOLVED', 'Resolved'),
  opt('UNRESOLVED', 'Unresolved'),
  opt('SUPERSEDED', 'Superseded'),
];
/** Attention level only. Never implies wrongdoing. */
export const SEVERITY = [
  opt('INFORMATIONAL', 'Informational'),
  opt('MATERIAL', 'Material'),
  opt('HIGH_ATTENTION', 'High attention'),
];
export const BRAND_RESPONSE_RESOLUTION = [
  opt('WEBSITE_CORRECTED', 'Website corrected'),
  opt('LABEL_CONFIRMED', 'Label confirmed'),
  opt('FORMULATION_CHANGE', 'Formulation change'),
  opt('PACKAGING_CHANGE', 'Packaging change'),
  opt('BOTH_CORRECT_DIFFERENT_VERSIONS', 'Both correct (different versions)'),
  opt('UNRESOLVED', 'Unresolved'),
  opt('OTHER', 'Other'),
];
export const CONTACT_METHOD = ['email', 'phone', 'web_form', 'in_person', 'other'].map((m) =>
  opt(m, m),
);
export const MATCH_LEVEL = [
  opt('EXACT', 'Exact (same GTIN)'),
  opt('HIGH_CONFIDENCE_CANDIDATE', 'High-confidence candidate'),
  opt('POSSIBLE_MATCH', 'Possible match'),
];

// ─── Goals, commerce & assets (Sprint 6) ─────────────────────────────────

/** Top-level paths a goal slug must never take (existing routes). */
export const RESERVED_GOAL_SLUGS = [
  'api',
  'brands',
  'categories',
  'compare',
  'compare-data',
  'comparison-index',
  'guides',
  'ingredients',
  'internal',
  'methodology',
  'partials',
  'products',
  'receipt',
  'reviewers',
  'robots',
  'search',
  'search-index',
  'sitemap',
  'submit',
  'favicon',
  '404',
  'index',
  'goals',
  'demo',
  'analyse',
  'catalogue-index',
  'supplements',
];
export const GOAL_INGREDIENT_RELATION = [
  opt('COMMONLY_FOUND', 'Commonly found in products marketed for this goal'),
  opt('EDITORIALLY_REVIEWED', 'Editorially reviewed (approved evidence record linked)'),
];
export const PRODUCT_GOAL_BASIS = [
  opt('BRAND_MARKETING', 'Brand marketing (the brand markets it for this goal)'),
  opt('RETAILER_LISTING', 'Retailer listing (a retailer lists it under this goal; not the brand)'),
  opt('EDITORIAL_CLASSIFICATION', 'Editorial classification'),
  opt('INGREDIENT_MATCH', 'Ingredient match (suggestion only; needs editorial approval)'),
];
export const PRODUCT_GOAL_STATUS = [
  opt('CANDIDATE', 'Candidate'),
  opt('APPROVED', 'Approved'),
  opt('REJECTED', 'Rejected'),
];
export const ASSET_TYPE = [
  opt('PRODUCT_IMAGE', 'Product image'),
  opt('BRAND_LOGO', 'Brand logo'),
  opt('PACK_IMAGE', 'Pack image'),
  opt('LABEL_IMAGE', 'Label image'),
  opt('PRODUCT_COPY', 'Product copy'),
];
export const ASSET_PERMISSION_STATUS = [
  opt('NOT_REQUESTED', 'Not requested'),
  opt('REQUESTED', 'Requested'),
  opt('AUTHORIZED', 'Authorized'),
  opt('RESTRICTED', 'Restricted'),
  opt('REVOKED', 'Revoked'),
];
/** Where a public image came from. Only some bases may be displayed. */
export const IMAGE_PROVENANCE = [
  opt('UNKNOWN', 'Unknown (never displayed)'),
  opt('NOT_REQUESTED', 'Third-party, permission not requested (never displayed)'),
  opt('AUTHORIZED', 'Authorized by the rights holder (link the permission)'),
  opt('EDITORIAL_LABEL_PHOTO', 'Photo taken by labels.fyi of a pack we hold'),
  opt('USER_SUBMITTED', 'Submitted via /submit (private; not displayed)'),
  opt('RESTRICTED', 'Restricted (never displayed)'),
  opt('REVOKED', 'Revoked (never displayed)'),
];
export const MERCHANT_KIND = [
  opt('OFFICIAL_STORE', 'Official brand store'),
  opt('MARKETPLACE', 'Marketplace'),
  opt('QUICK_COMMERCE', 'Quick commerce'),
  opt('PHARMACY', 'Online pharmacy'),
  opt('RETAILER', 'Retailer'),
];
/** How a data source may be used. Automated collection needs explicit permission. */
export const ACCESS_MODE = [
  opt('NOT_PERMITTED', 'Not permitted (terms prohibit use/extraction)'),
  opt('MANUAL_RESEARCH', 'Manual research only'),
  opt('BRAND_PERMISSION', 'Brand permission'),
  opt('BRAND_SUPPLIED_FEED', 'Brand-supplied feed'),
  opt('AUTHORIZED_FEED', 'Authorized API / feed'),
  opt('USER_SUBMITTED_LABEL', 'User-submitted labels'),
];
