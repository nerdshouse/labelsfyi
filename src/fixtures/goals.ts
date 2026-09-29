import type { RawDoc } from './helpers.ts';
import { key, published, qty, ref, slug } from './helpers.ts';
import { parseServing } from '../lib/identity/serving.ts';

/**
 * FICTIONAL demo data for goal discovery (docs/goals.md). Brands, labels,
 * permissions and prices are invented. Exercises:
 *
 *   - published goals with products (sleep, stress, immunity, hydration)
 *   - published goals with no products yet (energy, gut-health, …): noindex
 *   - a DRAFT goal (focus) that must never render
 *   - APPROVED relationships (shown), a CANDIDATE (hidden), an APPROVED
 *     relationship to a DRAFT product (hidden)
 *   - an image AUTHORIZED by the (fictional) brand, and an image whose
 *     permission was NOT_REQUESTED (hidden → neutral tile)
 *   - an official brand store offer and a marketplace affiliate offer
 */

const EDITOR = 'labels.fyi editorial (demo)';
const serving = (text: string) => ({ _type: 'servingSpec', ...parseServing(text) });
const goalIngredient = (name: string, ingredient?: string, matchNames: string[] = []) => ({
  _key: key(),
  _type: 'goalIngredient',
  name,
  ...(ingredient ? { ingredient: ref(ingredient) } : {}),
  matchNames,
  relation: 'COMMONLY_FOUND',
});
const row = (r: Record<string, unknown>) => ({
  _key: key(),
  _type: 'labelIngredient',
  proprietaryBlend: false,
  blendName: null,
  dailyValue: null,
  dailyValuePercent: null,
  observation: null,
  editorialNote: null,
  compoundAmount: null,
  compoundUnit: null,
  elementalAmount: null,
  elementalUnit: null,
  elementalBasis: null,
  ...r,
});

// ─── Goals ───────────────────────────────────────────────────────────────

const goalDoc = (
  slugValue: string,
  name: string,
  order: number,
  ingredients: ReturnType<typeof goalIngredient>[],
  status = 'PUBLISHED',
): RawDoc => ({
  _id: `goal.${slugValue}`,
  _type: 'goal',
  name,
  slug: slug(slugValue),
  order,
  shortDescription: `Supplements marketed for ${name.toLowerCase()} support.`,
  discoveryDescription: `Products whose brands market them for ${name.toLowerCase()} support, and the ingredients commonly found in them. This is a way to browse labels, not medical advice: being in this list says nothing about whether a product works.`,
  ingredients,
  ...published('2026-09-25'),
  workflowStatus: status,
});

export const goals: RawDoc[] = [
  goalDoc('sleep', 'Sleep', 1, [
    goalIngredient('Melatonin', undefined, ['melatonin']),
    goalIngredient('Magnesium', 'ingredient.magnesium'),
    goalIngredient('L-theanine', undefined, ['l-theanine']),
    goalIngredient('Ashwagandha', 'ingredient.ashwagandha'),
    goalIngredient('Chamomile', undefined, ['chamomile']),
  ]),
  goalDoc('stress', 'Stress', 2, [
    goalIngredient('Ashwagandha', 'ingredient.ashwagandha'),
    goalIngredient('L-theanine', undefined, ['l-theanine']),
    goalIngredient('Magnesium', 'ingredient.magnesium'),
    goalIngredient('Saffron', undefined, ['saffron']),
    goalIngredient('Rhodiola', undefined, ['rhodiola']),
    goalIngredient('Vitamin B6', undefined, ['vitamin b6']),
  ]),
  goalDoc('immunity', 'Immunity', 3, [
    goalIngredient('Vitamin D3', 'ingredient.vitamin-d3'),
    goalIngredient('Vitamin C', undefined, ['vitamin c']),
    goalIngredient('Zinc', undefined, ['zinc']),
  ]),
  goalDoc('hydration', 'Hydration', 4, [
    goalIngredient('Sodium', undefined, ['sodium']),
    goalIngredient('Potassium', undefined, ['potassium']),
    goalIngredient('Magnesium', 'ingredient.magnesium'),
  ]),
  goalDoc('energy', 'Energy', 5, [
    goalIngredient('Vitamin B12', undefined, ['vitamin b12']),
    goalIngredient('Creatine', 'ingredient.creatine-monohydrate'),
  ]),
  goalDoc('gut-health', 'Gut Health', 6, [goalIngredient('Probiotics', undefined, ['probiotics'])]),
  goalDoc('joint-health', 'Joint Health', 7, [goalIngredient('Collagen', undefined, ['collagen'])]),
  goalDoc('hair-skin', 'Hair & Skin', 8, [goalIngredient('Biotin', undefined, ['biotin'])]),
  goalDoc('heart-health', 'Heart Health', 9, [goalIngredient('Omega-3', 'ingredient.omega-3')]),
  // Never rendered: not published.
  goalDoc('focus', 'Focus', 10, [goalIngredient('Caffeine', undefined, ['caffeine'])], 'DRAFT'),
];
export const GOAL_IDS = goals.filter((g) => g.workflowStatus === 'PUBLISHED').map((g) => g._id);

// ─── Products (fictional) ────────────────────────────────────────────────

const P10 = 'product.testbed-ashwagandha';
const P11 = 'product.specimen-electrolyte';
const P12 = 'product.draft-sleep-gummies';
export const GOAL_PRODUCT_IDS = [P10, P11];

export const goalProducts: RawDoc[] = [
  {
    _id: 'source.label.testbed-ashwagandha',
    _type: 'source',
    title: 'Testbed Sports Ashwagandha, bottle label (demo)',
    sourceType: 'product_label',
    notes: 'Fictional label used for the demo dataset.',
  },
  {
    _id: 'source.label.specimen-electrolyte',
    _type: 'source',
    title: 'Specimen Nutrition Electrolyte Drink Mix, carton label (demo)',
    sourceType: 'product_label',
    notes: 'Fictional label used for the demo dataset.',
  },
  {
    _id: 'source.brand-site.demo',
    _type: 'source',
    title: 'Brand product pages (demo)',
    sourceType: 'manufacturer',
    url: 'https://example.com/demo/brand-pages',
  },

  // Demo image assets (files in /public/demo). One authorized, one not.
  {
    _id: 'image-demo-specimen-electrolyte-png',
    _type: 'sanity.imageAsset',
    url: '/demo/specimen-electrolyte-pack.svg',
    metadata: { dimensions: { width: 400, height: 500 }, lqip: null },
  },
  {
    _id: 'image-demo-testbed-ashwagandha-png',
    _type: 'sanity.imageAsset',
    url: '/demo/unauthorized-marketing-shot.svg',
    metadata: { dimensions: { width: 400, height: 500 }, lqip: null },
  },

  // ─── P10 · ashwagandha: compound declared; image NOT authorized ──────
  {
    _id: P10,
    _type: 'product',
    name: 'Ashwagandha Root Extract 600 mg Capsules',
    variant: null,
    slug: slug('testbed-sports-ashwagandha-root-extract-600mg-capsules'),
    brand: ref('brand.testbed'),
    category: ref('category.vitamins-minerals'),
    subcategory: 'Herbal',
    format: 'capsule',
    servingSize: qty(1, 'count'),
    servingSizeText: '1 capsule',
    serving: serving('1 capsule'),
    servingsPerContainer: 60,
    vegStatus: 'VEGETARIAN',
    vegStatusReason: 'The green vegetarian mark is printed on the label.',
    description:
      'Ashwagandha root extract capsules. The label declares 600 mg of extract per capsule.',
    // A marketing shot found on the brand site: permission never requested → never shown.
    labelImages: [
      {
        _key: key(),
        _type: 'imageWithAlt',
        asset: ref('image-demo-testbed-ashwagandha-png'),
        alt: 'Marketing image from the brand website',
        provenance: { status: 'NOT_REQUESTED', source: 'Brand website (demo)' },
      },
    ],
    firstPublishedAt: '2026-09-25T09:00:00Z',
    lastVerifiedAt: '2026-09-25T10:00:00Z',
    ...published('2026-09-25'),
  },
  {
    _id: 'panel.testbed-ashwagandha.facts',
    _type: 'labelPanel',
    product: ref(P10),
    panelType: 'supplement_facts',
    title: 'Supplement facts',
    sourceType: 'PHYSICAL_PACK',
    serving: serving('1 capsule'),
    servingSize: qty(1, 'count'),
    servingSizeText: '1 capsule',
    servingsPerContainer: 60,
    per100Basis: null,
    nutrients: [],
    ingredients: [
      row({
        displayName: 'Ashwagandha root extract (Withania somnifera)',
        ingredient: ref('ingredient.ashwagandha'),
        form: 'Ashwagandha root extract',
        amount: 600,
        unit: 'mg',
        amountPerServing: 600,
        compoundAmount: 600,
        compoundUnit: 'mg',
        isKeyActive: true,
        orderOnLabel: 1,
        sourceLocator: 'Supplement facts, row 1',
      }),
    ],
    capturedAt: '2026-09-25T10:00:00Z',
    capturedBy: EDITOR,
    source: ref('source.label.testbed-ashwagandha'),
    status: 'current',
    isDemo: true,
  },
  {
    _id: 'observation.testbed-ashwagandha.amount',
    _type: 'observation',
    product: ref(P10),
    type: 'ingredient_amount',
    value: 'Label declares 600 mg ashwagandha root extract per capsule.',
    source: ref('source.label.testbed-ashwagandha'),
    sourceType: 'PHYSICAL_PACK',
    sourceLocator: 'Supplement facts, row 1',
    observedAt: '2026-09-25T10:00:00Z',
    observedBy: EDITOR,
    extractionMethod: 'manual',
    verificationStatus: 'verified',
    isDemo: true,
  },
  {
    _id: 'observation.testbed-ashwagandha.veg',
    _type: 'observation',
    product: ref(P10),
    type: 'veg_mark',
    value: 'Green vegetarian mark present.',
    source: ref('source.label.testbed-ashwagandha'),
    sourceType: 'PHYSICAL_PACK',
    sourceLocator: 'Front of bottle',
    observedAt: '2026-09-25T10:00:00Z',
    observedBy: EDITOR,
    extractionMethod: 'manual',
    verificationStatus: 'verified',
    isDemo: true,
  },

  // ─── P11 · electrolytes: elemental declared; image AUTHORIZED ────────
  {
    _id: 'assetPermission.specimen.product-images',
    _type: 'assetPermission',
    brand: ref('brand.specimen'),
    assetType: 'PRODUCT_IMAGE',
    status: 'AUTHORIZED',
    evidence: 'Demo authorization record (fictional).',
    grantedAt: '2026-09-20T00:00:00Z',
    scope: ['IMAGES'],
    grantedBy: 'Demo (fictional)',
    verifiedAt: '2026-09-20T00:00:00Z',
    contact: 'demo-contact@specimen.example',
    notes: 'Fictional permission used to demonstrate authorized images.',
    isDemo: true,
  },
  {
    _id: P11,
    _type: 'product',
    name: 'Electrolyte Drink Mix, Lemon',
    variant: 'Lemon',
    slug: slug('specimen-nutrition-electrolyte-drink-mix-lemon'),
    brand: ref('brand.specimen'),
    category: ref('category.vitamins-minerals'),
    subcategory: 'Electrolytes',
    format: 'sachet',
    servingSize: qty(1, 'count'),
    servingSizeText: '1 sachet (5 g)',
    serving: serving('1 sachet (5 g)'),
    servingsPerContainer: 20,
    vegStatus: 'VEGETARIAN',
    vegStatusReason: 'The green vegetarian mark is printed on the carton.',
    description:
      'Electrolyte drink mix. The label declares sodium, potassium and magnesium per sachet.',
    labelImages: [
      {
        _key: key(),
        _type: 'imageWithAlt',
        asset: ref('image-demo-specimen-electrolyte-png'),
        alt: 'Specimen Nutrition Electrolyte Drink Mix carton (brand-supplied image)',
        provenance: {
          status: 'AUTHORIZED',
          permission: ref('assetPermission.specimen.product-images'),
          source: 'Supplied by the brand (demo)',
        },
      },
    ],
    firstPublishedAt: '2026-09-26T09:00:00Z',
    lastVerifiedAt: '2026-09-26T10:00:00Z',
    ...published('2026-09-26'),
  },
  {
    _id: 'panel.specimen-electrolyte.facts',
    _type: 'labelPanel',
    product: ref(P11),
    panelType: 'supplement_facts',
    title: 'Nutrition information',
    sourceType: 'PHYSICAL_PACK',
    serving: serving('1 sachet (5 g)'),
    servingSize: qty(5, 'g'),
    servingSizeText: '1 sachet (5 g)',
    servingsPerContainer: 20,
    per100Basis: null,
    nutrients: [],
    ingredients: [
      row({
        displayName: 'Sodium (as sodium citrate)',
        ingredient: null,
        form: 'Sodium citrate',
        amount: 300,
        unit: 'mg',
        amountPerServing: 300,
        elementalAmount: 300,
        elementalUnit: 'mg',
        elementalBasis: 'label_declared',
        isKeyActive: true,
        orderOnLabel: 1,
        sourceLocator: 'Nutrition information, row 1',
      }),
      row({
        displayName: 'Potassium (as potassium chloride)',
        ingredient: null,
        form: 'Potassium chloride',
        amount: 150,
        unit: 'mg',
        amountPerServing: 150,
        elementalAmount: 150,
        elementalUnit: 'mg',
        elementalBasis: 'label_declared',
        isKeyActive: true,
        orderOnLabel: 2,
        sourceLocator: 'Nutrition information, row 2',
      }),
      row({
        displayName: 'Magnesium (as magnesium citrate)',
        ingredient: ref('ingredient.magnesium'),
        form: 'Magnesium citrate',
        amount: 50,
        unit: 'mg',
        amountPerServing: 50,
        elementalAmount: 50,
        elementalUnit: 'mg',
        elementalBasis: 'label_declared',
        isKeyActive: true,
        orderOnLabel: 3,
        sourceLocator: 'Nutrition information, row 3',
      }),
    ],
    capturedAt: '2026-09-26T10:00:00Z',
    capturedBy: EDITOR,
    source: ref('source.label.specimen-electrolyte'),
    status: 'current',
    isDemo: true,
  },
  {
    _id: 'observation.specimen-electrolyte.amounts',
    _type: 'observation',
    product: ref(P11),
    type: 'ingredient_amount',
    value: 'Label declares 300 mg sodium, 150 mg potassium and 50 mg magnesium per sachet.',
    source: ref('source.label.specimen-electrolyte'),
    sourceType: 'PHYSICAL_PACK',
    sourceLocator: 'Nutrition information, rows 1–3',
    observedAt: '2026-09-26T10:00:00Z',
    observedBy: EDITOR,
    extractionMethod: 'manual',
    verificationStatus: 'verified',
    isDemo: true,
  },

  {
    _id: 'observation.specimen-electrolyte.veg',
    _type: 'observation',
    product: ref(P11),
    type: 'veg_mark',
    value: 'Green vegetarian mark present on the carton.',
    source: ref('source.label.specimen-electrolyte'),
    sourceType: 'PHYSICAL_PACK',
    sourceLocator: 'Carton front',
    observedAt: '2026-09-26T10:00:00Z',
    observedBy: EDITOR,
    extractionMethod: 'manual',
    verificationStatus: 'verified',
    isDemo: true,
  },

  // ─── P12 · DRAFT product with an approved goal link: must never appear ─
  {
    _id: P12,
    _type: 'product',
    name: 'Unpublished Sleep Gummies',
    slug: slug('draft-sleep-gummies'),
    brand: ref('brand.sampleworks'),
    category: ref('category.vitamins-minerals'),
    format: 'gummy',
    serving: serving('2 gummies'),
    servingSizeText: '2 gummies',
    vegStatus: 'UNKNOWN',
    vegStatusReason: 'Not yet verified from the label.',
    ...published('2026-09-27'),
    workflowStatus: 'DRAFT',
  },
];

// ─── Commerce ────────────────────────────────────────────────────────────

export const goalCommerce: RawDoc[] = [
  {
    _id: 'merchant.specimen-store',
    _type: 'merchant',
    name: 'Specimen Nutrition store',
    slug: slug('specimen-store'),
    websiteUrl: 'https://specimen.example',
    kind: 'OFFICIAL_STORE',
    brand: ref('brand.specimen'),
  },
  {
    _id: 'price.specimen-electrolyte.store.2026-09-27',
    _type: 'priceSnapshot',
    product: ref(P11),
    merchant: ref('merchant.specimen-store'),
    price: 499,
    mrp: 599,
    currency: 'INR',
    packSize: qty(20, 'count'),
    servings: 20,
    capturedAt: '2026-09-27T11:00:00Z',
    availability: 'in_stock',
    sourceUrl: 'https://specimen.example/products/electrolyte-lemon',
    source: ref('source.brand-site.demo'),
    notes: 'Demo price observation.',
    isDemo: true,
  },
  {
    _id: 'price.specimen-electrolyte.amazon.2026-09-27',
    _type: 'priceSnapshot',
    product: ref(P11),
    merchant: ref('merchant.amazon-in'),
    price: 479,
    currency: 'INR',
    packSize: qty(20, 'count'),
    servings: 20,
    capturedAt: '2026-09-27T12:00:00Z',
    availability: 'in_stock',
    source: ref('source.marketplace.demo'),
    notes: 'Demo price observation.',
    isDemo: true,
  },
  {
    _id: 'offer.specimen-electrolyte.store',
    _type: 'affiliateOffer',
    product: ref(P11),
    merchant: ref('merchant.specimen-store'),
    destinationUrl: 'https://specimen.example/products/electrolyte-lemon',
    affiliateUrl: null,
    relationship: 'none',
    active: true,
    disclosureRequired: false,
    lastCheckedAt: '2026-09-27T12:00:00Z',
    isDemo: true,
  },
  {
    _id: 'offer.specimen-electrolyte.amazon',
    _type: 'affiliateOffer',
    product: ref(P11),
    merchant: ref('merchant.amazon-in'),
    destinationUrl: 'https://example.com/demo/amazon/specimen-electrolyte',
    affiliateUrl: 'https://example.com/demo/amazon/specimen-electrolyte?tag=labelsfyi-demo',
    affiliateNetwork: 'Demo network',
    trackingId: 'labelsfyi-demo',
    relationship: 'affiliate',
    active: true,
    disclosureRequired: true,
    lastCheckedAt: '2026-09-27T12:00:00Z',
    isDemo: true,
  },
];

// ─── Product ↔ goal relationships ────────────────────────────────────────

const rel = (
  id: string,
  product: string,
  goal: string,
  basis: string,
  statement: string,
  locator: string,
  status = 'APPROVED',
): RawDoc => ({
  _id: `productGoal.${id}`,
  _type: 'productGoal',
  product: ref(product),
  goal: ref(`goal.${goal}`),
  basis,
  statement,
  source: ref('source.brand-site.demo'),
  sourceUrl: 'https://example.com/demo/brand-pages',
  sourceLocator: locator,
  observedAt: '2026-09-25T10:00:00Z',
  status,
  ...(status === 'APPROVED' ? { reviewedBy: EDITOR, reviewedAt: '2026-09-26T10:00:00Z' } : {}),
  isDemo: true,
});

export const productGoals: RawDoc[] = [
  rel(
    'bisglycinate-sleep',
    'product.testbed-magnesium-bisglycinate',
    'sleep',
    'BRAND_MARKETING',
    'Night-time magnesium',
    'Front label',
  ),
  rel(
    'citrate-b6-stress',
    'product.specimen-magnesium-citrate-b6',
    'stress',
    'BRAND_MARKETING',
    'Stress support',
    'Product tags',
  ),
  rel(
    'citrate-b6-sleep',
    'product.specimen-magnesium-citrate-b6',
    'sleep',
    'BRAND_MARKETING',
    'Rest & relax',
    'Product title area',
  ),
  rel(
    'ashwagandha-stress',
    P10,
    'stress',
    'BRAND_MARKETING',
    'Everyday stress support',
    'Front label',
  ),
  rel(
    'd3-immunity',
    'product.testbed-d3',
    'immunity',
    'BRAND_MARKETING',
    'Supports immune function',
    'Front label',
  ),
  rel(
    'electrolyte-hydration',
    P11,
    'hydration',
    'BRAND_MARKETING',
    'Hydration support',
    'Front label',
  ),
  // Hidden: only a candidate (an ingredient match is never enough by itself).
  rel(
    'oxide-sleep',
    'product.sampleworks-magnesium-oxide',
    'sleep',
    'INGREDIENT_MATCH',
    'Contains magnesium',
    'Supplement facts',
    'CANDIDATE',
  ),
  // Hidden: the product is a draft.
  rel('draft-gummies-sleep', P12, 'sleep', 'BRAND_MARKETING', 'Sleep support', 'Front label'),
];
