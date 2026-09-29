import { describe, expect, it } from 'vitest';
import { sanitizeParams } from './events';

describe('analytics never receives personal or private data', () => {
  it('keeps public slugs, enums, counts and our own paths', () => {
    expect(
      sanitizeParams({
        slug: 'testbed-sports-magnesium-bisglycinate-capsules',
        merchant: 'amazon-in',
        results: 3,
        state: 'EXTRACTION_PARTIAL',
        selected: '/products/some-product',
        clicked_at: '2026-09-29T12:00:00.000Z',
      }),
    ).toEqual({
      slug: 'testbed-sports-magnesium-bisglycinate-capsules',
      merchant: 'amazon-in',
      results: 3,
      state: 'EXTRACTION_PARTIAL',
      selected: '/products/some-product',
      clicked_at: '2026-09-29T12:00:00.000Z',
    });
  });

  it('drops free text, URLs, e-mails, phones, Sanity ids, keys and unknown params', () => {
    const out = sanitizeParams({
      search_term: 'my name is Asha',
      url: 'https://brand.example/products/x',
      email: 'a@b.co',
      product: 'product.testbed-mg', // Sanity _id
      slug: 'drafts.product-x',
      from: 'someone@example.com',
      to: '+91 98765 43210',
      goal: '9876543210',
      selected: 'https://evil.example/x',
      pair: '//evil.example',
      r2Key: 'submissions/2026/abc.jpg',
      token: 'sk_live_abc',
      ingredient: 'magnesium',
    });
    expect(out).toEqual({ ingredient: 'magnesium' });
  });
});
