import { convert } from '@/lib/calculations/units';
import type { Quantity } from '@/lib/content/types';
import { LABEL_VERIFICATION, SOURCE_KIND } from '@/lib/editorial/meta';
import { inlineName } from '@/lib/editorial/product';
import { formatDate } from '@/lib/formatting/dates';
import { formatMoney } from '@/lib/formatting/money';
import { formatQuantity } from '@/lib/formatting/quantity';
import { formatServing } from '@/lib/identity/serving';
import type { ActiveFact, LabelFacts } from './label-facts';
import { NOT_DISCLOSED } from './present';

/**
 * Compare Two Labels: what differs between two published labels.
 *
 * Rules (all tested):
 *  - Facts only. No winner, score, ranking, "better"/"worse" or advice.
 *  - Missing stays missing ("Not disclosed"), never zero, never inferred.
 *  - Compound and elemental amounts are never mixed: a compound weight is
 *    always named with its form ("1,000 mg magnesium bisglycinate"), an
 *    elemental amount always says "elemental".
 *  - Absence of a disclosed amount is never stated as absence of the
 *    ingredient: "No vitamin B6 amount is disclosed for X in the compared
 *    label evidence", never "X contains no vitamin B6".
 *  - Price appears only from a real, dated observation.
 */

// ─── URLs ────────────────────────────────────────────────────────────────

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEP = '-vs-';

/** Deterministic order so A-vs-B and B-vs-A share one canonical URL. */
export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function comparePath(a: string, b: string): string {
  const [x, y] = canonicalPair(a, b);
  return `/compare/${x}${SEP}${y}`;
}

/**
 * Every way to split "<slug-a>-vs-<slug-b>" into two valid slugs (a product
 * slug may itself contain "-vs-"). The caller keeps the split whose products
 * both exist. Anything that is not a plain slug pair yields nothing.
 */
export function pairCandidates(raw: string): Array<[string, string]> {
  if (raw.length > 400 || !SLUG.test(raw)) return [];
  const out: Array<[string, string]> = [];
  for (let i = raw.indexOf(SEP); i !== -1; i = raw.indexOf(SEP, i + 1)) {
    const a = raw.slice(0, i);
    const b = raw.slice(i + SEP.length);
    if (SLUG.test(a) && SLUG.test(b)) out.push([a, b]);
  }
  return out;
}

export type PairResolution =
  | { kind: 'ok'; a: LabelFacts; b: LabelFacts }
  | { kind: 'redirect'; to: string }
  | { kind: 'not_found' };

/**
 * Resolve "/compare/<raw>" against published products only (`load` returns
 * null for anything unpublished). Self-comparisons are not pages. A valid
 * pair in the non-canonical order redirects to the canonical URL; the
 * returned pair is always in canonical order.
 */
export async function resolvePair(
  raw: string,
  load: (slug: string) => Promise<LabelFacts | null>,
): Promise<PairResolution> {
  for (const [x, y] of pairCandidates(raw)) {
    if (x === y) continue;
    const [fx, fy] = await Promise.all([load(x), load(y)]);
    if (!fx || !fy) continue;
    const path = comparePath(x, y);
    if (`/compare/${raw}` !== path) return { kind: 'redirect', to: path };
    return x < y ? { kind: 'ok', a: fx, b: fy } : { kind: 'ok', a: fy, b: fx };
  }
  return { kind: 'not_found' };
}

// ─── Presentation ────────────────────────────────────────────────────────

export interface CompareRow {
  key: string;
  label: string;
  group: 'identity' | 'serving' | 'actives' | 'price' | 'evidence';
  a: string[];
  b: string[];
  /** Neutral "these differ" marker for styling; never a direction. */
  differs: boolean;
}

export interface Difference {
  key: string;
  heading: string;
  lines: string[];
}

export interface EvidenceBlock {
  verification: string;
  source: string | null;
  labelCapturedAt: string | null;
  lastPackObservationAt: string | null;
}

export interface LabelComparison {
  a: { name: string; short: string; href: string; receiptHref: string; isDemo: boolean };
  b: { name: string; short: string; href: string; receiptHref: string; isDemo: boolean };
  path: string;
  sameProduct: boolean;
  rows: CompareRow[];
  differences: Difference[];
  discrepancies: Array<{ product: 'a' | 'b'; name: string; href: string; lines: string[] }>;
  evidence: { a: EvidenceBlock; b: EvidenceBlock };
}

const fullName = (f: LabelFacts) =>
  `${f.brand.name} ${f.name}${f.variant && !f.name.includes(f.variant) ? `, ${f.variant}` : ''}`;
const shortName = (f: LabelFacts) => `${f.brand.name} ${f.name}`;

const sameQty = (x: Quantity | null, y: Quantity | null) => {
  if (!x || !y) return x === y;
  if (x.unit === y.unit) return x.amount === y.amount;
  const v = convert(y.amount, y.unit, x.unit);
  return v !== null && Math.abs(v - x.amount) < 1e-9;
};
const norm = (s: string | null) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Compound weight, always with what it is the weight of. */
const compoundText = (x: ActiveFact | null) =>
  x?.compound
    ? `${formatQuantity(x.compound)} ${inlineName(x.form ?? x.printedName)}`
    : NOT_DISCLOSED;
/** Elemental amount, always marked elemental. */
const elementalText = (x: ActiveFact | null) =>
  x?.elemental
    ? `${formatQuantity(x.elemental)} elemental ${inlineName(x.ingredient)}`
    : NOT_DISCLOSED;
const declaredText = (x: ActiveFact | null) =>
  x?.declared
    ? `${formatQuantity(x.declared)} ${inlineName(x.form ?? x.printedName)}`
    : NOT_DISCLOSED;
const hasSplit = (x: ActiveFact | null) => Boolean(x?.compound || x?.elemental);

/** The amounts an active discloses, compound and elemental kept apart. */
function amountsOf(x: ActiveFact): string | null {
  const parts = [
    x.compound && `${formatQuantity(x.compound)} ${inlineName(x.form ?? x.printedName)}`,
    x.elemental && `${formatQuantity(x.elemental)} elemental ${inlineName(x.ingredient)}`,
    !x.compound && !x.elemental && x.declared && formatQuantity(x.declared),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** One line per active for "other actives" lists. */
function activeLine(x: ActiveFact): string {
  const name =
    x.form && norm(x.form) !== norm(x.ingredient)
      ? `${x.ingredient} (${inlineName(x.form)})`
      : x.ingredient;
  if (x.blend) return `${name}: in ${x.blend}, amount not disclosed`;
  return `${name}: ${amountsOf(x) ?? 'amount not disclosed'}`;
}
const disclosesAmount = (x: ActiveFact) => Boolean(x.compound || x.elemental || x.declared);

const primaryOf = (f: LabelFacts) => f.actives.find((x) => x.isKeyActive) ?? f.actives[0] ?? null;

/** The active both labels are compared on: a shared key active if possible. */
function alignPrimary(
  a: LabelFacts,
  b: LabelFacts,
): [ActiveFact | null, ActiveFact | null, boolean] {
  const inB = (k: string) => b.actives.find((x) => x.key === k) ?? null;
  const ordered = [
    ...a.actives.filter((x) => x.isKeyActive),
    ...a.actives.filter((x) => !x.isKeyActive),
  ];
  for (const x of ordered) {
    const y = inB(x.key);
    if (y) return [x, y, true];
  }
  return [primaryOf(a), primaryOf(b), false];
}

function priceText(f: LabelFacts): string {
  if (!f.price) return 'No price observed';
  return `${formatMoney({ amount: f.price.amount, currency: f.price.currency })} at ${f.price.merchant}, ${formatDate(f.price.observedAt)}`;
}
const perServingText = (f: LabelFacts) =>
  f.price?.perServing ? formatMoney(f.price.perServing, { precise: true }) : 'Not available';
const servingText = (f: LabelFacts) => formatServing(f.serving) ?? f.servingText ?? NOT_DISCLOSED;

function evidence(f: LabelFacts): EvidenceBlock {
  return {
    verification: LABEL_VERIFICATION[f.evidence.verification].label,
    source: f.evidence.sourceType ? SOURCE_KIND[f.evidence.sourceType] : null,
    labelCapturedAt: f.evidence.labelCapturedAt ? formatDate(f.evidence.labelCapturedAt) : null,
    lastPackObservationAt: f.evidence.lastPackObservationAt
      ? formatDate(f.evidence.lastPackObservationAt)
      : null,
  };
}

const absent = (what: string, f: LabelFacts) =>
  `No ${what} is disclosed for ${shortName(f)} in the compared label evidence.`;

export function compareLabels(a: LabelFacts, b: LabelFacts): LabelComparison {
  const A = shortName(a);
  const B = shortName(b);
  const rows: CompareRow[] = [];
  const diffs: Difference[] = [];
  const row = (
    key: string,
    label: string,
    group: CompareRow['group'],
    av: string | string[],
    bv: string | string[],
  ) => {
    const aa = Array.isArray(av) ? av : [av];
    const bb = Array.isArray(bv) ? bv : [bv];
    rows.push({ key, label, group, a: aa, b: bb, differs: aa.join('|') !== bb.join('|') });
  };

  // Identity.
  row('brand', 'Brand', 'identity', a.brand.name, b.brand.name);
  row('product', 'Product', 'identity', a.name, b.name);
  if (a.variant || b.variant)
    row('variant', 'Variant', 'identity', a.variant ?? '—', b.variant ?? '—');

  // Serving.
  const sa = servingText(a);
  const sb = servingText(b);
  if (a.serving || b.serving || a.servingText || b.servingText) {
    row('serving', 'Serving', 'serving', sa, sb);
    if (sa !== sb)
      diffs.push({
        key: 'serving',
        heading: 'Serving',
        lines: [
          a.serving || a.servingText ? `${A} uses ${sa} per serving.` : absent('serving size', a),
          b.serving || b.servingText ? `${B} uses ${sb} per serving.` : absent('serving size', b),
        ],
      });
  }
  if (a.servingsPerPack !== null || b.servingsPerPack !== null) {
    const pa = a.servingsPerPack !== null ? String(a.servingsPerPack) : 'Not printed';
    const pb = b.servingsPerPack !== null ? String(b.servingsPerPack) : 'Not printed';
    row('servings', 'Servings per pack', 'serving', pa, pb);
    if (pa !== pb)
      diffs.push({
        key: 'servings',
        heading: 'Servings per pack',
        lines: [
          a.servingsPerPack !== null
            ? `${A} prints ${pa} servings per pack.`
            : absent('servings-per-pack figure', a),
          b.servingsPerPack !== null
            ? `${B} prints ${pb} servings per pack.`
            : absent('servings-per-pack figure', b),
        ],
      });
  }

  // Primary active.
  const [pa, pb, shared] = alignPrimary(a, b);
  if (pa || pb) {
    row(
      'active',
      shared ? 'Active compared' : 'Key active',
      'actives',
      pa?.ingredient ?? NOT_DISCLOSED,
      pb?.ingredient ?? NOT_DISCLOSED,
    );
    if (!shared)
      diffs.push({
        key: 'active',
        heading: 'Key active',
        lines: [
          pa
            ? `${A} lists ${inlineName(pa.form ?? pa.ingredient)} as its key active.`
            : `No key active is identified for ${A} in the compared label evidence.`,
          pb
            ? `${B} lists ${inlineName(pb.form ?? pb.ingredient)} as its key active.`
            : `No key active is identified for ${B} in the compared label evidence.`,
          'The labels are compared side by side; amounts of different ingredients are not compared with each other.',
        ],
      });
    const ing = inlineName((pa ?? pb)!.ingredient);

    if (pa?.form || pb?.form) {
      row('form', 'Form', 'actives', pa?.form ?? 'Not stated', pb?.form ?? 'Not stated');
      if (shared && norm(pa?.form ?? null) !== norm(pb?.form ?? null))
        diffs.push({
          key: 'form',
          heading: 'Form',
          lines: [
            pa?.form
              ? `${A} declares ${inlineName(pa.form)}.`
              : `The ${A} label evidence does not state a form of ${ing}.`,
            pb?.form
              ? `${B} declares ${inlineName(pb.form)}.`
              : `The ${B} label evidence does not state a form of ${ing}.`,
          ],
        });
    }
    if (pa?.compound || pb?.compound) {
      row('compound', 'Compound / serving', 'actives', compoundText(pa), compoundText(pb));
      if (shared && !sameQty(pa!.compound, pb!.compound))
        diffs.push({
          key: 'compound',
          heading: `Compound weight (${ing})`,
          lines: [
            pa!.compound
              ? `${A} declares ${compoundText(pa)} per serving.`
              : absent(`${ing} compound amount`, a),
            pb!.compound
              ? `${B} declares ${compoundText(pb)} per serving.`
              : absent(`${ing} compound amount`, b),
            'Compound weight is the weight of the whole form, not the amount of the mineral itself.',
          ],
        });
    }
    if (pa?.elemental || pb?.elemental) {
      row(
        'elemental',
        `Elemental ${ing} / serving`,
        'actives',
        elementalText(pa),
        elementalText(pb),
      );
      if (shared && !sameQty(pa!.elemental, pb!.elemental))
        diffs.push({
          key: 'elemental',
          heading: `Elemental ${ing}`,
          lines: [
            pa!.elemental
              ? `${A} declares ${formatQuantity(pa!.elemental)} elemental ${ing} per serving.`
              : absent(`elemental ${ing} amount`, a),
            pb!.elemental
              ? `${B} declares ${formatQuantity(pb!.elemental)} elemental ${ing} per serving.`
              : absent(`elemental ${ing} amount`, b),
          ],
        });
    }
    if (!hasSplit(pa) && !hasSplit(pb) && (pa?.declared || pb?.declared)) {
      row('declared', 'Amount / serving', 'actives', declaredText(pa), declaredText(pb));
      if (shared && !sameQty(pa!.declared, pb!.declared))
        diffs.push({
          key: 'declared',
          heading: `Amount (${ing})`,
          lines: [
            pa!.declared
              ? `${A} declares ${declaredText(pa)} per serving.`
              : absent(`${ing} amount`, a),
            pb!.declared
              ? `${B} declares ${declaredText(pb)} per serving.`
              : absent(`${ing} amount`, b),
          ],
        });
    }
  }

  // Additional disclosed actives.
  const othersA = a.actives.filter((x) => x !== pa);
  const othersB = b.actives.filter((x) => x !== pb);
  if (othersA.length || othersB.length) {
    row(
      'others',
      'Other actives',
      'actives',
      othersA.length ? othersA.map(activeLine) : ['—'],
      othersB.length ? othersB.map(activeLine) : ['—'],
    );
    // Statements per ingredient, never about the ingredient already compared
    // above, and an ingredient counts as present if it is anywhere on the
    // other label (a second row of the same ingredient is not "additional").
    const compared = new Set([pa?.key, pb?.key].filter(Boolean));
    const keys = [...new Set([...othersA, ...othersB].map((x) => x.key))].filter(
      (k) => !compared.has(k),
    );
    for (const k of keys) {
      const x = othersA.find((o) => o.key === k) ?? null;
      const y = othersB.find((o) => o.key === k) ?? null;
      const name = inlineName((x ?? y)!.ingredient);
      if (x && y) {
        if (activeLine(x) !== activeLine(y))
          diffs.push({
            key: `other:${k}`,
            heading: (x ?? y)!.ingredient,
            lines: [`${A}: ${activeLine(x)}.`, `${B}: ${activeLine(y)}.`],
          });
        continue;
      }
      const [has, hasName, lacks] = x ? [x, A, b] : [y!, B, a];
      if (lacks.actives.some((o) => o.key === k)) continue;
      diffs.push({
        key: `other:${k}`,
        heading: `Additional active: ${has.ingredient}`,
        lines: [
          disclosesAmount(has) && !has.blend
            ? `${hasName} declares ${name} (${amountsOf(has)} per serving).`
            : `${hasName} lists ${name} without a disclosed amount.`,
          absent(`${name} amount`, lacks),
        ],
      });
    }
  }

  // Declared nutrients (e.g. protein per serving).
  if (a.nutrients.length || b.nutrients.length) {
    const nl = (f: LabelFacts) =>
      f.nutrients.length
        ? f.nutrients.map((n) => `${formatQuantity(n.amount)} ${inlineName(n.name)}`)
        : ['—'];
    row('nutrients', 'Declared nutrients', 'actives', nl(a), nl(b));
    for (const k of new Set([...a.nutrients, ...b.nutrients].map((n) => n.key))) {
      const x = a.nutrients.find((n) => n.key === k) ?? null;
      const y = b.nutrients.find((n) => n.key === k) ?? null;
      const name = inlineName((x ?? y)!.name);
      if (x && y && sameQty(x.amount, y.amount)) continue;
      diffs.push({
        key: `nutrient:${k}`,
        heading: (x ?? y)!.name,
        lines: [
          x
            ? `${A} declares ${formatQuantity(x.amount)} ${name} per serving.`
            : absent(`${name} amount`, a),
          y
            ? `${B} declares ${formatQuantity(y.amount)} ${name} per serving.`
            : absent(`${name} amount`, b),
        ],
      });
    }
  }

  // Commercial observation.
  if (a.price || b.price) {
    row('price', 'Observed price', 'price', priceText(a), priceText(b));
    row('perServing', 'Price / serving', 'price', perServingText(a), perServingText(b));
    const line = (f: LabelFacts, n: string) =>
      f.price
        ? f.price.perServing
          ? `${n}: ${perServingText(f)} per serving (${f.price.merchant}, ${formatDate(f.price.observedAt)}).`
          : `${n}: ${priceText(f)}; price per serving not available.`
        : `No price has been observed for ${n}.`;
    if (priceText(a) !== priceText(b) || perServingText(a) !== perServingText(b))
      diffs.push({
        key: 'price',
        heading: 'Observed price',
        lines: [line(a, A), line(b, B), 'Prices are dated observations, not current offers.'],
      });
  }

  // Evidence.
  const ea = evidence(a);
  const eb = evidence(b);
  row('evidence', 'Label evidence', 'evidence', ea.verification, eb.verification);
  row('source', 'Source', 'evidence', ea.source ?? '—', eb.source ?? '—');
  row(
    'captured',
    'Label captured',
    'evidence',
    ea.labelCapturedAt ?? '—',
    eb.labelCapturedAt ?? '—',
  );
  if (ea.verification !== eb.verification)
    diffs.push({
      key: 'evidence',
      heading: 'Label evidence',
      lines: [
        `${A}: ${LABEL_VERIFICATION[a.evidence.verification].description}`,
        `${B}: ${LABEL_VERIFICATION[b.evidence.verification].description}`,
      ],
    });
  row(
    'discrepancies',
    'Open label differences',
    'evidence',
    a.discrepancies.length ? `${a.discrepancies.length} open` : 'None recorded',
    b.discrepancies.length ? `${b.discrepancies.length} open` : 'None recorded',
  );

  const discrepancies = (['a', 'b'] as const)
    .map((side) => {
      const f = side === 'a' ? a : b;
      return {
        product: side,
        name: shortName(f),
        href: `/products/${f.slug}#sources-compared`,
        lines: f.discrepancies.map(
          (d) => `${d.field}: ${listSources(d.sources)} state different values.`,
        ),
      };
    })
    .filter((x) => x.lines.length);

  const same = a.slug === b.slug;
  return {
    a: side(a),
    b: side(b),
    path: comparePath(a.slug, b.slug),
    sameProduct: same,
    rows,
    differences: same ? [] : orderDifferences(diffs),
    discrepancies,
    evidence: { a: ea, b: eb },
  };
}

/** Actives first (what the product is), then serving, price, evidence. */
const ORDER = [
  'active',
  'form',
  'compound',
  'elemental',
  'declared',
  'other:',
  'nutrient:',
  'serving',
  'servings',
  'price',
  'evidence',
];
const rank = (key: string) => {
  const i = ORDER.findIndex((o) => (o.endsWith(':') ? key.startsWith(o) : key === o));
  return i === -1 ? ORDER.length : i;
};
const orderDifferences = (ds: Difference[]) =>
  ds
    .map((d, i) => ({ d, i }))
    .sort((x, y) => rank(x.d.key) - rank(y.d.key) || x.i - y.i)
    .map((x) => x.d);

const side = (f: LabelFacts) => ({
  name: fullName(f),
  short: shortName(f),
  href: `/products/${f.slug}`,
  receiptHref: `/receipt/${f.slug}`,
  isDemo: f.isDemo,
});

function listSources(sources: LabelFacts['discrepancies'][number]['sources']): string {
  const names = [...new Set(sources.map((s) => SOURCE_KIND[s].toLowerCase()))].map((n) =>
    n === 'pack' ? 'the physical label' : `the ${n}`,
  );
  if (names.length <= 1) return `${names[0] ?? 'the sources'} entries`;
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
