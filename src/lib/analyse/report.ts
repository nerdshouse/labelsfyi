/**
 * The analyser's evidence report: "what does this source actually tell us,
 * and what is still unknown?" (docs/ingestion.md).
 *
 * An evidence READER, never a judge. It has no score, rating, ranking or
 * verdict of any kind: it sorts what the page states into sections, marks
 * each item with a neutral status, lists what was not found, surfaces values
 * that differ across the page, and turns those gaps into questions a consumer
 * can ask the brand.
 *
 * Rules:
 * - "Not found" means not found on the analysed page, never "the product
 *   does not have it".
 * - A brand statement ("GMP certified", "third-party tested") is a SOURCE
 *   CLAIM, never evidence. A linked document is DOCUMENT FOUND; its contents
 *   are not read, so it never proves more than that it is linked.
 * - An amount's basis is only what the page states; otherwise BASIS NOT STATED.
 * - Compound and elemental amounts stay separate; nothing is calculated.
 * - Nothing here is label-verified: the analyser never sees the physical pack.
 */
import type { SourceKind } from '@/lib/content/types';
import type { DiscrepancyValue } from '@/lib/content/types';
import { SOURCE_KIND } from '@/lib/editorial/meta';
import type { Provenance } from './analyse';
import type { DocumentKind, EvidenceLink, PageEvidence, StatementKind } from './evidence';
import { MINERALS, type ExtractedIngredient, type PageExtraction } from './extract';

// ─── Vocabulary ──────────────────────────────────────────────────────────

export type EvidenceStatus =
  | 'DISCLOSED'
  | 'SOURCE_CLAIM'
  | 'DOCUMENT_FOUND'
  | 'NOT_FOUND'
  | 'BASIS_NOT_STATED'
  | 'NEEDS_VERIFICATION'
  | 'INCONSISTENT'
  | 'LABEL_VERIFIED'
  | 'EDITORIAL_CALCULATION';

/** One vocabulary for every section. Neutral descriptions, never verdicts. */
export const EVIDENCE_STATUS: Record<EvidenceStatus, { label: string; description: string }> = {
  DISCLOSED: { label: 'Disclosed', description: 'Stated on the analysed source.' },
  SOURCE_CLAIM: {
    label: 'Source claim',
    description: 'The brand or seller says so; no supporting document was found.',
  },
  DOCUMENT_FOUND: {
    label: 'Document found',
    description:
      'A document is linked from the source. Its contents were not read by the analyser.',
  },
  NOT_FOUND: { label: 'Not found', description: 'Not found on the analysed page.' },
  BASIS_NOT_STATED: {
    label: 'Basis not stated',
    description: 'An amount is given without saying per what (serving, scoop, 100 g…).',
  },
  NEEDS_VERIFICATION: {
    label: 'Needs verification',
    description: 'Needs checking against the physical label.',
  },
  INCONSISTENT: { label: 'Inconsistent', description: 'The source gives different values.' },
  LABEL_VERIFIED: {
    label: 'Label verified',
    description: 'Checked against the physical label by labels.fyi.',
  },
  EDITORIAL_CALCULATION: {
    label: 'Editorial calculation',
    description: 'Calculated by labels.fyi from verified values.',
  },
};

/** How the source is described. Facts from a website are never label evidence. */
export const SOURCE_DESCRIPTION: Record<SourceKind, string> = {
  PHYSICAL_PACK: 'the physical pack',
  BRAND_SUPPLIED_LABEL: 'a brand-supplied label file',
  PRODUCT_ARTWORK: 'product artwork',
  BRAND_WEBSITE: 'the brand’s website',
  MARKETPLACE: 'a marketplace listing',
  MARKETING_COPY: 'marketing copy',
  OTHER: 'a web page',
};

// ─── Report shape ────────────────────────────────────────────────────────

/** Where on the page a value was read and how. Page-level provenance is on the report. */
export interface FactRef {
  locator: string;
  method: 'structured_data' | 'parser' | 'link';
}

export interface ReportField {
  key: string;
  label: string;
  status: EvidenceStatus;
  value: string | null;
  ref: FactRef | null;
}

export interface FormulaRow {
  name: string;
  /** The form only when the name itself states it ("Magnesium glycinate"). */
  form: string | null;
  amount: string;
  unit: string;
  basis: string | null;
  /** Elemental only when the page says "elemental"; otherwise as stated. */
  amountKind: 'elemental' | 'as_stated';
  status: 'DISCLOSED' | 'BASIS_NOT_STATED';
  ref: FactRef;
}

export interface QualityItem {
  key: string;
  label: string;
  status: EvidenceStatus;
  detail: string;
  documents: EvidenceLink[];
  statement: string | null;
}

export interface CertificationItem {
  key: string;
  label: string;
  status: EvidenceStatus;
  brandStatement: string | null;
  documents: EvidenceLink[];
  /** The analyser never verifies a certification. */
  verifiedByLabelsFyi: false;
}

export interface ClaimItem {
  text: string;
  category: 'health' | 'performance' | 'quality' | 'purity' | 'formulation' | 'other';
  status: 'EVIDENCE_LINKED' | 'EVIDENCE_NOT_FOUND';
  evidence: EvidenceLink | null;
}

export interface Gap {
  key: string;
  label: string;
  detail: string;
}

/** Same value shape as a recorded discrepancy (DiscrepancyValue); computed, never stored. */
export interface ReportDiscrepancy {
  field: string;
  values: Array<Pick<DiscrepancyValue, 'sourceType' | 'value' | 'locator' | 'observedAt'>>;
  status: 'INCONSISTENT';
  action: string;
}

export interface BrandQuestion {
  text: string;
  /** The gap or discrepancy it comes from (never generic). */
  from: string;
}

export interface EvidenceReport {
  source: { kind: SourceKind; label: string; description: string; name: string };
  identity: ReportField[];
  formula: FormulaRow[];
  nutrition: ReportField[];
  quality: QualityItem[];
  certifications: CertificationItem[];
  claims: ClaimItem[];
  gaps: Gap[];
  discrepancies: ReportDiscrepancy[];
  questions: BrandQuestion[];
  summary: {
    factsFound: number;
    itemsWithAmounts: number;
    documentsFound: number;
    claimsIdentified: number;
    gaps: number;
    inconsistencies: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const found = (
  key: string,
  label: string,
  value: string | null | undefined,
  ref: FactRef,
): ReportField =>
  value
    ? { key, label, status: 'DISCLOSED', value, ref }
    : { key, label, status: 'NOT_FOUND', value: null, ref: null };

const FORMS =
  /\b(bisglycinate|glycinate|citrate|oxide|malate|threonate|taurate|monohydrate|hcl|hydrochloride|picolinate|carbonate|chloride|gluconate|sulphate|sulfate|cholecalciferol|ergocalciferol|methylcobalamin|cyanocobalamin|adenosylcobalamin|methylfolate|ascorbate|ascorbic acid|isolate|concentrate|hydrolysed|hydrolyzed)\b/i;

const NUTRIENTS: Array<{ key: string; label: string; re: RegExp }> = [
  { key: 'energy', label: 'Energy', re: /^(energy|calories|kcal)\b/i },
  { key: 'protein', label: 'Protein', re: /^protein\b/i },
  { key: 'carbohydrate', label: 'Carbohydrate', re: /^(total\s+)?carbohydrates?\b/i },
  { key: 'sugar', label: 'Total sugars', re: /^(total\s+)?sugars?\b/i },
  { key: 'added_sugar', label: 'Added sugars', re: /^added\s+sugars?\b/i },
  { key: 'fat', label: 'Total fat', re: /^(total\s+)?fat\b/i },
  { key: 'sodium', label: 'Sodium', re: /^sodium\b/i },
];

const splitAmount = (v: string) => {
  const m = /^([\d.,]+)\s*(.*)$/.exec(v.trim());
  return { amount: m?.[1] ?? v, unit: m?.[2] ?? '' };
};
const toMg = (v: string): number | null => {
  const m = /^([\d.,]+)\s*(mg|mcg|µg|g)$/i.exec(v.trim());
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ''));
  const u = m[2]!.toLowerCase();
  return u === 'g' ? n * 1000 : u === 'mg' ? n : n / 1000;
};
const baseLabel = (l: string) =>
  l
    .replace(/\s*\(per [^)]+\)$/i, '')
    .toLowerCase()
    .trim();

const LOCATOR: Record<ExtractedIngredient['where'], string> = {
  'Page title': 'Page title',
  'Product name': 'Product name',
  'Facts table on page': 'Facts table on page',
  'Page text': 'Page text',
};

const QUALITY_LABELS: Array<{
  key: string;
  label: string;
  docs: DocumentKind[];
  stmts: StatementKind[];
}> = [
  {
    key: 'product_coa',
    label: 'Product certificate of analysis (COA)',
    docs: ['product_coa'],
    stmts: [],
  },
  { key: 'batch_coa', label: 'Batch-specific COA', docs: ['batch_coa'], stmts: [] },
  { key: 'raw_material_coa', label: 'Raw-material COA', docs: ['raw_material_coa'], stmts: [] },
  {
    key: 'third_party_report',
    label: 'Third-party laboratory report',
    docs: ['lab_report'],
    stmts: ['third_party_tested', 'lab_tested'],
  },
  { key: 'heavy_metals', label: 'Heavy-metal testing', docs: [], stmts: ['heavy_metals'] },
  {
    key: 'microbiological',
    label: 'Microbiological testing',
    docs: [],
    stmts: ['microbiological'],
  },
];

const CERT_LABELS: Array<{
  key: string;
  label: string;
  docs: DocumentKind[];
  stmts: StatementKind[];
}> = [
  { key: 'gmp', label: 'GMP', docs: ['gmp_certificate'], stmts: ['gmp'] },
  { key: 'iso', label: 'ISO', docs: ['iso_certificate'], stmts: ['iso'] },
  { key: 'haccp', label: 'HACCP', docs: [], stmts: ['haccp'] },
  {
    key: 'third_party_certification',
    label: 'Third-party certification',
    docs: ['other_certificate'],
    stmts: ['third_party_certification'],
  },
];

function claimCategory(t: string): ClaimItem['category'] {
  if (/tested|certified|gmp|iso|haccp|fssai/i.test(t)) return 'quality';
  if (/free|pure|natural|no\s+(added|artificial)/i.test(t)) return 'purity';
  if (/clinically|scientifically|research|science|evidence|doctor/i.test(t)) return 'formulation';
  // A named health topic wins over a passing mention of exercise.
  if (
    /hydrat|electrolyte|sleep|immun|digest|gut|heart|joint|bone|skin|hair|stress|mood|focus|brain/i.test(
      t,
    )
  )
    return 'health';
  if (/energy|strength|recovery|endurance|muscle|stamina|performance|workout/i.test(t))
    return 'performance';
  if (/supports?|helps?|boosts?|improves?|promotes?|enhances?|reduces?|aids?|relieves?/i.test(t))
    return 'health';
  return 'other';
}

// ─── Builder ─────────────────────────────────────────────────────────────

export function buildEvidenceReport(
  x: PageExtraction,
  ev: PageEvidence,
  provenance: Provenance,
): EvidenceReport {
  const kind: SourceKind = provenance.sourceKind;
  const sd = (locator: string): FactRef => ({ locator, method: 'structured_data' });
  const parsed = (locator: string): FactRef => ({ locator, method: 'parser' });
  const obs = provenance.observedAt;

  // 1. Identity
  const format = x.serving
    ? /capsule/i.test(x.serving)
      ? 'Capsule'
      : /tablet|caplet/i.test(x.serving)
        ? 'Tablet'
        : /softgel/i.test(x.serving)
          ? 'Softgel'
          : /sachet/i.test(x.serving)
            ? 'Sachet'
            : /gumm/i.test(x.serving)
              ? 'Gummy'
              : /strip/i.test(x.serving)
                ? 'Strip'
                : null
    : null;
  const price = x.price
    ? `${x.price.currency === 'INR' ? '₹' : `${x.price.currency} `}${x.price.amount.toLocaleString('en-IN')}`
    : null;
  const identity: ReportField[] = [
    found('name', 'Product name', x.name, sd('Structured data / page title')),
    found('brand', 'Brand', x.brand, sd('Structured data')),
    found('format', 'Format', format, parsed('From the serving-size statement')),
    found('pack_size', 'Pack size / net quantity', ev.netQuantity?.value, parsed('Page text')),
    found('servings', 'Servings per pack', x.servingsPerContainer, parsed('Page text')),
    found('serving', 'Serving size', x.serving, parsed('Page text')),
    found('country', 'Country of origin', ev.countryOfOrigin?.value, parsed('Page text')),
    found('manufacturer', 'Manufacturer', ev.manufacturer?.value, parsed('Page text')),
    found('marketer', 'Marketer', ev.marketer?.value, parsed('Page text')),
    found('fssai', 'FSSAI licence number', ev.fssaiLicence?.value, parsed('Page text')),
    found('gtin', 'Barcode (GTIN)', x.gtin, sd('Structured data')),
    found(
      'veg',
      'Vegetarian / non-vegetarian',
      x.vegStatement && `“${x.vegStatement}”`,
      parsed('Page text'),
    ),
    found('shelf_life', 'Shelf life', ev.shelfLife?.value, parsed('Page text')),
    found('mrp', 'MRP', ev.mrp?.value, parsed('Page text')),
    found('price', 'Current listed price', price, sd('Structured data (offer)')),
  ];

  // 2 & 3. Formula vs nutrition rows (a row is one or the other, never both)
  const nutritionRows = new Map<string, ExtractedIngredient>();
  const formula: FormulaRow[] = [];
  for (const i of x.ingredients) {
    const name = i.label.replace(/\s*\(per [^)]+\)$/i, '').trim();
    const nutrient = NUTRIENTS.find((n) => n.re.test(name));
    if (nutrient) {
      if (!nutritionRows.has(nutrient.key)) nutritionRows.set(nutrient.key, i);
      continue;
    }
    const { amount, unit } = splitAmount(i.value);
    formula.push({
      name,
      form: FORMS.exec(name)?.[1]?.toLowerCase() ?? null,
      amount,
      unit,
      basis: i.basis,
      amountKind: i.elementalStated ? 'elemental' : 'as_stated',
      status: i.basis ? 'DISCLOSED' : 'BASIS_NOT_STATED',
      ref: parsed(LOCATOR[i.where]),
    });
  }
  const nutrition: ReportField[] = [
    found('serving', 'Serving size', x.serving, parsed('Page text')),
    found('servings', 'Servings per pack', x.servingsPerContainer, parsed('Page text')),
    ...NUTRIENTS.map((n) => {
      const row = nutritionRows.get(n.key);
      if (!row) return found(n.key, n.label, null, parsed(''));
      return {
        key: n.key,
        label: n.label,
        status: (row.basis ? 'DISCLOSED' : 'BASIS_NOT_STATED') as EvidenceStatus,
        value: `${row.value}${row.basis ? ` per ${row.basis}` : ''}`,
        ref: parsed(LOCATOR[row.where]),
      };
    }),
  ];

  // 4 & 5. Quality evidence and certifications: documents vs brand statements
  const docsOf = (kinds: DocumentKind[]) =>
    ev.documents.filter((d) => kinds.includes(d.kind)).map(({ kind: _k, ...l }) => l);
  const stmtOf = (kinds: StatementKind[]) =>
    ev.statements.find((s) => kinds.includes(s.kind))?.phrase ?? null;
  const quality: QualityItem[] = QUALITY_LABELS.map((q) => {
    const documents = docsOf(q.docs);
    const statement = stmtOf(q.stmts);
    return {
      key: q.key,
      label: q.label,
      documents,
      statement,
      status: documents.length ? 'DOCUMENT_FOUND' : statement ? 'SOURCE_CLAIM' : 'NOT_FOUND',
      detail: documents.length
        ? 'Linked from the page. Its contents (what was tested, which batch, which laboratory) were not read by the analyser.'
        : statement
          ? `The page states “${statement}”. No supporting document was found on the page.`
          : 'Not found on the analysed page.',
    };
  });
  const fssaiDocs = docsOf(['fssai_document']);
  const certifications: CertificationItem[] = [
    {
      key: 'fssai',
      label: 'FSSAI licence',
      brandStatement: ev.fssaiLicence ? `Licence no. ${ev.fssaiLicence.value}` : stmtOf(['fssai']),
      documents: fssaiDocs,
      status: fssaiDocs.length
        ? 'DOCUMENT_FOUND'
        : ev.fssaiLicence
          ? 'DISCLOSED'
          : stmtOf(['fssai'])
            ? 'SOURCE_CLAIM'
            : 'NOT_FOUND',
      verifiedByLabelsFyi: false,
    },
    {
      key: 'veg',
      label: 'Vegetarian declaration',
      brandStatement: x.vegStatement,
      documents: [],
      status: x.vegStatement ? 'SOURCE_CLAIM' : 'NOT_FOUND',
      verifiedByLabelsFyi: false,
    },
    ...CERT_LABELS.map((c) => {
      const documents = docsOf(c.docs);
      const brandStatement = stmtOf(c.stmts);
      return {
        key: c.key,
        label: c.label,
        brandStatement,
        documents,
        status: (documents.length
          ? 'DOCUMENT_FOUND'
          : brandStatement
            ? 'SOURCE_CLAIM'
            : 'NOT_FOUND') as EvidenceStatus,
        verifiedByLabelsFyi: false as const,
      };
    }),
  ];

  // 6. Claims (the brand's words, bounded; never judged true or false)
  const claims: ClaimItem[] = ev.claims.map((c) => ({
    text: c.phrase,
    category: claimCategory(c.phrase),
    status: c.link ? 'EVIDENCE_LINKED' : 'EVIDENCE_NOT_FOUND',
    evidence: c.link,
  }));

  // 8. Discrepancies (values that differ across the same page)
  const discrepancies: ReportDiscrepancy[] = [];
  const differing = (
    field: string,
    mentions: Array<{ value: string; locator: string }>,
    action: string,
    norm = (v: string) => v.toLowerCase().replace(/\s+/g, ''),
  ) => {
    const distinct = new Map<string, { value: string; locator: string }>();
    for (const m of mentions) if (!distinct.has(norm(m.value))) distinct.set(norm(m.value), m);
    if (distinct.size > 1)
      discrepancies.push({
        field,
        status: 'INCONSISTENT',
        action,
        values: [...distinct.values()].map((m) => ({
          sourceType: kind,
          value: m.value,
          locator: m.locator,
          observedAt: obs,
        })),
      });
  };
  differing(
    'Preparation volume',
    ev.preparation,
    'Ask the brand which preparation instruction should be followed.',
  );
  differing('Serving size', ev.servingMentions, 'Ask the brand which serving size is correct.');
  differing(
    'Servings per pack',
    ev.servingsMentions,
    'Ask the brand how many servings a pack contains.',
  );
  const byIngredient = new Map<string, ExtractedIngredient[]>();
  for (const i of x.ingredients) {
    const k = `${baseLabel(i.label)}|${i.elementalStated}`;
    byIngredient.set(k, [...(byIngredient.get(k) ?? []), i]);
  }
  for (const rows of byIngredient.values()) {
    const comparable = rows.filter((r) => toMg(r.value) !== null);
    // Different amounts for the same named ingredient, stated on the same basis (or none).
    const sameBasis = new Map<string, ExtractedIngredient[]>();
    for (const r of comparable)
      sameBasis.set(r.basis ?? '', [...(sameBasis.get(r.basis ?? '') ?? []), r]);
    for (const group of sameBasis.values())
      if (new Set(group.map((r) => toMg(r.value))).size > 1)
        differing(
          `Amount of ${group[0]!.label.replace(/\s*\(per [^)]+\)$/i, '')}`,
          group.map((r) => ({ value: r.value, locator: LOCATOR[r.where] })),
          'Ask the brand which amount is on the current label.',
          (v) => String(toMg(v)),
        );
  }

  // 7. Gaps (only what was actually not found) and 9. questions from them
  const gaps: Gap[] = [];
  const questions: BrandQuestion[] = [];
  const gap = (key: string, label: string, detail: string, question?: string) => {
    gaps.push({ key, label, detail });
    if (question) questions.push({ text: question, from: key });
  };
  const nf = 'Not found on the analysed page.';
  if (!formula.length && !nutritionRows.size)
    gap(
      'amounts',
      'Exact amount of each active ingredient',
      nf,
      'Can you provide the exact amount of each active ingredient per serving?',
    );
  else if (!x.ingredients.some((i) => i.where === 'Facts table on page'))
    gap(
      'full_formula',
      'Full quantitative formula (a facts table)',
      'Only individual amounts were found, not a complete facts table.',
      'Can you share the full Supplement Facts / nutrition table for this product?',
    );
  const basisless = formula.filter((f) => f.status === 'BASIS_NOT_STATED');
  if (basisless.length)
    gap(
      'basis',
      'Basis for some amounts',
      `${basisless.map((f) => `${f.name} ${f.amount} ${f.unit}`.trim()).join(', ')}: the page does not say per what.`,
      `Is ${basisless
        .slice(0, 3)
        .map((f) => `the ${f.amount} ${f.unit} of ${f.name}`.replace(/\s+/g, ' '))
        .join(', ')} per serving, per scoop or per pack?`,
    );
  if (!x.serving) gap('serving', 'Serving size', nf, 'What is the serving size for this product?');
  if (
    x.ingredients.some((i) => MINERALS.test(i.label)) &&
    !x.ingredients.some((i) => i.elementalStated)
  )
    gap(
      'elemental',
      'Elemental amount of minerals',
      'Mineral amounts are given without saying whether they are elemental. We never calculate it.',
      'Are the mineral amounts elemental amounts, or the weight of the whole compound?',
    );
  if (!ev.fssaiLicence)
    gap('fssai', 'FSSAI licence number', nf, 'What is the FSSAI licence number for this product?');
  if (!ev.manufacturer)
    gap('manufacturer', 'Manufacturer', nf, 'Who manufactures this product, and where?');
  const anyCoa = quality.some((q) => q.key.endsWith('_coa') && q.status === 'DOCUMENT_FOUND');
  const batch = quality.find((q) => q.key === 'batch_coa')!;
  if (batch.status !== 'DOCUMENT_FOUND')
    gap(
      'batch_coa',
      'Batch-specific COA',
      anyCoa
        ? 'A COA is linked, but nothing on the page says it covers the batch currently sold.'
        : nf,
      anyCoa
        ? 'Does the available COA correspond to the batch currently being sold?'
        : 'Can you share the COA for the current batch?',
    );
  const lab = quality.find((q) => q.key === 'third_party_report')!;
  if (lab.status !== 'DOCUMENT_FOUND')
    gap(
      'lab_details',
      'Testing laboratory details',
      lab.status === 'SOURCE_CLAIM'
        ? `The page states “${lab.statement}”, but no laboratory report was found.`
        : nf,
      anyCoa || lab.status === 'SOURCE_CLAIM'
        ? 'Which laboratory performed the testing?'
        : undefined,
    );
  const hm = quality.find((q) => q.key === 'heavy_metals')!;
  const micro = quality.find((q) => q.key === 'microbiological')!;
  if (hm.status !== 'DOCUMENT_FOUND' || micro.status !== 'DOCUMENT_FOUND')
    gap(
      'contaminants',
      'Heavy-metal and microbiological results',
      anyCoa
        ? 'A COA is linked, but its contents were not read; results were not found on the page.'
        : nf,
      anyCoa || lab.status === 'SOURCE_CLAIM'
        ? 'Does the testing include heavy metals and microbiological contaminants?'
        : undefined,
    );
  for (const c of certifications)
    if (c.status === 'SOURCE_CLAIM' && c.key !== 'veg' && c.key !== 'fssai')
      gap(
        `${c.key}_document`,
        `${c.label} certificate`,
        `The page states “${c.brandStatement}”; no certificate was found.`,
        c.key === 'gmp'
          ? 'Can you share the GMP certificate for the manufacturing facility?'
          : `Can you share the ${c.label} certificate referred to on the product page?`,
      );
  gap(
    'physical_label',
    'Physical label details',
    `Everything above comes from ${SOURCE_DESCRIPTION[kind]}. Nothing has been checked against the physical pack.`,
  );
  for (const d of discrepancies)
    questions.push({
      text:
        d.field === 'Preparation volume'
          ? `Can you clarify whether the recommended preparation volume is ${d.values.map((v) => v.value).join(' or ')}?`
          : `The page states more than one ${d.field.toLowerCase()} (${d.values.map((v) => v.value).join(' vs ')}). Which is correct?`,
      from: d.field,
    });

  const disclosed = (f: ReportField) => f.status === 'DISCLOSED' || f.status === 'BASIS_NOT_STATED';
  return {
    source: {
      kind,
      label: SOURCE_KIND[kind],
      description: SOURCE_DESCRIPTION[kind],
      name: provenance.sourceName,
    },
    identity,
    formula,
    nutrition,
    quality,
    certifications,
    claims,
    gaps,
    discrepancies,
    questions: questions.filter((q, i) => questions.findIndex((o) => o.text === q.text) === i),
    summary: {
      factsFound:
        identity.filter(disclosed).length +
        formula.length +
        nutrition.slice(2).filter(disclosed).length,
      itemsWithAmounts: formula.length + nutritionRows.size,
      documentsFound: ev.documents.length,
      claimsIdentified: claims.length,
      gaps: gaps.length,
      inconsistencies: discrepancies.length,
    },
  };
}
