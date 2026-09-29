import { describe, expect, it } from 'vitest';
import { normalizeGtin } from '@/lib/identity/gtin';
import { demoDataset } from './index.ts';

/**
 * The demo dataset must satisfy the Studio's required fields for the
 * provenance layer, so `sanity dataset import` produces valid documents.
 */
const of = (type: string) => demoDataset.filter((d) => d._type === type);

describe('demo dataset conforms to the provenance schema', () => {
  it('observations carry source type, method and verification status', () => {
    for (const o of of('observation')) {
      expect(o.sourceType, o._id).toBeTruthy();
      expect(o.verificationStatus, o._id).toBeTruthy();
    }
  });
  it('label panels declare their evidence basis; products and panels have structured servings', () => {
    for (const p of of('labelPanel')) expect(p.sourceType, p._id).toBeTruthy();
    for (const p of of('product')) expect(p.serving, p._id).toBeTruthy();
  });
  it('claims separate claim source from evidence and record research status', () => {
    for (const c of of('claim')) {
      expect(c.claimSourceType, c._id).toBeTruthy();
      expect(c.researchStatus, c._id).toBeTruthy();
    }
  });
  it('snapshot images are classified', () => {
    for (const s of of('sourceSnapshot'))
      for (const img of (s.images as Array<Record<string, unknown>>) ?? []) {
        expect(img.imageKind, s._id).toBeTruthy();
        expect(img.depictsExactProduct, s._id).toBeTruthy();
      }
  });
  it('elemental amounts are never present without a basis', () => {
    for (const p of of('labelPanel'))
      for (const r of (p.ingredients as Array<Record<string, unknown>>) ?? [])
        if (r.elementalAmount != null) expect(r.elementalBasis, p._id).toBeTruthy();
  });
  it('contains no brand responses (none are fabricated) and no invalid GTINs', () => {
    expect(of('brandResponse')).toHaveLength(0);
    for (const d of demoDataset)
      if (typeof d.gtin === 'string') expect(normalizeGtin(d.gtin).status, d._id).toBe('valid');
  });
});
