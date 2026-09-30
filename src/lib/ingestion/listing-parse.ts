/**
 * Conservative parsing of RETAILER / MARKETPLACE listing text (docs/ingestion.md).
 *
 * A retailer listing is discovery data, never label evidence: every fact made
 * from it stays UNVERIFIED. When in doubt, no fact is created: missing stays
 * missing. Brand stores and the URL analyser keep their existing parsers
 * (titleAmounts / descriptionAmounts in shopify-feed.ts); nothing here changes
 * them.
 *
 * An amount becomes an ingredient fact only when a recognised ingredient term
 * sits directly beside it:
 *   number-first  "3g Creatine", "540mg EPA", "10,000mcg Biotin", "1g Creatine Per Chew"
 *   label-first   "Magnesium Glycinate 1880mg", "EPA 360mg", "Caffeine Tablets 200mg"
 *   listing text  "220mg of elemental magnesium per serving"
 * Never: product names, flavours, pack weights, ranges ("5–7g"), combined
 * figures ("300mg EPA/DHA"), "Omega-3" totals, or branded ingredients. Nothing
 * is calculated: an elemental figure is kept only when the listing states it.
 *
 * BASIS: an amount is only meaningful with its basis ("per serving", "per
 * scoop", "per tablet", "per 100g", …). `basis` is set ONLY when the listing
 * states it; it is never assumed. The feed turns basis-less statements into a
 * generic unverified listing fact, never an ingredient_amount.
 */
import { descriptionAmounts } from './shopify-feed';

export interface ListingAmount {
  /** Ingredient, plus "(per X)" when the basis is stated. */
  label: string;
  value: string;
  where: 'title' | 'description';
  /** The basis exactly as stated ("serving", "scoop", "100g"…), or null: never assumed. */
  basis: string | null;
}

// Ingredient vocabulary (longest alternatives first). Deliberately excludes
// ambiguous totals ("omega-3", "whey", "multivitamin") and branded blends.
const TERMS = [
  'creatine monohydrate',
  'creatine hcl',
  'creatine',
  'beta[- ]alanine',
  'l-citrulline',
  'citrulline malate',
  'citrulline',
  'l-arginine',
  'arginine',
  'l-carnitine',
  'carnitine',
  'betaine',
  'taurine',
  'caffeine anhydrous',
  'caffeine',
  'bcaas?',
  'eaas?',
  'epa',
  'dha',
  'protein',
  'magnesium',
  'calcium',
  'zinc',
  'iron',
  'potassium',
  'sodium',
  'selenium',
  'chromium',
  'vitamin [a-k][0-9]{0,2}',
  'biotin',
  'folic acid',
  'folate',
  'ashwagandha',
  'withania somnifera',
  'shilajit',
  'curcumin',
  'turmeric',
  'berberine',
  'glutathione',
  'n-acetyl[- ]cysteine',
  'nac',
  'milk thistle',
  'glucosamine',
  'chondroitin',
  'msm',
  'collagen',
  'hyaluronic acid',
  'coq10',
  'melatonin',
  'electrolytes?',
  'fish oil',
  'keratin',
  'resveratrol',
];
const FORMS = [
  'monohydrate',
  'hcl',
  'malate',
  'bisglycinate',
  'glycinate',
  'citrate',
  'threonate',
  'oxide',
  'anhydrous',
  'extract',
  'picolinate',
  'carbonate',
];
const TERM = `(?:${TERMS.join('|')})(?:\\s+(?:${FORMS.join('|')}))*`;
const ADJ = `(?:pure|natural|organic|premium|high-quality|micronised|micronized|liposomal|active)`;
const DOSE_FORM = `(?:tablets?|capsules?|softgels?|gummies|powder|liquid|chews?|strips?|pills?)`;
const PER = `(serving|scoop|tablet|capsule|softgel|chew|gummy|strip|sachet|100\\s?(?:g|ml))`;

const NUMBER = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`;
const AMOUNT = new RegExp(`${NUMBER}\\s?(mg|mcg|µg|g|iu)(?![a-z])`, 'gi');
/** After the amount: [of] [elemental] [≤2 adjectives/percentages] TERM [per X]. */
const AFTER = new RegExp(
  `^\\s*(?:of\\s+)?(elemental\\s+)?(?:(?:${ADJ}|\\d+(?:\\.\\d+)?%)\\s+){0,2}(${TERM})(?![a-z0-9])(\\s*/)?(?:\\s+per\\s+${PER}\\b)?`,
  'i',
);
/** Before the amount: [elemental] TERM [dose form] [+] [)] [NN%] [(] — then the number. */
const BEFORE = new RegExp(
  `(?<![a-z0-9-])(elemental\\s+)?(${TERM})(?:\\s+${DOSE_FORM})?\\s*\\+?\\s*\\)?\\s*(?:\\d+(?:\\.\\d+)?%\\s*)?\\(?\\s*$`,
  'i',
);

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** mg value, for de-duplication only (never shown, never used to compute). */
function toMg(value: string): number | null {
  const m = /^([\d.]+)\s*(mg|mcg|µg|g|iu)$/i.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2]!.toLowerCase();
  return u === 'g' ? n * 1000 : u === 'mg' ? n : u === 'iu' ? null : n / 1000;
}

/** Segments that never let a label or amount leak across "|", " - ", " – " or ", ". */
const segments = (title: string) =>
  title
    .split(/\s*\|\s*|\s+[–—-]\s+|,\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

function titleListingAmounts(title: string): ListingAmount[] {
  const out: ListingAmount[] = [];
  for (const seg of segments(title)) {
    for (const m of seg.matchAll(AMOUNT)) {
      const start = m.index!;
      const end = start + m[0].length;
      const number = m[1]!.replace(/,/g, '');
      const unit = m[2]!.toLowerCase() === 'iu' ? 'IU' : m[2]!.toLowerCase();
      // Ranges ("5–7g") and pack weights (≥ 100 g) are never doses.
      if (/\d\s*[–-]\s*$/.test(seg.slice(0, start))) continue;
      if (unit === 'g' && Number(number) >= 100) continue;
      const value = `${number} ${unit}`;
      const after = AFTER.exec(seg.slice(end));
      if (after) {
        if (after[3]) continue; // "300mg EPA/DHA": a combined figure
        const basis = after[4] ? after[4].toLowerCase().replace(/\s+/g, '') : null;
        const label = `${after[1] ? 'Elemental ' : ''}${tidy(after[2]!)}${basis ? ` (per ${basis})` : ''}`;
        out.push({ label: cap(label), value, where: 'title', basis });
        continue;
      }
      const before = BEFORE.exec(seg.slice(0, start));
      if (before)
        out.push({
          label: cap(`${before[1] ? 'Elemental ' : ''}${tidy(before[2]!)}`),
          value,
          where: 'title',
          basis: null, // "Magnesium Glycinate 1880mg": no basis stated
        });
    }
  }
  return out;
}

function descriptionListingAmounts(desc: string): ListingAmount[] {
  const termOnly = new RegExp(`(elemental\\s+)?(${TERM})(?![a-z0-9])`, 'i');
  return descriptionAmounts(desc).flatMap((a) => {
    const [, core = a.label, per] = /^(.*?)(\s*\(per [a-z]+\))?$/i.exec(a.label) ?? [];
    if (/omega/i.test(core)) return []; // "Omega-3 fish oil": oil total vs omega-3 content
    const t = termOnly.exec(core);
    if (!t) return [];
    const toG = toMg(a.value);
    if (toG !== null && toG >= 100_000) return []; // ≥ 100 g is a pack, not a dose
    // descriptionAmounts only matches "… per <unit>", so the basis is stated.
    const basis = per ? per.replace(/^\s*\(per\s+|\)$/gi, '').toLowerCase() : null;
    return [
      {
        label: cap(`${t[1] ? 'Elemental ' : ''}${tidy(t[2]!)}${per ?? ''}`),
        value: a.value,
        where: 'description' as const,
        basis,
      },
    ];
  });
}

/** Ingredient amounts a listing states, conservatively; duplicates collapsed. */
export function listingAmounts(title: string, desc: string): ListingAmount[] {
  const all = [...descriptionListingAmounts(desc), ...titleListingAmounts(title)];
  const seen = new Map<string, ListingAmount>();
  for (const a of all) {
    const key = `${a.label.replace(/\s*\(per [a-z]+\)$/i, '').toLowerCase()}|${toMg(a.value) ?? a.value.toLowerCase()}`;
    // Prefer the version that states its basis.
    const prev = seen.get(key);
    if (!prev || (!prev.basis && a.basis)) seen.set(key, a);
  }
  return [...seen.values()];
}

// ─── Pack size vs variant ────────────────────────────────────────────────

const WEIGHT = /(\d+(?:\.\d+)?)\s?(kilograms?|kgs?|grams?|gms?|g|pounds?|lbs?|oz|ml|l)(?![a-z])/i;
const COUNT =
  /(\d+)\s+(?:(?:veg|mini|oral|effervescent|single-serve)\s+)?(capsules?|caps|tablets?|tabs|softgels?|gummies|strips?|sachets?|chews?|pouches|packs|count)(?![a-z])/i;
const SERVINGS = /(\d+)\s+servings?(?![a-z])/i;

/** Pack-size text in a string (weight / count / servings), or null. */
function sizeIn(s: string, minGrams: number): string | null {
  const parts: string[] = [];
  const w = WEIGHT.exec(s);
  if (w) {
    const n = Number(w[1]);
    const u = w[2]!.toLowerCase();
    const grams = /^(g|gms?|grams?)$/.test(u);
    if (!(grams && n < minGrams)) parts.push(tidy(w[0]));
  }
  const c = COUNT.exec(s);
  if (c) parts.push(tidy(c[0]));
  const sv = SERVINGS.exec(s);
  if (sv) parts.push(tidy(sv[0]));
  return parts.length ? [...new Set(parts)].join(', ') : null;
}

export const isDefaultVariant = (title: string | null | undefined) =>
  !title || /^default( title)?$/i.test(title.trim());

/** Pack size stated by a variant title ("122gm (33 Servings) / Kiwi Kick"); never a flavour. */
export const variantPackSize = (variantTitle: string) => sizeIn(variantTitle, 1);

/** Pack size stated in the product title; small gram figures are doses, not packs. */
export const titlePackSize = (title: string) => sizeIn(title, 50);

// ─── Not a supplement ────────────────────────────────────────────────────

// Only words that are unambiguous as a PRODUCT, never as a flavour: "Cookies
// and Cream", "Choco Chips" or "Peanut Butter" whey are supplements.
const NON_SUPPLEMENT =
  /\b(rice cakes?|oats|muesli|granola|cornflakes|shaker|sipper|gym bag|t-?shirt|lifting belt|gloves)\b/i;

/** A reason when the listing is obviously food or an accessory; otherwise null. */
export function nonSupplementReason(title: string, productType = ''): string | null {
  const m = NON_SUPPLEMENT.exec(`${title} ${productType}`);
  return m ? `Not a supplement (food or accessory: "${m[1]}")` : null;
}

// ─── Duplicate-looking listings ──────────────────────────────────────────

/** Brand + product name before the first separator: a neutral grouping key. */
export function listingBaseKey(brand: string | null, title: string): string {
  const base = title.split(/\s*\|\s*|\s+[–—-]\s+|,\s+/)[0] ?? title;
  return `${(brand ?? '').toLowerCase()}|${base.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}
