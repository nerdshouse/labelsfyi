import { describe, expect, it } from 'vitest';
import type { SourcePolicy } from '@/lib/sources/policy';
import { analyseUrl } from './analyse';
import { extractEvidence } from './evidence';
import { extractProductPage } from './extract';
import type { FetchLike } from './fetch';
import { buildEvidenceReport, EVIDENCE_STATUS, type EvidenceReport } from './report';

/**
 * The evidence report over synthetic pages (no network). The electrolyte
 * page is shaped like a real brand page (identity statements, a facts table
 * with its basis in the header, COA links, quality statements, marketing
 * claims, two different preparation instructions). Nothing is brand-specific.
 */
const POLICY: SourcePolicy = {
  id: 'hydra',
  name: 'Hydra Labs',
  domain: 'www.hydralabs.in',
  hosts: ['www.hydralabs.in'],
  accessMode: 'BRAND_PERMISSION',
  sourceKind: 'BRAND_WEBSITE',
  productPath: '^/products/[a-z0-9-]+/?$',
  termsExcerpt: 'Test.',
  permissionVerified: true,
  permissionRecord: 'assetPermission.hydra',
};
const MARKET: SourcePolicy = {
  ...POLICY,
  id: 'mart',
  name: 'Mart',
  domain: 'www.martstore.in',
  hosts: ['www.martstore.in'],
  sourceKind: 'MARKETPLACE',
};
const URL_OK = 'https://www.hydralabs.in/products/electrolyte-mix';
const URL_MART = 'https://www.martstore.in/products/creatine-listing';

const ELECTROLYTE = `<!doctype html><html><head><title>Hydra Electrolyte Drink Mix</title>
<script type="application/ld+json">{"@type":"Product","name":"Hydra Electrolyte Drink Mix – Lemon","brand":{"@type":"Brand","name":"Hydra"},"gtin13":"4006381333931","offers":{"@type":"Offer","price":"899","priceCurrency":"INR"}}</script></head><body>
<h1>Hydra Electrolyte Drink Mix</h1>
<p>Our advanced hydration formula replenishes electrolytes lost in sweat and supports hydration during long workouts.</p>
<p>Clinically researched electrolyte ratio.</p>
<p>Third-party tested for purity. Manufactured in a GMP certified facility.</p>
<p>Serving size: 1 sachet</p><p>Servings per pack: 20</p>
<table><tr><th>Nutrient</th><th>Amount per serving</th></tr>
<tr><td>Energy</td><td>12 kcal</td></tr>
<tr><td>Total sugars</td><td>0 g</td></tr>
<tr><td>Sodium</td><td>500 mg</td></tr>
<tr><td>Potassium</td><td>200 mg</td></tr>
<tr><td>Magnesium citrate</td><td>300 mg</td></tr>
<tr><td>Elemental magnesium</td><td>50 mg</td></tr></table>
<p>How to use: Mix 1 sachet with 250 ml water.</p>
<div>Directions<ul><li>Dissolve one sachet in 250–500 ml of water and drink during activity.</li></ul></div>
<p>Manufactured by: Acme Nutrition Pvt Ltd, Plot 4, Baddi, Himachal Pradesh</p>
<p>Marketed by: Hydra Labs Pvt Ltd, Bengaluru</p>
<p>FSSAI Lic. No. 10019022009876</p>
<p>Country of origin: India</p>
<p>Shelf life: 18 months from manufacture</p>
<p>MRP: ₹999 (incl. of all taxes)</p>
<p>100% vegetarian</p>
<p><a href="/docs/hydra-coa.pdf">Certificate of Analysis (COA)</a> · <a href="https://files.hydralabs.in/raw-material-coa-magnesium.pdf">Raw material COA</a></p>
</body></html>`;

const LISTING = `<!doctype html><html><head>
<script type="application/ld+json">{"@type":"Product","name":"MB Creatine 250g | 3g Creatine","brand":"MB","offers":{"price":"899","priceCurrency":"INR"}}</script></head><body>
<h1>MB Creatine 250g | 3g Creatine</h1><p>Supports strength and muscle recovery.</p></body></html>`;

function fakeWeb(routes: Record<string, string>): FetchLike {
  return async (input) => {
    if (input.endsWith('/robots.txt'))
      return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } });
    const body = routes[input];
    return body
      ? new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
      : new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } });
  };
}
const resolveHost = async () => ({ ok: true as const }); // DNS is covered by dns-guard.test.ts
const NOW = new Date('2026-09-30T10:00:00Z');
async function report(url = URL_OK, html = ELECTROLYTE): Promise<EvidenceReport> {
  const r = await analyseUrl(url, {
    fetchImpl: fakeWeb({ [url]: html }),
    resolveHost,
    now: NOW,
    sources: [POLICY, MARKET],
  });
  expect(r.report, r.message).toBeDefined();
  return r.report!;
}
const field = (r: EvidenceReport, key: string) => r.identity.find((f) => f.key === key)!;

describe('1. product identity', () => {
  it('extracts identity statements with provenance, never guessing', async () => {
    const r = await report();
    expect(field(r, 'name')).toMatchObject({
      status: 'DISCLOSED',
      value: 'Hydra Electrolyte Drink Mix – Lemon',
      ref: { method: 'structured_data' },
    });
    expect(field(r, 'brand').value).toBe('Hydra');
    expect(field(r, 'format').value).toBe('Sachet');
    expect(field(r, 'servings').value).toBe('20');
    expect(field(r, 'manufacturer').value).toBe(
      'Acme Nutrition Pvt Ltd, Plot 4, Baddi, Himachal Pradesh',
    );
    expect(field(r, 'marketer').value).toBe('Hydra Labs Pvt Ltd, Bengaluru');
    expect(field(r, 'fssai').value).toBe('10019022009876');
    expect(field(r, 'country').value).toBe('India');
    expect(field(r, 'shelf_life').value).toBe('18 months from manufacture');
    expect(field(r, 'mrp').value).toBe('₹999');
    expect(field(r, 'price').value).toBe('₹899');
    expect(field(r, 'gtin').value).toBe('4006381333931');
    expect(field(r, 'veg')).toMatchObject({ status: 'DISCLOSED', value: '“100% vegetarian”' });
    for (const f of r.identity)
      if (f.status === 'DISCLOSED') expect(f.ref?.locator, f.key).toBeTruthy();
  });

  it('missing identity fields are NOT FOUND, never zero, "no" or a guess', async () => {
    const r = await report(URL_MART, LISTING);
    for (const key of [
      'manufacturer',
      'marketer',
      'fssai',
      'country',
      'shelf_life',
      'mrp',
      'gtin',
      'veg',
      'serving',
      'format',
    ])
      expect(field(r, key), key).toMatchObject({ status: 'NOT_FOUND', value: null });
    expect(JSON.stringify(r.identity)).not.toMatch(/"value":"(0|no|none|false)"/i);
  });
});

describe('2–3. formula and nutrition', () => {
  it('a facts-table basis is used only because the table states it', async () => {
    const r = await report();
    const mg = r.formula.find((f) => f.name === 'Magnesium citrate')!;
    expect(mg).toMatchObject({
      amount: '300',
      unit: 'mg',
      basis: 'serving',
      form: 'citrate',
      status: 'DISCLOSED',
      amountKind: 'as_stated',
    });
  });

  it('compound and elemental amounts stay separate; nothing is calculated', async () => {
    const r = await report();
    const rows = r.formula.filter((f) => /magnesium/i.test(f.name));
    expect(rows.map((f) => [f.name, f.amount, f.amountKind])).toEqual([
      ['Magnesium citrate', '300', 'as_stated'],
      ['Elemental magnesium', '50', 'elemental'],
    ]);
    // No figure appears that the page did not state.
    const stated = new Set(['300', '50', '200', '500', '12', '0']);
    for (const f of [...r.formula]) expect(stated.has(f.amount), f.amount).toBe(true);
  });

  it('"3g Creatine" in a title stays BASIS NOT STATED (never per serving)', async () => {
    const r = await report(URL_MART, LISTING);
    const c = r.formula.find((f) => /creatine/i.test(f.name))!;
    expect(c).toMatchObject({ amount: '3', unit: 'g', basis: null, status: 'BASIS_NOT_STATED' });
    // No value anywhere claims a basis the title never gave.
    expect(JSON.stringify([r.formula, r.nutrition])).not.toMatch(/per serving/i);
    expect(r.gaps.find((g) => g.key === 'basis')).toBeDefined();
    expect(r.questions.map((q) => q.text).join(' ')).toMatch(/per serving, per scoop or per pack/);
  });

  it('nutrition rows are separated from actives; missing nutrients are NOT FOUND', async () => {
    const r = await report();
    const n = Object.fromEntries(r.nutrition.map((f) => [f.key, f]));
    expect(n.energy).toMatchObject({ status: 'DISCLOSED', value: '12 kcal per serving' });
    expect(n.sugar).toMatchObject({ status: 'DISCLOSED', value: '0 g per serving' }); // a stated zero stays a stated zero
    expect(n.sodium).toMatchObject({ status: 'DISCLOSED', value: '500 mg per serving' });
    expect(n.protein).toMatchObject({ status: 'NOT_FOUND', value: null });
    expect(n.added_sugar).toMatchObject({ status: 'NOT_FOUND', value: null });
    expect(r.formula.some((f) => /sodium|energy|sugar/i.test(f.name))).toBe(false);
  });
});

describe('4–5. quality evidence and certifications', () => {
  it('a linked COA is DOCUMENT FOUND, with no claim about what it tests', async () => {
    const r = await report();
    const coa = r.quality.find((q) => q.key === 'product_coa')!;
    expect(coa.status).toBe('DOCUMENT_FOUND');
    expect(coa.documents[0]).toMatchObject({
      href: 'https://www.hydralabs.in/docs/hydra-coa.pdf',
      host: 'www.hydralabs.in',
    });
    expect(coa.detail).toMatch(/contents .* were not read/);
    expect(r.quality.find((q) => q.key === 'raw_material_coa')!.status).toBe('DOCUMENT_FOUND');
    // Testing scope cannot be inferred from a link.
    expect(r.quality.find((q) => q.key === 'heavy_metals')!.status).toBe('NOT_FOUND');
    expect(r.quality.find((q) => q.key === 'microbiological')!.status).toBe('NOT_FOUND');
    expect(r.quality.find((q) => q.key === 'batch_coa')!.status).toBe('NOT_FOUND');
  });

  it('"Third-party tested" is a SOURCE CLAIM, not a laboratory report', async () => {
    const r = await report();
    const lab = r.quality.find((q) => q.key === 'third_party_report')!;
    expect(lab).toMatchObject({ status: 'SOURCE_CLAIM', documents: [] });
    expect(lab.detail).toMatch(/No supporting document was found/);
  });

  it('"GMP certified" is a brand statement, never "certified ✓"; nothing is verified by labels.fyi', async () => {
    const r = await report();
    const gmp = r.certifications.find((c) => c.key === 'gmp')!;
    expect(gmp).toMatchObject({
      status: 'SOURCE_CLAIM',
      documents: [],
      verifiedByLabelsFyi: false,
    });
    expect(gmp.brandStatement).toMatch(/GMP certified/i);
    expect(r.certifications.every((c) => c.verifiedByLabelsFyi === false)).toBe(true);
    expect(r.certifications.find((c) => c.key === 'fssai')!.status).toBe('DISCLOSED');
    expect(JSON.stringify(r)).not.toMatch(/✓|LABEL_VERIFIED"/);
  });
});

describe('6. brand claims', () => {
  it('extracts short claim phrases with a category; never judges them', async () => {
    const r = await report();
    const texts = r.claims.map((c) => c.text);
    expect(texts).toContain(
      'replenishes electrolytes lost in sweat and supports hydration during long workouts',
    );
    expect(texts).toContain('Clinically researched electrolyte ratio');
    expect(r.claims.find((c) => /Clinically/.test(c.text))!.category).toBe('formulation');
    expect(r.claims.find((c) => /hydration/.test(c.text))!.category).toBe('health');
    expect(r.claims.every((c) => c.status === 'EVIDENCE_NOT_FOUND' && c.evidence === null)).toBe(
      true,
    );
    for (const c of r.claims) expect(c.text.split(' ').length).toBeLessThanOrEqual(12);
  });

  it('a claim is EVIDENCE LINKED only when its own block links something', () => {
    const ev = extractEvidence(
      '<p>Clinically proven to improve sleep quality <a href="https://doi.org/10.1/x">see study</a></p>',
      new URL(URL_OK),
    );
    expect(ev.claims[0]).toMatchObject({ link: { href: 'https://doi.org/10.1/x' } });
  });
});

describe('7–9. gaps, discrepancies, questions', () => {
  it('gaps say "not found on the analysed page", never "does not have"', async () => {
    const r = await report();
    const keys = r.gaps.map((g) => g.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'batch_coa',
        'lab_details',
        'contaminants',
        'gmp_document',
        'physical_label',
      ]),
    );
    expect(keys).not.toContain('fssai'); // found → not a gap
    expect(keys).not.toContain('manufacturer');
    expect(JSON.stringify(r.gaps)).not.toMatch(
      /does not have|doesn't have|lacks|no (coa|testing)/i,
    );
    expect(r.gaps.find((g) => g.key === 'physical_label')!.detail).toMatch(/the brand’s website/);
  });

  it('different preparation volumes are INCONSISTENT; neither is chosen', async () => {
    const r = await report();
    const d = r.discrepancies.find((x) => x.field === 'Preparation volume')!;
    expect(d.status).toBe('INCONSISTENT');
    expect(d.values.map((v) => v.value)).toEqual(['250 ml', '250–500 ml']);
    expect(d.values[0]).toMatchObject({
      sourceType: 'BRAND_WEBSITE',
      observedAt: NOW.toISOString(),
    });
    expect(d.values.every((v) => v.locator)).toBe(true);
    expect(d.action).toBe('Ask the brand which preparation instruction should be followed.');
  });

  it('same ingredient with different amounts on the same basis is surfaced', () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Zinc 25 mg"}</script>
      <table><tr><td>Zinc</td><td>15 mg</td></tr></table>`;
    const x = extractProductPage(html);
    const r = buildEvidenceReport(x, extractEvidence(html, null), {
      sourceUrl: URL_OK,
      sourceKind: 'BRAND_WEBSITE',
      sourceName: 'X',
      observedAt: NOW.toISOString(),
      methods: [],
      verificationStatus: 'UNVERIFIED',
    });
    expect(r.discrepancies.map((d) => [d.field, d.values.map((v) => v.value)])).toEqual([
      ['Amount of Zinc', ['25 mg', '15 mg']],
    ]);
  });

  it('questions come only from actual gaps and discrepancies', async () => {
    const r = await report();
    const qs = r.questions.map((q) => q.text);
    expect(qs).toEqual(
      expect.arrayContaining([
        'Does the available COA correspond to the batch currently being sold?',
        'Which laboratory performed the testing?',
        'Does the testing include heavy metals and microbiological contaminants?',
        'Can you share the GMP certificate for the manufacturing facility?',
        'Can you clarify whether the recommended preparation volume is 250 ml or 250–500 ml?',
      ]),
    );
    // Nothing asked about facts the page did give.
    expect(qs.join(' ')).not.toMatch(/FSSAI|Who manufactures|serving size for this product/);
    const from = new Set([...r.gaps.map((g) => g.key), ...r.discrepancies.map((d) => d.field)]);
    for (const q of r.questions) expect(from.has(q.from), q.text).toBe(true);
    expect(new Set(qs).size).toBe(qs.length);
  });

  it('a sparse listing gets questions for what is missing, not about COAs it never mentions', async () => {
    const r = await report(URL_MART, LISTING);
    const qs = r.questions.map((q) => q.text).join(' ');
    expect(qs).toMatch(/COA for the current batch/);
    expect(qs).not.toMatch(/Which laboratory|heavy metals/); // no testing was claimed
  });
});

describe('10. summary, provenance, source kind, neutrality', () => {
  it('summary counts only; no score, rating or verdict anywhere', async () => {
    const r = await report();
    expect(r.summary).toEqual({
      factsFound: expect.any(Number),
      itemsWithAmounts: 6,
      documentsFound: 2,
      claimsIdentified: r.claims.length,
      gaps: r.gaps.length,
      inconsistencies: 1,
    });
    const json = JSON.stringify(r).toLowerCase();
    expect(json).not.toMatch(
      /score|rating|rank|grade|best|top[- ]rated|winner|verdict|good transparency|poor|high quality|low quality|recommended (product|supplement|choice|pick)|we recommend/,
    );
  });

  it('keeps provenance: source kind, observed date, locator and method', async () => {
    const r = await report();
    expect(r.source).toMatchObject({
      kind: 'BRAND_WEBSITE',
      label: 'Brand website',
      name: 'Hydra Labs',
    });
    for (const f of r.formula)
      expect(f.ref).toMatchObject({ locator: expect.any(String), method: 'parser' });
  });

  it('a marketplace listing is labelled as such, never as label evidence', async () => {
    const r = await report(URL_MART, LISTING);
    expect(r.source).toMatchObject({ kind: 'MARKETPLACE', label: 'Marketplace' });
    expect(r.gaps.find((g) => g.key === 'physical_label')!.detail).toMatch(/a marketplace listing/);
    expect(r.formula[0]!.ref.locator).toBe('Product name');
  });

  it('the status vocabulary is neutral', () => {
    const words = Object.values(EVIDENCE_STATUS)
      .map((s) => `${s.label} ${s.description}`)
      .join(' ');
    expect(words).not.toMatch(/good|bad|safe|unsafe|best|poor|score/i);
  });
});

describe('only this product: site chrome and other products are never attributed', () => {
  const page = new URL('https://www.martstore.in/products/pre-workout-a');
  const html = `<header><p>Clinically proven results. GMP certified store.</p></header>
    <main>
      <h1>Pre-Workout A</h1>
      <p>Supports energy and focus before training.</p>
      <div class="note">Ships sealed in the original manufacturer packaging, or message us for help verifying it with the brand.</div>
      <p>We publish only manufacturer-verified facts.</p>
      <p>Starting with half a scoop reduces this risk significantly.</p>
      <p>Need help with an order?</p>
      <div class="related"><a href="/products/pre-workout-b"><h3>Pre-Workout B | Trustified Certified | 3g Creatine per serving</h3></a></div>
      <p><a href="/products/pre-workout-a">This product</a></p>
    </main>
    <footer><p>Third-party tested. HACCP.</p></footer>`;
  const ev = extractEvidence(html, page);

  it('another product’s card is not read as this product’s certification or claim', () => {
    expect(ev.statements.map((x) => x.kind)).not.toContain('third_party_certification');
    expect(JSON.stringify(ev)).not.toMatch(/Trustified|Pre-Workout B/);
  });
  it('header/footer chrome is ignored', () => {
    expect(ev.statements.map((x) => x.kind)).toEqual([]);
    expect(ev.claims.map((c) => c.phrase)).toEqual(['Supports energy and focus before training']);
  });
  it('the fact extractor also ignores other products’ cards and site chrome', () => {
    const x = extractProductPage(
      `<footer><p>Serving size: 3 capsules</p></footer>
       <a href="/products/pre-workout-b"><p>Serving size: 2 scoops</p><p>5g of creatine monohydrate per serving</p></a>
       <p>Serving size: 1 scoop</p>`,
      { pageUrl: page },
    );
    expect(x.serving).toBe('1 scoop');
    expect(x.ingredients).toEqual([]);
  });
  it('a bare noun in prose is not a labelled statement', () => {
    expect(ev.manufacturer).toBeNull();
  });
  it('verb phrases without a health/performance topic are not claims', () => {
    expect(ev.claims.map((c) => c.phrase).join(' ')).not.toMatch(
      /help verifying|help with an order|reduces this risk/,
    );
  });
});

describe('source policy is unchanged', () => {
  it('a blocked source gets no report and no request', async () => {
    const calls: string[] = [];
    const r = await analyseUrl('https://www.hydralabs.in/products/x', {
      fetchImpl: async (u) => {
        calls.push(u);
        return new Response('');
      },
      resolveHost,
      sources: [{ ...POLICY, accessMode: 'NOT_PERMITTED' }],
    });
    expect(r.state).toBe('SOURCE_NOT_ALLOWED');
    expect(r.report).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('linked documents are never fetched (one page request, plus robots.txt)', async () => {
    const calls: string[] = [];
    const web = fakeWeb({ [URL_OK]: ELECTROLYTE });
    await analyseUrl(URL_OK, {
      fetchImpl: async (u, init) => {
        calls.push(u);
        return web(u, init);
      },
      resolveHost,
      sources: [POLICY],
    });
    expect(calls).toEqual(['https://www.hydralabs.in/robots.txt', URL_OK]);
  });

  it('only http(s) links are kept; javascript: and data: links are dropped', () => {
    const ev = extractEvidence(
      '<p><a href="javascript:alert(1)">COA</a> <a href="data:text/html,x">Lab report</a> <a href="https://u:p@x.example/coa.pdf">COA</a></p>',
      new URL(URL_OK),
    );
    expect(ev.documents).toEqual([]);
  });
});
