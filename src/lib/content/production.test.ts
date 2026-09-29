import { describe, expect, it } from 'vitest';
import {
  assertNoDemoDocuments,
  assertNoPlaceholderReviewers,
  productionProblems,
} from './production';

const ok = {
  DEPLOY_ENV: 'production',
  CONTENT_SOURCE: 'sanity',
  SANITY_PROJECT_ID: 'r1eiikj7',
  SANITY_DATASET: 'production',
  SANITY_READ_TOKEN: 'x'.repeat(40),
  PUBLIC_SITE_URL: 'https://labels.fyi',
};

describe('production configuration contract', () => {
  it('accepts a complete production config', () => {
    expect(productionProblems(ok)).toEqual([]);
  });
  it('does nothing outside production', () => {
    expect(productionProblems({ DEPLOY_ENV: 'development' })).toEqual([]);
  });
  it('refuses demo/auto sources and missing Sanity settings', () => {
    for (const CONTENT_SOURCE of ['demo', 'auto', undefined])
      expect(productionProblems({ ...ok, CONTENT_SOURCE }).join()).toMatch(/CONTENT_SOURCE/);
    expect(productionProblems({ ...ok, SANITY_PROJECT_ID: '' }).join()).toMatch(/PROJECT_ID/);
    expect(productionProblems({ ...ok, SANITY_PROJECT_ID: 'Bad Id!' }).join()).toMatch(
      /PROJECT_ID/,
    );
    expect(productionProblems({ ...ok, SANITY_READ_TOKEN: '' }).join()).toMatch(/READ_TOKEN/);
    expect(productionProblems({ ...ok, PUBLIC_SITE_URL: 'http://labels.fyi' }).join()).toMatch(
      /PUBLIC_SITE_URL/,
    );
  });
  it('allows a local API host only for an explicit rehearsal', () => {
    expect(productionProblems({ ...ok, SANITY_API_HOST: 'http://127.0.0.1:4999' }).length).toBe(1);
    expect(
      productionProblems({
        ...ok,
        SANITY_API_HOST: 'http://127.0.0.1:4999',
        PRODUCTION_REHEARSAL: 'true',
      }),
    ).toEqual([]);
    expect(
      productionProblems({
        ...ok,
        SANITY_API_HOST: 'https://evil.example',
        PRODUCTION_REHEARSAL: 'true',
      }).length,
    ).toBe(1);
    expect(productionProblems({ ...ok, PRODUCTION_REHEARSAL: 'true' }).join()).toMatch(
      /requires a local/,
    );
    expect(
      productionProblems({ ...ok, SANITY_API_HOST: 'https://r1eiikj7.api.sanity.io' }),
    ).toEqual([]);
  });
});

describe('production dataset contents', () => {
  it('refuses demo documents, listing them', () => {
    expect(() =>
      assertNoDemoDocuments({ products: [{ _id: 'product.a', isDemo: true }, { _id: 'b' }] }),
    ).toThrow(/products:product\.a/);
    expect(() =>
      assertNoDemoDocuments({ products: [{ _id: 'b' }], goals: undefined }),
    ).not.toThrow();
  });
  it('refuses placeholder reviewers', () => {
    expect(() =>
      assertNoPlaceholderReviewers([{ _id: 'reviewer.x', isPlaceholder: true }]),
    ).toThrow(/reviewer\.x/);
    expect(() => assertNoPlaceholderReviewers([{ _id: 'r', isPlaceholder: false }])).not.toThrow();
    expect(() => assertNoPlaceholderReviewers(undefined)).not.toThrow();
  });
});
