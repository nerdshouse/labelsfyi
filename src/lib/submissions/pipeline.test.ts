import { beforeEach, describe, expect, it } from 'vitest';
import { demoDataset } from '@/fixtures/index.ts';
import type { RawDoc } from '@/fixtures/helpers.ts';
import { buildReceipt } from '@/lib/receipt/receipt';
import { loadGraph } from '@/test/graph-loader';
import { receiveSubmission } from './intake';
import { isValidObjectKey, OBJECT_KEY } from './keys';
import { loadReview } from './load';
import { readiness, type Plan } from './review';
import { decideStep, factsStep, releaseStep, simulatePublishStep, workflowStep } from './steps';
import { MemoryDocStore, type Doc } from './store';
import type { LabelSubmission } from './types';
import { cleanText, LIMITS, sniffImageType, validateFields } from './validate';

// ─── Helpers ─────────────────────────────────────────────────────────────

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const bytes = (magic: number[], size = 2048) => {
  const b = new Uint8Array(size);
  b.set(magic);
  return b;
};
const file = (name: string, magic = JPEG, type = 'image/jpeg', size = 2048) =>
  new File([bytes(magic, size)], name, { type });

const CONTACT = 'submitter-private@example.org';
const VALID_GTIN = '4006381333931';

function form(over: Record<string, string | File | File[] | null> = {}) {
  const base: Record<string, string | File | File[] | null> = {
    front: file('front.jpg'),
    facts: file('facts.jpg'),
    brand: 'Northwind Labs',
    productName: 'Magnesium Citrate Capsules',
    variant: '60 capsules',
    productUrl: '',
    submitterName: 'Private Person',
    submitterContact: CONTACT,
    rights: 'on',
    website: '',
    ...over,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) {
    if (v === null) continue;
    for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  }
  return fd;
}
const fields = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};

class Objects {
  puts: Array<{ key: string; type: string; size: number }> = [];
  async put(key: string, value: Uint8Array, opts: { httpMetadata: { contentType: string } }) {
    this.puts.push({ key, type: opts.httpMetadata.contentType, size: value.byteLength });
  }
}

let store: MemoryDocStore;
let objects: Objects;
beforeEach(() => {
  store = new MemoryDocStore(demoDataset as unknown as Doc[]);
  objects = new Objects();
});

async function submit(fd = form()) {
  const r = await receiveSubmission(fd, { store, objects });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.id;
}
async function run(
  id: string,
  step: (d: NonNullable<Awaited<ReturnType<typeof loadReview>>>) => Plan,
) {
  const d = (await loadReview(store, id))!;
  const plan = step(d);
  if (!plan.ok) return plan;
  await store.commit(plan.ops);
  return plan;
}
async function mustRun(id: string, step: Parameters<typeof run>[1]) {
  const plan = await run(id, step);
  if (!plan.ok) throw new Error(plan.errors.join('; '));
}
const sub = (id: string) => store.docs.get(id) as unknown as LabelSubmission;
const written = () => [...store.docs.values()];
/** What a site build would see: fixtures + everything the pipeline wrote. */
const publicGraph = () => {
  const ids = new Set(store.docs.keys());
  return loadGraph([
    ...(demoDataset as RawDoc[]).filter((d) => !ids.has(d._id)),
    ...(written() as unknown as RawDoc[]),
  ]);
};

const createNew = (o: Record<string, string> = {}) =>
  fields({
    action: 'create',
    name: 'Magnesium Citrate Capsules',
    variant: '60 capsules',
    brandId: '',
    newBrandName: 'Northwind Labs',
    categoryId: 'category.vitamins-minerals',
    format: 'capsule',
    gtin: '',
    gtinNotObserved: 'on',
    reviewer: 'Test Reviewer',
    ...o,
  });

/** A complete, verified fact review for the magnesium citrate label. */
const facts = (o: Record<string, string> = {}) =>
  fields({
    reviewer: 'Test Reviewer',
    img_img0_kind: 'PACK_PHOTO',
    img_img0_depicts: 'CONFIRMED',
    img_img1_kind: 'PACK_PHOTO',
    img_img1_depicts: 'CONFIRMED',
    factsImageKey: 'img1',
    serving_status: 'VERIFIED',
    serving_count: '2',
    serving_unit: 'capsule',
    servings_status: 'VERIFIED',
    servings_value: '30',
    active_0_name: 'Magnesium (as magnesium citrate)',
    active_0_ingredient: 'ingredient.magnesium',
    active_0_form: 'Magnesium citrate',
    active_0_compound_status: 'VERIFIED',
    active_0_compound_amount: '500',
    active_0_compound_unit: 'mg',
    active_0_elemental_status: 'MISSING',
    active_0_locator: 'Supplement facts, row 1',
    veg_status: 'VERIFIED',
    veg_value: 'VEGETARIAN',
    front_status: 'NOT_REVIEWED',
    ...o,
  });

async function publishNew(id: string) {
  await mustRun(id, (d) => decideStep(d, createNew()));
  await mustRun(id, (d) => factsStep(d, facts()));
  await mustRun(id, (d) => workflowStep(d));
  await mustRun(id, (d) => simulatePublishStep(d, store));
  return String(sub(id).product!._ref);
}

// ─── Submission intake ───────────────────────────────────────────────────

describe('submission intake', () => {
  it('accepts a valid submission and creates a NEEDS_REVIEW record + candidate', async () => {
    const id = await submit();
    const s = sub(id);
    expect(id).toMatch(/^sub-[0-9a-f]{20}$/);
    expect(s).toMatchObject({
      status: 'NEEDS_REVIEW',
      brand: 'Northwind Labs',
      isDemo: false,
      product: null,
    });
    expect(s.images.map((i) => i.role)).toEqual(['front', 'facts']);
    expect(
      s.images.every((i) => i.imageKind === 'UNKNOWN' && i.depictsExactProduct === 'UNCONFIRMED'),
    ).toBe(true);
    const candidate = store.docs.get(`candidate.${id}`)!;
    expect(candidate).toMatchObject({
      _type: 'ingestionCandidate',
      submission: { _ref: id },
      status: 'needs_verification',
    });
    expect(
      (candidate.facts as Array<{ verificationStatus: string }>).every(
        (f) => f.verificationStatus === 'unverified',
      ),
    ).toBe(true);
  });

  it('creates no product, panel or observation on receipt', async () => {
    await submit();
    expect(
      written()
        .map((d) => d._type)
        .sort(),
    ).toEqual(['dataSource', 'ingestionCandidate', 'labelSubmission']);
  });

  it('rejects a missing front photo', async () => {
    const r = await receiveSubmission(form({ front: null }), { store, objects });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(objects.puts).toHaveLength(0);
  });

  it('rejects a missing facts photo', async () => {
    const r = await receiveSubmission(form({ facts: null }), { store, objects });
    expect(r.ok).toBe(false);
    expect(store.docs.size).toBe(0);
  });

  it('rejects unsupported image types (GIF, PDF, SVG)', async () => {
    for (const f of [
      file('a.gif', [0x47, 0x49, 0x46, 0x38], 'image/gif'),
      file('a.pdf', [0x25, 0x50, 0x44, 0x46], 'application/pdf'),
      new File(['<svg onload="alert(1)"/>'], 'a.svg', { type: 'image/svg+xml' }),
    ]) {
      const r = await receiveSubmission(form({ facts: f }), { store, objects });
      expect(r.ok, f.name).toBe(false);
    }
    expect(objects.puts).toHaveLength(0);
  });

  it('rejects an oversized photo with 413', async () => {
    const big = file('big.jpg', JPEG, 'image/jpeg', LIMITS.maxImageBytes + 1);
    const r = await receiveSubmission(form({ facts: big }), { store, objects });
    expect(r).toMatchObject({ ok: false, status: 413 });
  });

  it('rejects invalid metadata (no brand, bad URL, honeypot, no consent, bad product ref)', async () => {
    for (const over of [
      { brand: '  ' },
      { productName: '' },
      { productUrl: 'javascript:alert(1)' },
      { productUrl: 'https://user:pass@example.com/' },
      { website: 'http://spam.example' },
      { rights: null },
      { updateOfProduct: '../../etc' },
    ]) {
      const r = await receiveSubmission(form(over), { store, objects });
      expect(r.ok, JSON.stringify(over)).toBe(false);
    }
    expect(store.docs.size).toBe(0);
  });

  it('accepts additional photos up to the limit and refuses more', async () => {
    const id = await submit(
      form({
        additional: [file('a.jpg'), file('b.png', PNG, 'image/png'), file('c.jpg'), file('d.jpg')],
      }),
    );
    expect(sub(id).images).toHaveLength(6);
    expect(sub(id).images.filter((i) => i.role === 'additional')).toHaveLength(4);
    const tooMany = await receiveSubmission(
      form({ additional: Array.from({ length: 5 }, (_, i) => file(`${i}.jpg`)) }),
      { store, objects },
    );
    expect(tooMany.ok).toBe(false);
  });

  it('suggests matches on intake but never confirms one', async () => {
    const id = await submit(
      form({
        brand: 'Testbed Sports',
        productName: 'Magnesium Bisglycinate Capsules',
        variant: '',
      }),
    );
    const c = store.docs.get(`candidate.${id}`)!;
    expect(c.matchStatus).toBe('possible_match');
    expect(c.resolvedProduct).toBeUndefined();
    expect((c.possibleMatches as Array<{ product: { _ref: string } }>)[0]!.product._ref).toBe(
      'product.testbed-magnesium-bisglycinate',
    );
  });
});

// ─── Security ────────────────────────────────────────────────────────────

describe('submission security', () => {
  it('ignores untrusted filenames: keys are opaque and match the strict pattern', async () => {
    const evil = file('../../../etc/passwd;<script>.jpg');
    const id = await submit(form({ front: evil }));
    for (const p of objects.puts) {
      expect(p.key).toMatch(OBJECT_KEY);
      expect(p.key).not.toContain('passwd');
      expect(p.key).toContain(id);
    }
    expect(JSON.stringify(sub(id))).not.toContain('passwd');
  });

  it('rejects unsafe object keys', () => {
    for (const k of [
      'submissions/2026/09/sub-0123456789abcdef0123/00-0123456789abcdef.jpg/../../dev-docs/x.json',
      'dev-docs/labelSubmission.json',
      '../submissions/2026/09/sub-0123456789abcdef0123/00-0123456789abcdef.jpg',
      'submissions/2026/09/sub-0123456789abcdef0123/00-0123456789abcdef.svg',
      'https://bucket.r2.dev/x.jpg',
    ])
      expect(isValidObjectKey(k), k).toBe(false);
    expect(
      isValidObjectKey('submissions/2026/09/sub-0123456789abcdef0123/00-0123456789abcdef.jpg'),
    ).toBe(true);
  });

  it('sniffs the real type: a mislabelled or disguised file is refused', async () => {
    expect(sniffImageType(bytes(JPEG))).toBe('image/jpeg');
    expect(sniffImageType(new TextEncoder().encode('<html>'))).toBeNull();
    // PNG bytes declared as JPEG with a .jpg name.
    const r = await receiveSubmission(form({ facts: file('x.jpg', PNG, 'image/jpeg') }), {
      store,
      objects,
    });
    expect(r.ok).toBe(false);
    // HTML declared as an image.
    const r2 = await receiveSubmission(
      form({ facts: new File(['<html></html>'], 'x.jpg', { type: 'image/jpeg' }) }),
      { store, objects },
    );
    expect(r2.ok).toBe(false);
  });

  it('refuses an oversized total payload', async () => {
    const nearMax = () => file('n.jpg', JPEG, 'image/jpeg', LIMITS.maxImageBytes - 10);
    const r = await receiveSubmission(
      form({ front: nearMax(), facts: nearMax(), additional: [nearMax(), nearMax(), nearMax()] }),
      { store, objects },
    );
    expect(r).toMatchObject({ ok: false, status: 413 });
  });

  it('sanitises text: control characters, angle brackets, length', () => {
    expect(cleanText('  Brand\u0000<script>x</script>\n\tName  ', 200)).toBe(
      'Brand scriptx/script Name',
    );
    expect(cleanText('a'.repeat(500), 10)).toHaveLength(10);
    const r = validateFields({
      brand: 'B',
      productName: 'N',
      rights: 'on',
      submitterContact: `<img src=x>${CONTACT}`,
    });
    expect(r.ok && r.fields.submitterContact).toBe(`img src=x${CONTACT}`);
  });

  it('never copies submitter details into any product, source, panel or observation', async () => {
    const id = await submit();
    const productId = await publishNew(id);
    const others = written().filter((d) => d._type !== 'labelSubmission');
    const json = JSON.stringify(others);
    expect(json).not.toContain(CONTACT);
    expect(json).not.toContain('Private Person');
    expect(json).not.toMatch(/submissions\/\d{4}\//); // no storage keys
    const graph = await publicGraph();
    const p = graph.products.find((x) => x._id === productId)!;
    const pub = JSON.stringify([p, buildReceipt(p)]);
    expect(pub).not.toContain(CONTACT);
    expect(pub).not.toContain('Private Person');
    expect(pub).not.toMatch(/storageKey|submissions\/\d{4}\//);
  });
});

// ─── Matching ────────────────────────────────────────────────────────────

describe('matching', () => {
  it('exact GTIN match is suggested as EXACT but still requires confirmation', async () => {
    store.docs.set('productReference.test-gtin', {
      _id: 'productReference.test-gtin',
      _type: 'productReference',
      product: { _type: 'reference', _ref: 'product.testbed-magnesium-bisglycinate' },
      gtin: VALID_GTIN,
    });
    const id = await submit(form({ brand: 'Some Other Name', productName: 'Unrelated' }));
    const d = (await loadReview(store, id, VALID_GTIN))!;
    expect(d.suggestions[0]).toMatchObject({
      existingId: 'product.testbed-magnesium-bisglycinate',
      level: 'EXACT',
      requiresHumanConfirmation: true,
    });
    expect(sub(id).status).toBe('NEEDS_REVIEW');
    expect(store.docs.get(`candidate.${id}`)!.matchStatus).not.toBe('confirmed');
  });

  it('brand mismatch is never a candidate, even with the same product name', async () => {
    const id = await submit(
      form({
        brand: 'Northwind Labs',
        productName: 'Magnesium Bisglycinate Capsules',
        variant: '',
      }),
    );
    const d = (await loadReview(store, id))!;
    expect(d.suggestions.map((s) => s.existingId)).not.toContain(
      'product.testbed-magnesium-bisglycinate',
    );
  });

  it('same brand + core name is a named candidate with reasons', async () => {
    const id = await submit(
      form({
        brand: 'TESTBED sports',
        productName: 'Magnesium Bisglycinate Capsules',
        variant: '',
      }),
    );
    const s = (await loadReview(store, id))!.suggestions[0]!;
    expect(s.existingId).toBe('product.testbed-magnesium-bisglycinate');
    expect(['HIGH_CONFIDENCE_CANDIDATE', 'POSSIBLE_MATCH']).toContain(s.level);
    expect(s.reasons).toContain('Same brand');
  });

  it('no auto-confirm: nothing links to a product until a reviewer decides', async () => {
    const id = await submit(
      form({
        brand: 'Testbed Sports',
        productName: 'Magnesium Bisglycinate Capsules',
        variant: '',
      }),
    );
    expect(sub(id).product).toBeNull();
    const bad = await run(id, (d) =>
      decideStep(
        d,
        fields({
          action: 'accept',
          productId: 'product.testbed-magnesium-bisglycinate',
          gtinNotObserved: 'on',
          reviewer: '',
        }),
      ),
    );
    expect(bad.ok).toBe(false);
    await mustRun(id, (d) =>
      decideStep(
        d,
        fields({
          action: 'accept',
          productId: 'product.testbed-magnesium-bisglycinate',
          gtinNotObserved: 'on',
          reviewer: 'Test Reviewer',
        }),
      ),
    );
    expect(sub(id)).toMatchObject({
      status: 'IN_REVIEW',
      product: { _ref: 'product.testbed-magnesium-bisglycinate' },
    });
    expect(store.docs.get(`candidate.${id}`)).toMatchObject({
      matchStatus: 'confirmed',
      reviewedBy: 'Test Reviewer',
    });
  });

  it('GTIN is check-digit validated and stored on the external reference, not the product', async () => {
    const id = await submit();
    const wrong = await run(id, (d) =>
      decideStep(d, createNew({ gtin: '4006381333932', gtinNotObserved: '' })),
    );
    expect(wrong.ok).toBe(false);
    const missing = await run(id, (d) =>
      decideStep(d, createNew({ gtin: '', gtinNotObserved: '' })),
    );
    expect(missing).toMatchObject({ ok: false, errors: [expect.stringContaining('not observed')] });
    await mustRun(id, (d) =>
      decideStep(d, createNew({ gtin: ` ${VALID_GTIN} `, gtinNotObserved: '' })),
    );
    const productId = String(sub(id).product!._ref);
    expect(store.docs.get(productId)!.gtin).toBeUndefined();
    const refs = written().filter((d) => d._type === 'productReference');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      gtin: VALID_GTIN,
      product: { _ref: productId },
      matchedBy: 'Test Reviewer',
    });
  });

  it('GTIN "not observed" is recorded as such, with no reference invented', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    const c = store.docs.get(`candidate.${id}`)!;
    expect(
      (c.facts as Array<{ field: string; value: string }>).find((f) => f.field === 'gtin')!.value,
    ).toBe('Not observed on the submitted label');
    expect(written().filter((d) => d._type === 'productReference')).toHaveLength(0);
  });

  it('create-new makes a minimal DRAFT product: unknowns stay null/UNKNOWN', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    const p = store.docs.get(String(sub(id).product!._ref))!;
    expect(p).toMatchObject({
      workflowStatus: 'DRAFT',
      vegStatus: 'UNKNOWN',
      isDemo: false,
      format: 'capsule',
    });
    expect(p.serving).toBeUndefined();
    expect(p.servingsPerContainer).toBeUndefined();
    expect(store.docs.get('brand.northwind-labs')).toMatchObject({ workflowStatus: 'DRAFT' });
  });

  it('reject closes the submission without creating anything', async () => {
    const id = await submit();
    await mustRun(id, (d) =>
      decideStep(
        d,
        fields({ action: 'reject', reason: 'Facts panel not legible', reviewer: 'Test Reviewer' }),
      ),
    );
    expect(sub(id)).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Facts panel not legible',
    });
    expect(written().some((d) => d._type === 'product' || d._type === 'observation')).toBe(false);
  });
});

// ─── Fact verification ───────────────────────────────────────────────────

describe('fact verification', () => {
  it('facts cannot be verified from an unconfirmed photo', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    const r = await run(id, (d) => factsStep(d, facts({ img_img1_depicts: 'UNCONFIRMED' })));
    expect(r).toMatchObject({
      ok: false,
      errors: [expect.stringContaining('confirmed as a photo of this exact product')],
    });
    const r2 = await run(id, (d) => factsStep(d, facts({ img_img1_kind: 'MARKETING_GRAPHIC' })));
    expect(r2.ok).toBe(false);
    expect(written().some((d) => d._type === 'observation')).toBe(false);
  });

  it('pack observations are PHYSICAL_PACK, verified by the named reviewer, with provenance', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    await mustRun(id, (d) => factsStep(d, facts(), '2026-09-29T10:00:00.000Z'));
    const obs = written().filter((d) => d._type === 'observation');
    expect(obs.length).toBeGreaterThan(0);
    for (const o of obs)
      expect(o).toMatchObject({
        sourceType: 'PHYSICAL_PACK',
        verificationStatus: 'verified',
        verifiedBy: 'Test Reviewer',
        verifiedAt: '2026-09-29T10:00:00.000Z',
        extractionMethod: 'manual',
        submission: { _ref: id },
        extractedFrom: { _ref: `candidate.${id}` },
        source: { _ref: `source.${id}` },
      });
    // Image provenance: confirmed only after review, by the reviewer.
    const img = sub(id).images.find((i) => i._key === 'img1')!;
    expect(img).toMatchObject({
      imageKind: 'PACK_PHOTO',
      depictsExactProduct: 'CONFIRMED',
      depictsConfirmedBy: 'Test Reviewer',
    });
  });

  it('missing elemental stays missing (null), and is recorded as not declared', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    await mustRun(id, (d) => factsStep(d, facts()));
    const panel = written().find((d) => d._type === 'labelPanel')!;
    const row = (panel.ingredients as Array<Record<string, unknown>>)[0]!;
    expect(row).toMatchObject({
      compoundAmount: 500,
      compoundUnit: 'mg',
      elementalAmount: null,
      elementalUnit: null,
      elementalBasis: null,
    });
    expect(
      written().some(
        (d) =>
          d._type === 'observation' &&
          String(d.value).includes('does not declare the elemental amount'),
      ),
    ).toBe(true);
  });

  it('elemental can only be entered when the label declares it; compound needs its form', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    const noForm = await run(id, (d) => factsStep(d, facts({ active_0_form: '' })));
    expect(noForm).toMatchObject({
      ok: false,
      errors: [expect.stringContaining('needs the form')],
    });
    await mustRun(id, (d) =>
      factsStep(
        d,
        facts({
          active_0_elemental_status: 'VERIFIED',
          active_0_elemental_amount: '80',
          active_0_elemental_unit: 'mg',
        }),
      ),
    );
    const row = (
      written().find((d) => d._type === 'labelPanel')!.ingredients as Array<Record<string, unknown>>
    )[0]!;
    expect(row).toMatchObject({
      compoundAmount: 500,
      elementalAmount: 80,
      elementalBasis: 'label_declared',
    });
  });

  it('zero is a real value, distinct from missing', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    await mustRun(id, (d) => factsStep(d, facts({ active_0_compound_amount: '0' })));
    const row = (
      written().find((d) => d._type === 'labelPanel')!.ingredients as Array<Record<string, unknown>>
    )[0]!;
    expect(row.compoundAmount).toBe(0);
  });

  it('unclear values block editorial review until resolved', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    await mustRun(id, (d) =>
      factsStep(d, facts({ servings_status: 'UNCLEAR', servings_value: '' })),
    );
    const d = (await loadReview(store, id))!;
    expect(d.checks.find((c) => c.key === 'blocking')).toMatchObject({ ok: false });
    expect((await run(id, (x) => workflowStep(x))).ok).toBe(false);
    // Re-review resolves it; earlier observations are superseded, not edited.
    const before = written()
      .filter((x) => x._type === 'observation')
      .map((o) => o._id);
    await mustRun(id, (x) => factsStep(x, facts()));
    for (const oid of before) expect(store.docs.get(oid)!.supersededAt).toBeTruthy();
    expect((await run(id, (x) => workflowStep(x))).ok).toBe(true);
  });

  it('unverified facts are not published: FACT_CHECK is not publication', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    await mustRun(id, (d) => factsStep(d, facts()));
    await mustRun(id, (d) => workflowStep(d));
    const productId = String(sub(id).product!._ref);
    expect(store.docs.get(productId)!.workflowStatus).toBe('FACT_CHECK');
    expect(sub(id).status).toBe('VERIFIED');
    const graph = await publicGraph();
    expect(graph.products.find((p) => p._id === productId)).toBeUndefined();
  });

  it('the readiness gate lists all five checks', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    const d = (await loadReview(store, id))!;
    expect(d.checks.map((c) => c.key)).toEqual([
      'identity',
      'evidence',
      'pack-observation',
      'fields',
      'blocking',
    ]);
    expect(
      readiness({ ...d })
        .filter((c) => !c.ok)
        .map((c) => c.key),
    ).toEqual(['evidence', 'pack-observation', 'fields', 'blocking']);
  });
});

// ─── Publication ─────────────────────────────────────────────────────────

describe('publication', () => {
  it('an unpublished candidate is absent from every public collection', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    const graph = await publicGraph();
    const json = JSON.stringify(graph);
    expect(json).not.toContain('Magnesium Citrate Capsules');
    expect(json).not.toContain(id);
  });

  it('simulated publish is refused before editorial review and on a non-local store', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    await mustRun(id, (d) => factsStep(d, facts()));
    expect((await run(id, (d) => simulatePublishStep(d, store))).ok).toBe(false);
    await mustRun(id, (d) => workflowStep(d));
    const sanityLike = Object.assign(Object.create(store), { kind: 'sanity' });
    expect((await run(id, (d) => simulatePublishStep(d, sanityLike))).ok).toBe(false);
  });

  it('a published real product gets a product page entry and a non-demo receipt', async () => {
    const id = await submit();
    const productId = await publishNew(id);
    const graph = await publicGraph();
    const p = graph.products.find((x) => x._id === productId)!;
    expect(p).toBeDefined();
    expect(p.isDemo).toBe(false);
    expect(p.slug).toBe('northwind-labs-magnesium-citrate-capsules-60-capsules');
    const r = buildReceipt(p)!;
    expect(r).toBeTruthy();
    expect(r.isDemo).toBe(false);
    expect(r.href).toBe(`/receipt/${p.slug}`);
    // Compound is never shown as elemental; missing elemental stays missing.
    expect(r.labelPanel).toMatchObject({
      compound: '500 mg magnesium citrate',
      elemental: 'Not disclosed',
    });
    expect(JSON.stringify(r)).not.toMatch(/500 mg (elemental )?magnesium(?! citrate)/);
    expect(sub(id).status).toBe('PUBLISHED');
  });

  it('the demo receipt stays marked demo', async () => {
    const graph = await publicGraph();
    const demo = graph.products.find((p) => p._id === 'product.testbed-magnesium-bisglycinate')!;
    expect(buildReceipt(demo)!.isDemo).toBe(true);
  });

  it('panel evidence comes from the confirmed submission photo classification only', async () => {
    const id = await submit();
    const productId = await publishNew(id);
    const graph = await publicGraph();
    const panel = graph.products.find((x) => x._id === productId)!.panels[0]!;
    expect(panel.imageEvidence).toEqual({
      url: null,
      imageKind: 'PACK_PHOTO',
      depictsExactProduct: 'CONFIRMED',
    });
  });
});

// ─── History ─────────────────────────────────────────────────────────────

describe('label history', () => {
  async function updateExisting(productId: string, version: 'new' | 'unchanged', compound: string) {
    const id = await submit(
      form({ updateOfProduct: 'northwind-labs-magnesium-citrate-capsules-60-capsules' }),
    );
    await mustRun(id, (d) =>
      decideStep(
        d,
        fields({ action: 'accept', productId, gtinNotObserved: 'on', reviewer: 'Second Reviewer' }),
      ),
    );
    await mustRun(id, (d) =>
      factsStep(
        d,
        facts({
          labelVersion: version,
          active_0_compound_amount: compound,
          servings_value: '45',
          reviewer: 'Second Reviewer',
        }),
      ),
    );
    return id;
  }
  const currentRows = async (productId: string) => {
    const p = (await publicGraph()).products.find((x) => x._id === productId)!;
    return {
      current: p.panels.filter((x) => x.isCurrent).map((x) => x.ingredients[0]!.compoundAmount),
      earlier: p.panels.filter((x) => !x.isCurrent).map((x) => x.ingredients[0]!.compoundAmount),
      servings: p.servingsPerContainer,
    };
  };

  it('a new label never edits the old panel; the previous source remains', async () => {
    const first = await submit();
    const productId = await publishNew(first);
    const oldPanel = structuredClone(store.docs.get(`panel.${first}`)!);
    const second = await updateExisting(productId, 'new', '600');

    expect(store.docs.get(`panel.${first}`)).toEqual(oldPanel); // untouched, byte for byte
    expect(store.docs.get(`source.${first}`)).toBeDefined();
    expect(store.docs.get(`panel.${second}`)).toMatchObject({
      status: 'current',
      supersedes: [expect.objectContaining({ _ref: `panel.${first}` })],
    });
    expect(written().some((d) => d._type === 'observation' && d.type === 'label_change')).toBe(
      true,
    );
    const fromFirst = written().filter(
      (d) =>
        d._type === 'observation' &&
        (d.submission as { _ref?: string } | undefined)?._ref === first,
    );
    expect(fromFirst.length).toBeGreaterThan(0);
    expect(fromFirst.every((o) => !o.supersededAt)).toBe(true);
  });

  it('a label update to a live product stays off the site until an editor approves it', async () => {
    const first = await submit();
    const productId = await publishNew(first);
    const second = await updateExisting(productId, 'new', '600');
    await mustRun(second, (d) => workflowStep(d));

    // Still live, still showing the approved label and product fields.
    expect(store.docs.get(productId)!.workflowStatus).toBe('PUBLISHED');
    expect(store.docs.get(productId)!.servingsPerContainer).toBe(30);
    expect(await currentRows(productId)).toEqual({ current: [500], earlier: [], servings: 30 });
    const graph = await publicGraph();
    const live = graph.products.find((x) => x._id === productId)!;
    // (Related-product summaries may mention other products' amounts.)
    expect(JSON.stringify([live.panels, live.observations])).not.toContain('600');

    // Release is refused without a newer approved review.
    expect(await run(second, (d) => releaseStep(d))).toMatchObject({
      ok: false,
      errors: [expect.stringContaining('No approved editorial review')],
    });
  });

  it('after approval the new label is current, the old one is history, and product fields follow', async () => {
    const first = await submit();
    const productId = await publishNew(first);
    const second = await updateExisting(productId, 'new', '600');
    await mustRun(second, (d) => workflowStep(d));
    await mustRun(second, (d) => simulatePublishStep(d, store, new Date(Date.now() + 1000)));

    expect(await currentRows(productId)).toEqual({ current: [600], earlier: [500], servings: 45 });
    expect(sub(second).status).toBe('PUBLISHED');
    expect(store.docs.get(`candidate.${second}`)!.proposedChangesAppliedAt).toBeTruthy();
  });

  it('a same-label resubmission adds observations without a new panel', async () => {
    const first = await submit();
    const productId = await publishNew(first);
    const panelsBefore = written().filter((d) => d._type === 'labelPanel').length;
    await updateExisting(productId, 'unchanged', '500');
    expect(written().filter((d) => d._type === 'labelPanel')).toHaveLength(panelsBefore);
    expect(store.docs.get(`panel.${first}`)!.status).toBe('current');
  });
});

describe('release', () => {
  it('requires a published product and an approved review dated after verification', async () => {
    const id = await submit();
    await mustRun(id, (d) => decideStep(d, createNew()));
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    await mustRun(id, (d) => factsStep(d, facts(), hoursAgo(2)));
    await mustRun(id, (d) => workflowStep(d));
    const productId = String(sub(id).product!._ref);
    const refused = await run(id, (d) => releaseStep(d));
    expect(refused.ok).toBe(false);

    // What an editor does in Studio: an older approval does not count…
    const review = (at: string) => ({
      _id: `editorialReview.${at}`,
      _type: 'editorialReview',
      content: { _type: 'reference', _ref: productId, _weak: true },
      reviewer: { _type: 'reference', _ref: 'reviewer.demo' },
      status: 'approved',
      scope: 'dietitian_review',
      reviewedAt: at,
      nextReviewAt: new Date(Date.parse(at) + 180 * 86_400_000).toISOString(),
    });
    await store.commit([
      { create: review(hoursAgo(3)) },
      { patch: { id: productId, set: { workflowStatus: 'PUBLISHED' } } },
      { patch: { id: 'brand.northwind-labs', set: { workflowStatus: 'PUBLISHED' } } },
    ]);
    expect((await run(id, (d) => releaseStep(d))).ok).toBe(false);
    expect(
      (await publicGraph()).products.find((p) => p._id === productId)?.panels ?? [],
    ).toHaveLength(0);

    // …a newer one does, for both the site gate and release.
    await store.commit([{ create: review(hoursAgo(1)) }]);
    await mustRun(id, (d) => releaseStep(d));
    expect(sub(id).status).toBe('PUBLISHED');
    expect((await publicGraph()).products.find((p) => p._id === productId)!.panels).toHaveLength(1);
  });
});
