import type { RawDoc } from './helpers.ts';
import { key, keyedRef, published, qty, ref, slug } from './helpers.ts';

/**
 * FICTIONAL demo products. Every brand, product, label, claim, price and link
 * in this file is invented to exercise the data model and UI states
 * (missing price, unknown veg status, proprietary blends, superseded labels,
 * outdated review, inactive offer…). None of it describes a real product.
 */

const docs: RawDoc[] = [];
const push = (d: RawDoc) => {
  docs.push(d);
  return d;
};

// ─── Row builders ──────────────────────────────────────────────────────────

const nutrient = (
  name: string,
  nutrientKey: string | null,
  unit: string,
  perServing: number | null,
  per100: number | null,
  indent = 0,
) => ({
  _key: key(),
  _type: 'labelNutrient',
  name,
  nutrientKey,
  unit,
  perServing,
  per100,
  dailyValuePercent: null,
  indent,
});

const ingredientRow = (r: {
  displayName: string;
  ingredient?: string;
  amount?: number;
  unit?: string;
  amountPerServing?: number;
  dailyValuePercent?: number;
  blendName?: string;
  isKeyActive?: boolean;
  observation?: string;
  editorialNote?: string;
  order: number;
}) => ({
  _key: key(),
  _type: 'labelIngredient',
  ingredient: r.ingredient ? ref(r.ingredient) : null,
  displayName: r.displayName,
  amount: r.amount ?? null,
  unit: r.unit ?? null,
  amountPerServing: r.amountPerServing ?? null,
  dailyValue: null,
  dailyValuePercent: r.dailyValuePercent ?? null,
  proprietaryBlend: Boolean(r.blendName),
  blendName: r.blendName ?? null,
  orderOnLabel: r.order,
  isKeyActive: r.isKeyActive ?? false,
  observation: r.observation ?? null,
  editorialNote: r.editorialNote ?? null,
});

const evidence = (
  summary: string,
  source: string,
  relevance: 'direct' | 'indirect' | 'background',
  population?: string,
) => ({
  _key: key(),
  _type: 'evidence',
  summary,
  relevance,
  population: population ?? null,
  source: ref(source),
});

interface ClaimInput {
  id: string;
  product: string;
  exactClaim: string;
  claimType: string;
  location: string;
  assessment: string;
  status: string;
  explanation: string;
  evidence: ReturnType<typeof evidence>[];
  sources: string[];
  reviewedAt: string;
  order: number;
  supersededAt?: string;
  observedAt?: string;
  observation?: string;
}

const claim = (c: ClaimInput) =>
  push({
    _id: `claim.${c.id}`,
    _type: 'claim',
    product: ref(c.product),
    exactClaim: c.exactClaim,
    claimType: c.claimType,
    locationOnProduct: c.location,
    assessment: c.assessment,
    assessmentStatus: c.status,
    explanation: c.explanation,
    evidence: c.evidence,
    sources: c.sources.map(keyedRef),
    reviewer: ref('reviewer.demo'),
    reviewedAt: c.reviewedAt,
    order: c.order,
    observedAt: c.observedAt ? `${c.observedAt}T10:00:00Z` : null,
    observation: c.observation ? ref(c.observation) : null,
    status: c.supersededAt ? 'superseded' : 'current',
    supersededAt: c.supersededAt ? `${c.supersededAt}T10:00:00Z` : null,
    ...published(c.reviewedAt),
  });

const observation = (o: {
  id: string;
  product: string;
  type: string;
  value: string;
  source: string;
  observedAt: string;
  notes?: string;
  supersededBy?: string;
  supersededAt?: string;
}) =>
  push({
    _id: `observation.${o.id}`,
    _type: 'observation',
    product: ref(o.product),
    type: o.type,
    value: o.value,
    source: ref(o.source),
    observedAt: `${o.observedAt}T10:00:00Z`,
    observedBy: 'labels.fyi editorial (demo)',
    notes: o.notes ?? null,
    supersededBy: o.supersededBy ? ref(o.supersededBy) : null,
    supersededAt: o.supersededAt ? `${o.supersededAt}T10:00:00Z` : null,
    isDemo: true,
  });

const price = (p: {
  id: string;
  product: string;
  merchant: string;
  price: number;
  pack: [number, string];
  servings: number | null;
  capturedAt: string;
  availability?: 'in_stock' | 'out_of_stock' | 'unknown';
  mrp?: number;
  listing?: string;
  sourceUrl?: string;
}) =>
  push({
    _id: `price.${p.id}`,
    mrp: p.mrp ?? null,
    listing: p.listing ? ref(p.listing) : null,
    sourceUrl: p.sourceUrl ?? null,
    _type: 'priceSnapshot',
    product: ref(p.product),
    merchant: ref(p.merchant),
    price: p.price,
    currency: 'INR',
    packSize: qty(p.pack[0], p.pack[1]),
    servings: p.servings,
    capturedAt: `${p.capturedAt}T11:00:00Z`,
    availability: p.availability ?? 'in_stock',
    source: ref('source.marketplace.demo'),
    notes: 'Demo price observation.',
    isDemo: true,
  });

const offer = (o: {
  id: string;
  product: string;
  merchant: string;
  affiliate: boolean;
  active?: boolean;
  lastCheckedAt: string;
}) =>
  push({
    _id: `offer.${o.id}`,
    _type: 'affiliateOffer',
    product: ref(o.product),
    merchant: ref(o.merchant),
    destinationUrl: `https://example.com/demo/${o.id}`,
    affiliateUrl: o.affiliate ? `https://example.com/demo/${o.id}?tag=labelsfyi-demo` : null,
    relationship: o.affiliate ? 'affiliate' : 'none',
    active: o.active ?? true,
    disclosureRequired: o.affiliate,
    lastCheckedAt: `${o.lastCheckedAt}T12:00:00Z`,
    isDemo: true,
  });

const panel = (p: RawDoc) =>
  push({ isDemo: true, capturedBy: 'labels.fyi editorial (demo)', ...p });

// ─── P1 · Specimen Nutrition Creatine Monohydrate ─────────────────────────

const P1 = 'product.specimen-creatine';
push({
  _id: P1,
  _type: 'product',
  name: 'Creatine Monohydrate, Unflavoured',
  slug: slug('specimen-nutrition-creatine-monohydrate-unflavoured'),
  featured: true,
  brand: ref('brand.specimen'),
  category: ref('category.creatine'),
  subcategory: 'Creatine monohydrate',
  format: 'powder',
  servingSize: qty(5, 'g'),
  servingSizeText: '1 scoop (5 g)',
  servingsPerContainer: 50,
  vegStatus: 'VEGETARIAN',
  vegStatusReason:
    'Green vegetarian mark on the back label. The ingredient list contains a single ingredient: creatine monohydrate.',
  countryOfOrigin: 'India',
  manufacturer: 'Fictional contract manufacturer (demo)',
  description:
    'A single-ingredient creatine monohydrate powder in a 250 g tub. The current label declares 5 g creatine per 5 g scoop; an earlier label used a 3 g scoop.',
  labelImages: [],
  firstPublishedAt: '2026-03-02T09:00:00Z',
  lastVerifiedAt: '2026-09-12T10:00:00Z',
  ...published('2026-03-02', '2026-09-14'),
});
panel({
  _id: 'panel.specimen-creatine.facts.2026-09',
  _type: 'labelPanel',
  product: ref(P1),
  panelType: 'supplement_facts',
  title: 'Supplement facts',
  servingSize: qty(5, 'g'),
  servingSizeText: '1 scoop (5 g)',
  servingsPerContainer: 50,
  per100Basis: 'g',
  nutrients: [nutrient('Energy', 'energy', 'kcal', 0, 0)],
  ingredients: [
    ingredientRow({
      displayName: 'Creatine monohydrate',
      ingredient: 'ingredient.creatine-monohydrate',
      amount: 5,
      unit: 'g',
      amountPerServing: 5,
      isKeyActive: true,
      order: 1,
    }),
  ],
  ingredientsText: 'Creatine monohydrate.',
  capturedAt: '2026-09-12T10:00:00Z',
  source: ref('source.label.specimen-creatine-2026-09'),
  status: 'current',
});
panel({
  _id: 'panel.specimen-creatine.directions.2026-09',
  _type: 'labelPanel',
  product: ref(P1),
  panelType: 'directions',
  title: 'Directions',
  text: 'Mix 1 scoop (5 g) in 200–250 ml of water or juice. Use once daily.',
  capturedAt: '2026-09-12T10:00:00Z',
  source: ref('source.label.specimen-creatine-2026-09'),
  status: 'current',
});
panel({
  _id: 'panel.specimen-creatine.facts.2026-02',
  _type: 'labelPanel',
  product: ref(P1),
  panelType: 'supplement_facts',
  title: 'Supplement facts (earlier label)',
  servingSize: qty(3, 'g'),
  servingSizeText: '1 scoop (3 g)',
  servingsPerContainer: 83,
  per100Basis: 'g',
  nutrients: [],
  ingredients: [
    ingredientRow({
      displayName: 'Creatine monohydrate',
      ingredient: 'ingredient.creatine-monohydrate',
      amount: 3,
      unit: 'g',
      amountPerServing: 3,
      isKeyActive: true,
      order: 1,
    }),
  ],
  ingredientsText: 'Creatine monohydrate.',
  capturedAt: '2026-02-10T10:00:00Z',
  source: ref('source.label.specimen-creatine-2026-02'),
  status: 'superseded',
  notes: 'Replaced by the September 2026 label, which uses a 5 g scoop.',
});
claim({
  id: 'specimen-creatine.5g',
  product: P1,
  observedAt: '2026-09-12',
  observation: 'observation.specimen-creatine.front.2026-09',
  exactClaim: '5g creatine per serving',
  claimType: 'nutrition',
  location: 'Front label',
  assessment: 'The supplement facts panel lists 5 g creatine monohydrate per 5 g scoop.',
  status: 'supported',
  explanation:
    'The front-label figure matches the supplement facts panel on the current label. This reflects what the manufacturer declares; labels.fyi has not laboratory-tested this product.',
  evidence: [
    evidence(
      'Supplement facts panel: creatine monohydrate 5 g per serving (1 scoop, 5 g).',
      'source.label.specimen-creatine-2026-09',
      'direct',
    ),
  ],
  sources: ['source.label.specimen-creatine-2026-09'],
  reviewedAt: '2026-09-14',
  order: 1,
});
claim({
  id: 'specimen-creatine.strength',
  product: P1,
  exactClaim: 'Increases strength & power',
  claimType: 'performance',
  location: 'Front label',
  assessment:
    'Creatine monohydrate has strong evidence for improving high-intensity exercise performance alongside training.',
  status: 'requires_context',
  explanation:
    'Benefits in research are seen mainly in repeated high-intensity exercise and resistance training, together with a training programme. The label does not say for whom or under what conditions, and individual responses vary.',
  evidence: [
    evidence(
      'Position stand concludes creatine monohydrate supplementation improves high-intensity exercise capacity and training adaptations.',
      'source.issn-creatine-2017',
      'indirect',
      'Mostly trained and recreationally active adults',
    ),
  ],
  sources: ['source.issn-creatine-2017'],
  reviewedAt: '2026-09-14',
  order: 2,
});
claim({
  id: 'specimen-creatine.pure',
  product: P1,
  exactClaim: '100% pure',
  claimType: 'purity',
  location: 'Front label',
  assessment: 'The ingredient list names one ingredient. Purity cannot be verified from the label.',
  status: 'not_verifiable',
  explanation:
    'The pack does not reference a certificate of analysis, a testing laboratory or a test date. A single-ingredient list is consistent with the claim but does not demonstrate purity.',
  evidence: [
    evidence(
      'Ingredient list: "Creatine monohydrate." No testing information printed on pack.',
      'source.label.specimen-creatine-2026-09',
      'direct',
    ),
  ],
  sources: ['source.label.specimen-creatine-2026-09'],
  reviewedAt: '2026-09-14',
  order: 3,
});
observation({
  id: 'specimen-creatine.serving.2026-02',
  product: P1,
  type: 'serving_size',
  value: 'Serving size printed as 1 scoop (3 g); 83 servings per 250 g.',
  source: 'source.label.specimen-creatine-2026-02',
  observedAt: '2026-02-10',
  supersededBy: 'observation.specimen-creatine.serving.2026-09',
  supersededAt: '2026-09-12',
});
// The February label claimed 3 g per scoop. Kept, marked superseded.
claim({
  id: 'specimen-creatine.3g-2026-02',
  product: P1,
  observedAt: '2026-02-10',
  observation: 'observation.specimen-creatine.front.2026-02',
  exactClaim: '3g pure creatine in every scoop',
  claimType: 'nutrition',
  location: 'Front label (earlier label)',
  assessment: 'The February 2026 label listed 3 g creatine monohydrate per 3 g scoop.',
  status: 'supported',
  explanation:
    'This matched the supplement facts panel on that label. The current label uses a 5 g scoop and no longer carries this claim.',
  evidence: [
    evidence(
      'Earlier supplement facts panel: creatine monohydrate 3 g per serving (1 scoop, 3 g).',
      'source.label.specimen-creatine-2026-02',
      'direct',
    ),
  ],
  sources: ['source.label.specimen-creatine-2026-02'],
  reviewedAt: '2026-03-01',
  order: 9,
  supersededAt: '2026-09-12',
});
observation({
  id: 'specimen-creatine.front.2026-02',
  product: P1,
  type: 'front_label_claim',
  value: 'Front label (February 2026) states "3g pure creatine in every scoop".',
  source: 'source.label.specimen-creatine-2026-02',
  observedAt: '2026-02-10',
  supersededBy: 'observation.specimen-creatine.front.2026-09',
  supersededAt: '2026-09-12',
});
observation({
  id: 'specimen-creatine.label-change.2026-09',
  product: P1,
  type: 'label_change',
  value:
    'New label observed: scoop size changed from 3 g to 5 g; servings per 250 g changed from 83 to 50. Ingredient list unchanged.',
  source: 'source.label.specimen-creatine-2026-09',
  observedAt: '2026-09-12',
});
observation({
  id: 'specimen-creatine.serving.2026-09',
  product: P1,
  type: 'serving_size',
  value: 'Serving size printed as 1 scoop (5 g); 50 servings per 250 g.',
  source: 'source.label.specimen-creatine-2026-09',
  observedAt: '2026-09-12',
});
observation({
  id: 'specimen-creatine.front.2026-09',
  product: P1,
  type: 'front_label_claim',
  value: 'Front label states "5g creatine per serving".',
  source: 'source.label.specimen-creatine-2026-09',
  observedAt: '2026-09-12',
});
observation({
  id: 'specimen-creatine.veg.2026-09',
  product: P1,
  type: 'veg_mark',
  value: 'Green vegetarian mark present on back label.',
  source: 'source.label.specimen-creatine-2026-09',
  observedAt: '2026-09-12',
});
price({
  id: 'specimen-creatine.amazon.2026-09-12',
  product: P1,
  merchant: 'merchant.amazon-in',
  price: 899,
  pack: [250, 'g'],
  servings: 50,
  capturedAt: '2026-09-12',
});
price({
  id: 'specimen-creatine.brand.2026-09-10',
  product: P1,
  merchant: 'merchant.brand-site',
  price: 949,
  pack: [250, 'g'],
  servings: 50,
  capturedAt: '2026-09-10',
});
price({
  id: 'specimen-creatine.amazon.2026-06-01',
  product: P1,
  merchant: 'merchant.amazon-in',
  price: 849,
  pack: [250, 'g'],
  servings: 83,
  capturedAt: '2026-06-01',
});
offer({
  id: 'specimen-creatine.amazon',
  product: P1,
  merchant: 'merchant.amazon-in',
  affiliate: true,
  lastCheckedAt: '2026-09-12',
});
offer({
  id: 'specimen-creatine.brand',
  product: P1,
  merchant: 'merchant.brand-site',
  affiliate: false,
  lastCheckedAt: '2026-09-10',
});

// ─── P2 · Sampleworks Micronised Creatine, Lemon ──────────────────────────

const P2 = 'product.sampleworks-creatine';
push({
  _id: P2,
  _type: 'product',
  name: 'Micronised Creatine, Lemon Iced Tea',
  slug: slug('sampleworks-micronised-creatine-lemon-iced-tea'),
  featured: true,
  brand: ref('brand.sampleworks'),
  category: ref('category.creatine'),
  subcategory: 'Flavoured creatine',
  format: 'powder',
  servingSize: qty(4, 'g'),
  servingSizeText: '1 scoop (4 g)',
  servingsPerContainer: 75,
  vegStatus: 'VEGETARIAN',
  vegStatusReason: 'Green vegetarian mark on the label. No animal-derived ingredients are listed.',
  countryOfOrigin: 'India',
  manufacturer: 'Fictional contract manufacturer (demo)',
  description:
    'A flavoured, micronised creatine powder. Each 4 g scoop provides 3 g creatine; the rest is flavouring, acidity regulator and sweetener.',
  labelImages: [],
  firstPublishedAt: '2026-04-11T09:00:00Z',
  lastVerifiedAt: '2026-09-15T10:00:00Z',
  ...published('2026-04-11', '2026-09-16'),
});
panel({
  _id: 'panel.sampleworks-creatine.facts',
  _type: 'labelPanel',
  product: ref(P2),
  panelType: 'nutrition',
  title: 'Nutrition information',
  servingSize: qty(4, 'g'),
  servingSizeText: '1 scoop (4 g)',
  servingsPerContainer: 75,
  per100Basis: 'g',
  nutrients: [
    nutrient('Energy', 'energy', 'kcal', 0.4, 10),
    nutrient('Carbohydrate', 'carbohydrate', 'g', 0.1, 2.5),
    nutrient('Total sugars', 'total_sugars', 'g', 0, 0, 1),
    nutrient('Added sugars', 'added_sugars', 'g', 0, 0, 1),
    nutrient('Sodium', 'sodium', 'mg', 2, 50),
  ],
  ingredients: [
    ingredientRow({
      displayName: 'Creatine monohydrate (micronised) (75%)',
      ingredient: 'ingredient.creatine-monohydrate',
      amount: 3,
      unit: 'g',
      amountPerServing: 3,
      isKeyActive: true,
      order: 1,
    }),
    ingredientRow({ displayName: 'Acidity regulator (INS 330)', order: 2 }),
    ingredientRow({ displayName: 'Nature-identical flavouring substances', order: 3 }),
    ingredientRow({ displayName: 'Sweetener (INS 955)', order: 4 }),
  ],
  ingredientsText:
    'Creatine monohydrate (micronised) (75%), acidity regulator (INS 330), nature-identical flavouring substances, sweetener (INS 955).',
  capturedAt: '2026-09-15T10:00:00Z',
  source: ref('source.label.sampleworks-creatine'),
  status: 'current',
});
claim({
  id: 'sampleworks-creatine.3000mg',
  product: P2,
  exactClaim: '3000 mg creatine per scoop',
  claimType: 'nutrition',
  location: 'Front label',
  assessment: 'The label lists 3 g creatine per 4 g scoop.',
  status: 'supported',
  explanation:
    'The declared amount matches the ingredient declaration (75% of a 4 g scoop). Note that this is less than 5 g, the upper end of commonly studied daily maintenance doses.',
  evidence: [
    evidence(
      'Ingredient list declares creatine monohydrate at 75% of a 4 g serving.',
      'source.label.sampleworks-creatine',
      'direct',
    ),
  ],
  sources: ['source.label.sampleworks-creatine'],
  reviewedAt: '2026-09-16',
  order: 1,
});
claim({
  id: 'sampleworks-creatine.micronised',
  product: P2,
  exactClaim: 'Micronised for faster absorption',
  claimType: 'formulation',
  location: 'Back label',
  assessment:
    'Micronising reduces particle size, which helps mixing. We found no evidence cited that it improves absorption or results.',
  status: 'insufficient_evidence',
  explanation:
    'The label does not cite a study. Micronised creatine is chemically the same compound as standard creatine monohydrate.',
  evidence: [
    evidence(
      'Position stand does not report consistent advantages for alternative creatine forms over monohydrate.',
      'source.issn-creatine-2017',
      'background',
    ),
  ],
  sources: ['source.issn-creatine-2017'],
  reviewedAt: '2026-09-16',
  order: 2,
});
claim({
  id: 'sampleworks-creatine.zero-sugar',
  product: P2,
  exactClaim: 'Zero sugar',
  claimType: 'nutrition',
  location: 'Front label',
  assessment: 'The nutrition panel lists 0 g total sugars per serving.',
  status: 'supported',
  explanation: 'The product is sweetened with sucralose (INS 955), a non-sugar sweetener.',
  evidence: [
    evidence(
      'Nutrition information: total sugars 0 g, added sugars 0 g per serving; ingredients list sweetener INS 955.',
      'source.label.sampleworks-creatine',
      'direct',
    ),
  ],
  sources: ['source.label.sampleworks-creatine'],
  reviewedAt: '2026-09-16',
  order: 3,
});
observation({
  id: 'sampleworks-creatine.front',
  product: P2,
  type: 'front_label_claim',
  value: 'Front label states "3000 mg creatine per scoop".',
  source: 'source.label.sampleworks-creatine',
  observedAt: '2026-09-15',
});
observation({
  id: 'sampleworks-creatine.veg',
  product: P2,
  type: 'veg_mark',
  value: 'Green vegetarian mark present on the label.',
  source: 'source.label.sampleworks-creatine',
  observedAt: '2026-09-15',
});
price({
  id: 'sampleworks-creatine.amazon.2026-09-15',
  product: P2,
  merchant: 'merchant.amazon-in',
  price: 699,
  pack: [300, 'g'],
  servings: 75,
  capturedAt: '2026-09-15',
});
price({
  id: 'sampleworks-creatine.flipkart.2026-09-02',
  product: P2,
  merchant: 'merchant.flipkart',
  price: 729,
  pack: [300, 'g'],
  servings: 75,
  capturedAt: '2026-09-02',
});
offer({
  id: 'sampleworks-creatine.amazon',
  product: P2,
  merchant: 'merchant.amazon-in',
  affiliate: true,
  lastCheckedAt: '2026-09-15',
});
offer({
  id: 'sampleworks-creatine.flipkart',
  product: P2,
  merchant: 'merchant.flipkart',
  affiliate: true,
  lastCheckedAt: '2026-09-02',
});

// ─── P3 · Testbed Sports Creatine Capsules (non-veg shell, stale price) ──

const P3 = 'product.testbed-creatine-caps';
push({
  _id: P3,
  _type: 'product',
  name: 'Creatine Capsules 750 mg',
  slug: slug('testbed-sports-creatine-capsules-750mg'),
  brand: ref('brand.testbed'),
  category: ref('category.creatine'),
  subcategory: 'Creatine capsules',
  format: 'capsule',
  servingSize: qty(4, 'count'),
  servingSizeText: '4 capsules',
  servingsPerContainer: 30,
  vegStatus: 'NON_VEGETARIAN',
  vegStatusReason:
    'The capsule shell is listed as gelatin, and the label carries the brown non-vegetarian mark.',
  countryOfOrigin: 'India',
  manufacturer: 'Fictional contract manufacturer (demo)',
  description:
    'Creatine monohydrate in hard gelatin capsules. A 4-capsule serving provides 3 g creatine.',
  labelImages: [],
  firstPublishedAt: '2026-05-20T09:00:00Z',
  lastVerifiedAt: '2026-08-20T10:00:00Z',
  ...published('2026-05-20', '2026-08-22'),
});
panel({
  _id: 'panel.testbed-creatine.facts',
  _type: 'labelPanel',
  product: ref(P3),
  panelType: 'supplement_facts',
  title: 'Supplement facts',
  servingSize: qty(4, 'count'),
  servingSizeText: '4 capsules',
  servingsPerContainer: 30,
  per100Basis: null,
  nutrients: [],
  ingredients: [
    ingredientRow({
      displayName: 'Creatine monohydrate',
      ingredient: 'ingredient.creatine-monohydrate',
      amount: 3000,
      unit: 'mg',
      amountPerServing: 3000,
      isKeyActive: true,
      order: 1,
      observation: 'Printed as 750 mg per capsule; 3000 mg per 4-capsule serving.',
    }),
    ingredientRow({ displayName: 'Capsule shell (gelatin)', order: 2 }),
    ingredientRow({ displayName: 'Anticaking agent (INS 470)', order: 3 }),
  ],
  ingredientsText: 'Creatine monohydrate, capsule shell (gelatin), anticaking agent (INS 470).',
  capturedAt: '2026-08-20T10:00:00Z',
  source: ref('source.label.testbed-creatine-caps'),
  status: 'current',
});
claim({
  id: 'testbed-creatine.clinical-dose',
  product: P3,
  exactClaim: 'Clinically studied dose',
  claimType: 'formulation',
  location: 'Front label',
  assessment:
    'A 4-capsule serving gives 3 g, at the lower end of the 3–5 g/day maintenance doses used in research.',
  status: 'partially_supported',
  explanation:
    '3 g/day falls within studied maintenance doses. "Clinically studied" does not mean this product was studied, and loading protocols in research use higher daily amounts.',
  evidence: [
    evidence(
      'Maintenance doses of 3–5 g/day are described in the position stand.',
      'source.issn-creatine-2017',
      'indirect',
    ),
    evidence(
      'Supplement facts: 3000 mg per 4 capsules.',
      'source.label.testbed-creatine-caps',
      'direct',
    ),
  ],
  sources: ['source.issn-creatine-2017', 'source.label.testbed-creatine-caps'],
  reviewedAt: '2026-08-22',
  order: 1,
});
observation({
  id: 'testbed-creatine.shell',
  product: P3,
  type: 'ingredient_presence',
  value: 'Ingredient list contains "capsule shell (gelatin)".',
  source: 'source.label.testbed-creatine-caps',
  observedAt: '2026-08-20',
});
observation({
  id: 'testbed-creatine.veg',
  product: P3,
  type: 'veg_mark',
  value: 'Brown non-vegetarian mark present on bottle label.',
  source: 'source.label.testbed-creatine-caps',
  observedAt: '2026-08-20',
});
price({
  id: 'testbed-creatine.healthkart.2026-08-20',
  product: P3,
  merchant: 'merchant.healthkart',
  price: 1099,
  pack: [120, 'count'],
  servings: 30,
  capturedAt: '2026-08-20',
});
offer({
  id: 'testbed-creatine.healthkart',
  product: P3,
  merchant: 'merchant.healthkart',
  affiliate: true,
  active: false,
  lastCheckedAt: '2026-09-20',
});

// ─── P4 · Specimen Nutrition Whey Protein Concentrate ─────────────────────

const P4 = 'product.specimen-whey';
push({
  _id: P4,
  _type: 'product',
  name: 'Whey Protein Concentrate, Rich Chocolate',
  slug: slug('specimen-nutrition-whey-protein-concentrate-rich-chocolate'),
  featured: true,
  brand: ref('brand.specimen'),
  category: ref('category.protein-powder'),
  subcategory: 'Whey concentrate',
  format: 'powder',
  servingSize: qty(33, 'g'),
  servingSizeText: '1 scoop (33 g)',
  servingsPerContainer: 30,
  vegStatus: 'VEGETARIAN',
  vegStatusReason:
    'Contains milk-derived ingredients (whey protein concentrate). Green vegetarian mark present on the label.',
  countryOfOrigin: 'India',
  manufacturer: 'Fictional contract manufacturer (demo)',
  description:
    'A chocolate-flavoured whey concentrate with 24 g protein per 33 g scoop, sweetened with sucralose and containing a small proprietary enzyme blend.',
  labelImages: [],
  firstPublishedAt: '2026-03-15T09:00:00Z',
  lastVerifiedAt: '2026-09-18T10:00:00Z',
  ...published('2026-03-15', '2026-09-19'),
});
panel({
  _id: 'panel.specimen-whey.nutrition',
  _type: 'labelPanel',
  product: ref(P4),
  panelType: 'nutrition',
  title: 'Nutrition information',
  servingSize: qty(33, 'g'),
  servingSizeText: '1 scoop (33 g)',
  servingsPerContainer: 30,
  per100Basis: 'g',
  nutrients: [
    nutrient('Energy', 'energy', 'kcal', 131, 397),
    nutrient('Protein', 'protein', 'g', 24, 72.7),
    nutrient('Carbohydrate', 'carbohydrate', 'g', 4.2, 12.7),
    nutrient('Total sugars', 'total_sugars', 'g', 1.1, 3.3, 1),
    nutrient('Added sugars', 'added_sugars', 'g', 0, 0, 1),
    nutrient('Total fat', 'total_fat', 'g', 2.0, 6.1),
    nutrient('Saturated fat', 'saturated_fat', 'g', 1.2, 3.6, 1),
    nutrient('Trans fat', 'trans_fat', 'g', 0, 0, 1),
    nutrient('Cholesterol', 'cholesterol', 'mg', 55, 167),
    nutrient('Sodium', 'sodium', 'mg', 95, 288),
  ],
  ingredients: [
    ingredientRow({
      displayName: 'Whey protein concentrate (milk) (88%)',
      ingredient: 'ingredient.whey-protein',
      editorialNote:
        '88% is the share of the powder made up of whey protein concentrate, not its protein content. Protein per serving is on the nutrition panel.',
      isKeyActive: true,
      order: 1,
    }),
    ingredientRow({ displayName: 'Cocoa powder (6%)', order: 2 }),
    ingredientRow({ displayName: 'Thickener (INS 415)', order: 3 }),
    ingredientRow({ displayName: 'Nature-identical flavouring substances', order: 4 }),
    ingredientRow({ displayName: 'Sweetener (INS 955)', order: 5 }),
    ingredientRow({
      displayName: 'Papain',
      blendName: 'Digestive enzyme blend (50 mg)',
      order: 6,
    }),
    ingredientRow({
      displayName: 'Bromelain',
      blendName: 'Digestive enzyme blend (50 mg)',
      order: 7,
    }),
  ],
  ingredientsText:
    'Whey protein concentrate (milk) (88%), cocoa powder (6%), thickener (INS 415), nature-identical flavouring substances, sweetener (INS 955), digestive enzyme blend [papain, bromelain] (50 mg).',
  capturedAt: '2026-09-18T10:00:00Z',
  source: ref('source.label.specimen-whey'),
  status: 'current',
});
panel({
  _id: 'panel.specimen-whey.warnings',
  _type: 'labelPanel',
  product: ref(P4),
  panelType: 'warnings',
  title: 'Allergen & advisory',
  text: 'Contains milk. Not for medicinal use. Not recommended for children, pregnant or lactating women.',
  capturedAt: '2026-09-18T10:00:00Z',
  source: ref('source.label.specimen-whey'),
  status: 'current',
});
claim({
  id: 'specimen-whey.24g',
  product: P4,
  observedAt: '2026-09-18',
  observation: 'observation.specimen-whey.front',
  exactClaim: '24g protein per serving',
  claimType: 'nutrition',
  location: 'Front label',
  assessment: 'The nutrition panel lists 24 g protein per 33 g serving (72.7 g per 100 g).',
  status: 'supported',
  explanation:
    'The front-label figure matches the nutrition information panel. Protein content is as declared by the manufacturer; labels.fyi has not laboratory-tested this product.',
  evidence: [
    evidence(
      'Nutrition information: protein 24 g per serving; 72.7 g per 100 g.',
      'source.label.specimen-whey',
      'direct',
    ),
  ],
  sources: ['source.label.specimen-whey'],
  reviewedAt: '2026-09-19',
  order: 1,
});
claim({
  id: 'specimen-whey.lean-muscle',
  product: P4,
  exactClaim: 'Builds lean muscle',
  claimType: 'performance',
  location: 'Front label',
  assessment:
    'Protein supports muscle gain when combined with resistance training and adequate total intake. Protein alone does not build muscle.',
  status: 'requires_context',
  explanation:
    'Whether a protein supplement makes a difference depends on how much protein your diet already provides and whether you do resistance training.',
  evidence: [
    evidence(
      'Position stand: protein intakes of 1.4–2.0 g/kg/day support muscle gain in exercising individuals; supplements are one way to reach this.',
      'source.issn-protein-2017',
      'indirect',
      'Exercising adults',
    ),
  ],
  sources: ['source.issn-protein-2017'],
  reviewedAt: '2026-09-19',
  order: 2,
});
claim({
  id: 'specimen-whey.no-added-sugar',
  product: P4,
  exactClaim: 'No added sugar',
  claimType: 'nutrition',
  location: 'Front label',
  assessment: 'The nutrition panel lists 0 g added sugars; total sugars are 1.1 g per serving.',
  status: 'supported',
  explanation:
    'The product contains a non-sugar sweetener (sucralose, INS 955). "No added sugar" does not mean sugar-free.',
  evidence: [
    evidence(
      'Nutrition information: added sugars 0 g; total sugars 1.1 g per serving. Ingredients list sweetener INS 955.',
      'source.label.specimen-whey',
      'direct',
    ),
  ],
  sources: ['source.label.specimen-whey'],
  reviewedAt: '2026-09-19',
  order: 3,
});
claim({
  id: 'specimen-whey.lab-tested',
  product: P4,
  exactClaim: 'Lab tested for purity',
  claimType: 'quality',
  location: 'Back label',
  assessment:
    'The label names no laboratory, test date or certificate. Not verifiable from the pack.',
  status: 'not_verifiable',
  explanation:
    'labels.fyi could not find testing details on the pack. If the brand publishes a batch certificate, we will review it and update this claim.',
  evidence: [
    evidence(
      'No testing laboratory, certificate or batch reference printed on the label.',
      'source.label.specimen-whey',
      'direct',
    ),
  ],
  sources: ['source.label.specimen-whey'],
  reviewedAt: '2026-09-19',
  order: 4,
});
observation({
  id: 'specimen-whey.front',
  product: P4,
  type: 'front_label_claim',
  value: 'Front label states "24g protein per serving".',
  source: 'source.label.specimen-whey',
  observedAt: '2026-09-18',
});
observation({
  id: 'specimen-whey.veg',
  product: P4,
  type: 'veg_mark',
  value: 'Green vegetarian mark present on back label.',
  source: 'source.label.specimen-whey',
  observedAt: '2026-09-18',
});
price({
  id: 'specimen-whey.amazon.2026-09-18',
  product: P4,
  merchant: 'merchant.amazon-in',
  mrp: 2799,
  listing: 'productReference.specimen-whey.marketplace',
  sourceUrl: 'https://marketplace.example/listing/SPEC-WPC-CHOC-1KG',
  price: 2249,
  pack: [1, 'kg'],
  servings: 30,
  capturedAt: '2026-09-18',
});
price({
  id: 'specimen-whey.healthkart.2026-09-16',
  product: P4,
  merchant: 'merchant.healthkart',
  mrp: 2799,
  price: 2199,
  pack: [1, 'kg'],
  servings: 30,
  capturedAt: '2026-09-16',
});
price({
  id: 'specimen-whey.flipkart.2026-09-16',
  product: P4,
  merchant: 'merchant.flipkart',
  price: 2399,
  pack: [1, 'kg'],
  servings: 30,
  capturedAt: '2026-09-16',
  availability: 'out_of_stock',
});
offer({
  id: 'specimen-whey.amazon',
  product: P4,
  merchant: 'merchant.amazon-in',
  affiliate: true,
  lastCheckedAt: '2026-09-18',
});
offer({
  id: 'specimen-whey.healthkart',
  product: P4,
  merchant: 'merchant.healthkart',
  affiliate: true,
  lastCheckedAt: '2026-09-16',
});

// ─── P5 · Sampleworks Whey Blend (unknown veg, no price, review overdue) ─

const P5 = 'product.sampleworks-whey';
push({
  _id: P5,
  _type: 'product',
  name: 'Whey Blend, French Vanilla',
  slug: slug('sampleworks-whey-blend-french-vanilla'),
  brand: ref('brand.sampleworks'),
  category: ref('category.protein-powder'),
  subcategory: 'Whey blend',
  format: 'powder',
  servingSize: qty(35, 'g'),
  servingSizeText: '1 scoop (35 g)',
  servingsPerContainer: null,
  vegStatus: 'UNKNOWN',
  vegStatusReason:
    'We could not find a vegetarian or non-vegetarian mark in the label images captured. The product contains milk-derived ingredients, but the flavouring and "amino" blend are not described in enough detail to confirm.',
  countryOfOrigin: 'India',
  manufacturer: 'Fictional contract manufacturer (demo)',
  description:
    'A whey concentrate and isolate blend with a proprietary "Amino Boost" blend. The label does not print servings per container.',
  labelImages: [],
  firstPublishedAt: '2026-02-20T09:00:00Z',
  lastVerifiedAt: '2026-02-18T10:00:00Z',
  workflowStatus: 'NEEDS_REVIEW',
  isDemo: true,
  _createdAt: '2026-02-18T09:00:00Z',
  _updatedAt: '2026-08-02T09:00:00Z',
});
panel({
  _id: 'panel.sampleworks-whey.nutrition',
  _type: 'labelPanel',
  product: ref(P5),
  panelType: 'nutrition',
  title: 'Nutrition information',
  servingSize: qty(35, 'g'),
  servingSizeText: '1 scoop (35 g)',
  servingsPerContainer: null,
  per100Basis: 'g',
  nutrients: [
    nutrient('Energy', 'energy', 'kcal', 139, 397),
    nutrient('Protein', 'protein', 'g', 25, 71.4),
    nutrient('Carbohydrate', 'carbohydrate', 'g', 5.1, 14.6),
    nutrient('Total sugars', 'total_sugars', 'g', 2.4, 6.9, 1),
    nutrient('Total fat', 'total_fat', 'g', 1.8, 5.1),
  ],
  ingredients: [
    ingredientRow({
      displayName: 'Whey protein concentrate (milk)',
      ingredient: 'ingredient.whey-protein',
      blendName: 'Protein blend',
      isKeyActive: true,
      order: 1,
    }),
    ingredientRow({
      displayName: 'Whey protein isolate (milk)',
      ingredient: 'ingredient.whey-protein',
      blendName: 'Protein blend',
      order: 2,
    }),
    ingredientRow({ displayName: 'L-leucine', blendName: 'Amino Boost Blend (5 g)', order: 3 }),
    ingredientRow({ displayName: 'L-glutamine', blendName: 'Amino Boost Blend (5 g)', order: 4 }),
    ingredientRow({ displayName: 'Taurine', blendName: 'Amino Boost Blend (5 g)', order: 5 }),
    ingredientRow({ displayName: 'Flavours', order: 6 }),
    ingredientRow({ displayName: 'Sweetener (INS 960)', order: 7 }),
  ],
  ingredientsText:
    'Protein blend [whey protein concentrate (milk), whey protein isolate (milk)], Amino Boost Blend [L-leucine, L-glutamine, taurine] (5 g), flavours, sweetener (INS 960).',
  capturedAt: '2026-02-18T10:00:00Z',
  source: ref('source.label.sampleworks-whey'),
  status: 'current',
  notes: 'Servings per container is not printed. Pack weight: 2 kg.',
});
claim({
  id: 'sampleworks-whey.25g',
  product: P5,
  exactClaim: '25g protein',
  claimType: 'nutrition',
  location: 'Front label',
  assessment: 'The nutrition panel lists 25 g protein per 35 g serving.',
  status: 'supported',
  explanation:
    'Matches the declared nutrition information. The split between concentrate and isolate is not disclosed.',
  evidence: [
    evidence(
      'Nutrition information: protein 25 g per 35 g serving.',
      'source.label.sampleworks-whey',
      'direct',
    ),
  ],
  sources: ['source.label.sampleworks-whey'],
  reviewedAt: '2026-02-20',
  order: 1,
});
claim({
  id: 'sampleworks-whey.bcaa',
  product: P5,
  exactClaim: 'With 5g BCAA-rich Amino Boost',
  claimType: 'formulation',
  location: 'Front label',
  assessment:
    'The 5 g blend lists leucine, glutamine and taurine without individual amounts, so its BCAA content cannot be determined.',
  status: 'not_verifiable',
  explanation:
    'Of the three listed amino acids, only leucine is a BCAA. Because the blend is proprietary, the label does not show how much leucine it contains.',
  evidence: [
    evidence(
      'Ingredient list: "Amino Boost Blend [L-leucine, L-glutamine, taurine] (5 g)". No per-ingredient amounts.',
      'source.label.sampleworks-whey',
      'direct',
    ),
  ],
  sources: ['source.label.sampleworks-whey'],
  reviewedAt: '2026-02-20',
  order: 2,
});
observation({
  id: 'sampleworks-whey.servings',
  product: P5,
  type: 'servings_per_container',
  value: 'Servings per container not printed on the label. Net weight printed as 2 kg.',
  source: 'source.label.sampleworks-whey',
  observedAt: '2026-02-18',
});
observation({
  id: 'sampleworks-whey.veg',
  product: P5,
  type: 'veg_mark',
  value: 'No veg or non-veg mark visible in captured label images.',
  source: 'source.label.sampleworks-whey',
  observedAt: '2026-02-18',
  notes: 'Label photo of the bottom panel was not captured. Re-check on next review.',
});

// ─── P6 · Testbed Sports Vitamin D3 ───────────────────────────────────────

const P6 = 'product.testbed-d3';
push({
  _id: P6,
  _type: 'product',
  name: 'Vitamin D3 2000 IU Softgels',
  slug: slug('testbed-sports-vitamin-d3-2000-iu-softgels'),
  featured: true,
  brand: ref('brand.testbed'),
  category: ref('category.vitamins-minerals'),
  subcategory: 'Vitamin D',
  format: 'softgel',
  servingSize: qty(1, 'count'),
  servingSizeText: '1 softgel',
  servingsPerContainer: 60,
  vegStatus: 'NON_VEGETARIAN',
  vegStatusReason:
    'The softgel shell lists gelatin, and the brown non-vegetarian mark is printed on the label.',
  countryOfOrigin: 'India',
  manufacturer: 'Fictional contract manufacturer (demo)',
  description:
    'Cholecalciferol in sunflower oil, in gelatin softgels. 2000 IU (50 mcg) per softgel.',
  labelImages: [],
  firstPublishedAt: '2026-06-02T09:00:00Z',
  lastVerifiedAt: '2026-09-20T10:00:00Z',
  ...published('2026-06-02', '2026-09-21'),
});
panel({
  _id: 'panel.testbed-d3.facts',
  _type: 'labelPanel',
  product: ref(P6),
  panelType: 'supplement_facts',
  title: 'Supplement facts',
  servingSize: qty(1, 'count'),
  servingSizeText: '1 softgel',
  servingsPerContainer: 60,
  per100Basis: null,
  nutrients: [],
  ingredients: [
    ingredientRow({
      displayName: 'Vitamin D3 (as cholecalciferol)',
      ingredient: 'ingredient.vitamin-d3',
      amount: 2000,
      unit: 'IU',
      amountPerServing: 2000,
      isKeyActive: true,
      order: 1,
      observation: 'Also printed as 50 mcg.',
    }),
    ingredientRow({ displayName: 'Sunflower oil', order: 2 }),
    ingredientRow({ displayName: 'Softgel shell (gelatin, glycerin, purified water)', order: 3 }),
  ],
  ingredientsText:
    'Sunflower oil, softgel shell (gelatin, humectant [INS 422], purified water), vitamin D3 (cholecalciferol).',
  capturedAt: '2026-09-20T10:00:00Z',
  source: ref('source.label.testbed-d3'),
  status: 'current',
});
claim({
  id: 'testbed-d3.bones',
  product: P6,
  exactClaim: 'Supports strong bones',
  claimType: 'health',
  location: 'Front label',
  assessment:
    'Vitamin D is needed for bone health. Whether a supplement helps depends on your vitamin D status.',
  status: 'requires_context',
  explanation:
    'People with adequate vitamin D levels may not benefit from more. 2000 IU/day is below the 4000 IU/day adult upper limit summarised by NIH ODS. A blood test is the only way to know your status.',
  evidence: [
    evidence(
      'Vitamin D promotes calcium absorption and is needed for bone growth and remodelling.',
      'source.ods-vitamin-d',
      'background',
    ),
  ],
  sources: ['source.ods-vitamin-d'],
  reviewedAt: '2026-09-21',
  order: 1,
});
claim({
  id: 'testbed-d3.2000iu',
  product: P6,
  exactClaim: 'High strength 2000 IU',
  claimType: 'nutrition',
  location: 'Front label',
  assessment: 'The supplement facts panel lists 2000 IU (50 mcg) vitamin D3 per softgel.',
  status: 'supported',
  explanation: '"High strength" is a marketing description; the declared amount is 2000 IU.',
  evidence: [
    evidence(
      'Supplement facts: vitamin D3 (as cholecalciferol) 2000 IU / 50 mcg per softgel.',
      'source.label.testbed-d3',
      'direct',
    ),
  ],
  sources: ['source.label.testbed-d3'],
  reviewedAt: '2026-09-21',
  order: 2,
});
observation({
  id: 'testbed-d3.veg',
  product: P6,
  type: 'veg_mark',
  value: 'Brown non-vegetarian mark present; softgel shell lists gelatin.',
  source: 'source.label.testbed-d3',
  observedAt: '2026-09-20',
});
price({
  id: 'testbed-d3.amazon.2026-09-20',
  product: P6,
  merchant: 'merchant.amazon-in',
  price: 449,
  pack: [60, 'count'],
  servings: 60,
  capturedAt: '2026-09-20',
});
offer({
  id: 'testbed-d3.amazon',
  product: P6,
  merchant: 'merchant.amazon-in',
  affiliate: true,
  lastCheckedAt: '2026-09-20',
});

export const products = docs;
export const PRODUCT_IDS = [P1, P2, P3, P4, P5, P6];
