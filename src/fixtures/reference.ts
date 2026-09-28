import type { RawDoc } from './helpers.ts';
import { published, slug } from './helpers.ts';

/**
 * Reference data for the demo dataset.
 *
 * Brands, products and the reviewer are FICTIONAL. Merchants are real
 * marketplaces, but every price and link attached to them in this dataset is a
 * demo value. Sources are real, publicly available documents; entries whose
 * citations should be re-verified before launch carry a note saying so.
 */

export const reviewer: RawDoc[] = [
  {
    _id: 'reviewer.demo',
    _type: 'reviewer',
    name: 'Demo Reviewer',
    credentials: 'Placeholder, not a real credential',
    organization: null,
    profileSlug: slug('demo-reviewer'),
    isPlaceholder: true,
    isDemo: true,
    bio: 'This is a placeholder reviewer used only for development. labels.fyi never publishes reviews attributed to fictional people. Replace with a real, qualified reviewer (for example a registered dietitian) before any content goes live.',
  },
];

export const merchants: RawDoc[] = [
  {
    _id: 'merchant.amazon-in',
    _type: 'merchant',
    name: 'Amazon.in',
    slug: slug('amazon-in'),
    websiteUrl: 'https://www.amazon.in',
  },
  {
    _id: 'merchant.flipkart',
    _type: 'merchant',
    name: 'Flipkart',
    slug: slug('flipkart'),
    websiteUrl: 'https://www.flipkart.com',
  },
  {
    _id: 'merchant.healthkart',
    _type: 'merchant',
    name: 'HealthKart',
    slug: slug('healthkart'),
    websiteUrl: 'https://www.healthkart.com',
  },
  {
    _id: 'merchant.brand-site',
    _type: 'merchant',
    name: 'Brand website',
    slug: slug('brand-site'),
    websiteUrl: null,
  },
];

export const categories: RawDoc[] = [
  {
    _id: 'category.creatine',
    _type: 'category',
    name: 'Creatine',
    slug: slug('creatine'),
    description:
      'Creatine powders and capsules. Compare how much creatine each serving actually provides and what it costs per 5 g.',
    isDemo: true,
  },
  {
    _id: 'category.protein-powder',
    _type: 'category',
    name: 'Protein powders',
    slug: slug('protein-powder'),
    description:
      'Whey and other protein powders. Protein per serving, sweeteners, blends and cost per 25 g of protein.',
    isDemo: true,
  },
  {
    _id: 'category.vitamins-minerals',
    _type: 'category',
    name: 'Vitamins & minerals',
    slug: slug('vitamins-minerals'),
    description: 'Single-nutrient and multi-nutrient supplements.',
    isDemo: true,
  },
];

export const brands: RawDoc[] = [
  {
    _id: 'brand.specimen',
    _type: 'brand',
    name: 'Specimen Nutrition',
    slug: slug('specimen-nutrition'),
    description:
      'A fictional brand used to demonstrate labels.fyi. It does not exist and its products are not for sale.',
    countryOfOrigin: 'India',
    websiteUrl: null,
    ...published('2026-02-01'),
  },
  {
    _id: 'brand.sampleworks',
    _type: 'brand',
    name: 'Sampleworks',
    slug: slug('sampleworks'),
    description:
      'A fictional brand used to demonstrate labels.fyi. It does not exist and its products are not for sale.',
    countryOfOrigin: 'India',
    websiteUrl: null,
    ...published('2026-02-01'),
  },
  {
    _id: 'brand.testbed',
    _type: 'brand',
    name: 'Testbed Sports',
    slug: slug('testbed-sports'),
    description:
      'A fictional brand used to demonstrate labels.fyi. It does not exist and its products are not for sale.',
    countryOfOrigin: 'India',
    websiteUrl: null,
    ...published('2026-02-01'),
  },
];

const VERIFY_NOTE = 'Citation entered during development. Re-verify details before launch.';

export const sources: RawDoc[] = [
  {
    _id: 'source.issn-creatine-2017',
    _type: 'source',
    title:
      'International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine',
    publisher: 'Journal of the International Society of Sports Nutrition',
    authors: ['Kreider RB', 'Kalman DS', 'Antonio J', 'et al.'],
    doi: '10.1186/s12970-017-0173-z',
    url: 'https://doi.org/10.1186/s12970-017-0173-z',
    pmid: null,
    sourceType: 'professional_organization',
    publicationDate: '2017-06-13',
    accessedAt: '2026-09-01',
    notes: VERIFY_NOTE,
  },
  {
    _id: 'source.issn-protein-2017',
    _type: 'source',
    title: 'International Society of Sports Nutrition Position Stand: protein and exercise',
    publisher: 'Journal of the International Society of Sports Nutrition',
    authors: ['Jäger R', 'Kerksick CM', 'Campbell BI', 'et al.'],
    doi: '10.1186/s12970-017-0177-8',
    url: 'https://doi.org/10.1186/s12970-017-0177-8',
    pmid: null,
    sourceType: 'professional_organization',
    publicationDate: '2017-06-20',
    accessedAt: '2026-09-01',
    notes: VERIFY_NOTE,
  },
  {
    _id: 'source.ods-vitamin-d',
    _type: 'source',
    title: 'Vitamin D: Fact Sheet for Health Professionals',
    publisher: 'NIH Office of Dietary Supplements',
    url: 'https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/',
    sourceType: 'government',
    accessedAt: '2026-09-01',
    notes: null,
  },
  {
    _id: 'source.ods-magnesium',
    _type: 'source',
    title: 'Magnesium: Fact Sheet for Health Professionals',
    publisher: 'NIH Office of Dietary Supplements',
    url: 'https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/',
    sourceType: 'government',
    accessedAt: '2026-09-01',
    notes: null,
  },
  {
    _id: 'source.ods-omega-3',
    _type: 'source',
    title: 'Omega-3 Fatty Acids: Fact Sheet for Health Professionals',
    publisher: 'NIH Office of Dietary Supplements',
    url: 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-HealthProfessional/',
    sourceType: 'government',
    accessedAt: '2026-09-01',
    notes: null,
  },
  {
    _id: 'source.ods-ashwagandha',
    _type: 'source',
    title:
      'Ashwagandha: Is it helpful for stress, anxiety, or sleep? Fact Sheet for Health Professionals',
    publisher: 'NIH Office of Dietary Supplements',
    url: 'https://ods.od.nih.gov/factsheets/Ashwagandha-HealthProfessional/',
    sourceType: 'government',
    accessedAt: '2026-09-01',
    notes: null,
  },
  {
    _id: 'source.fssai',
    _type: 'source',
    title: 'Food Safety and Standards Authority of India: regulations and labelling requirements',
    publisher: 'FSSAI',
    url: 'https://www.fssai.gov.in',
    sourceType: 'regulatory',
    accessedAt: '2026-09-01',
    notes: 'Link to the specific regulation text before launch.',
  },
  // ─── Demo product labels & marketplace observations (fictional) ─────────
  ...[
    [
      'specimen-creatine-2026-09',
      'Specimen Nutrition Creatine Monohydrate 250 g, back label (demo)',
    ],
    [
      'specimen-creatine-2026-02',
      'Specimen Nutrition Creatine Monohydrate 250 g, earlier back label (demo)',
    ],
    ['sampleworks-creatine', 'Sampleworks Micronised Creatine 300 g, back label (demo)'],
    ['testbed-creatine-caps', 'Testbed Sports Creatine Capsules, bottle label (demo)'],
    ['specimen-whey', 'Specimen Nutrition Whey Protein Concentrate 1 kg, back label (demo)'],
    ['sampleworks-whey', 'Sampleworks Whey Blend 2 kg, back label (demo)'],
    ['testbed-d3', 'Testbed Sports Vitamin D3 2000 IU, bottle label (demo)'],
  ].map(([id, title]) => ({
    _id: `source.label.${id}`,
    _type: 'source',
    title,
    publisher: null,
    url: null,
    sourceType: 'product_label',
    accessedAt: null,
    notes: 'Fictional label used for the demo dataset.',
  })),
  {
    _id: 'source.marketplace.demo',
    _type: 'source',
    title: 'Marketplace listing observation (demo)',
    publisher: null,
    url: null,
    sourceType: 'marketplace',
    notes: 'Fictional price observations for the demo dataset.',
  },
];
