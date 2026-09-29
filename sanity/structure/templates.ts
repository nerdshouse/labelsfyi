import type { Template } from 'sanity';

/**
 * "New … for this product" templates, used by the per-product views in the
 * desk structure so editors never have to pick the product reference by hand.
 */
const forProduct = (
  schemaType: string,
  title: string,
  extra: Record<string, unknown> = {},
): Template => ({
  id: `${schemaType}-for-product`,
  title,
  schemaType,
  parameters: [{ name: 'productId', type: 'string' }],
  value: (params: { productId: string }) => ({
    product: { _type: 'reference', _ref: params.productId },
    ...extra,
  }),
});

export const templates = (prev: Template[]): Template[] => [
  ...prev,
  forProduct('labelPanel', 'Label panel for product', { status: 'current' }),
  forProduct('claim', 'Claim for product', {
    workflowStatus: 'DRAFT',
    status: 'current',
    researchStatus: 'NEEDS_EVIDENCE',
  }),
  forProduct('observation', 'Observation for product', { verificationStatus: 'unverified' }),
  forProduct('priceSnapshot', 'Price snapshot for product', {
    currency: 'INR',
    availability: 'in_stock',
  }),
  forProduct('affiliateOffer', 'Affiliate offer for product', {
    relationship: 'affiliate',
    active: true,
  }),
  {
    id: 'editorialReview-for-content',
    title: 'Editorial review for document',
    schemaType: 'editorialReview',
    parameters: [{ name: 'contentId', type: 'string' }],
    value: (params: { contentId: string }) => ({
      content: { _type: 'reference', _ref: params.contentId, _weak: true },
      status: 'in_review',
      scope: 'dietitian_review',
    }),
  },
];
