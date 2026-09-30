import type { ExtractedFactInput } from '@/lib/ingestion/types';
import { normalizeGtin } from '@/lib/identity/gtin';
import { listingAmounts } from '@/lib/ingestion/listing-parse';
import { descriptionAmounts, titleAmounts } from '@/lib/ingestion/shopify-feed';

/**
 * Fact extraction from a permitted product page (docs/ingestion.md).
 *
 * Reads, in order: JSON-LD Product data, page meta tags, then visible facts
 * (serving lines, supplement-facts table rows, "X mg of Y per tablet").
 *
 * NEVER kept: descriptions, marketing prose, reviews, ratings, images or
 * image URLs (only the fact that a label image exists), scripts. Nothing is
 * computed: an elemental amount is recorded only when the page itself says
 * "elemental" next to the number. Everything is untrusted input: strings are
 * tag-stripped, control-character-free and length-capped.
 */

const MAX_TEXT = 200_000;
const MAX_JSONLD_BLOCKS = 20;
const MAX_JSONLD_BYTES = 200_000;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;
const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d{1,5});/g, (_, n) => String.fromCharCode(Number(n)));
/** Untrusted string → plain, single-line, bounded text (no tags, no controls). */
export const clean = (v: unknown, max = 200): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = decodeEntities(String(v))
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s ? s.slice(0, max) : null;
};

export interface ExtractedIngredient {
  label: string;
  value: string;
  /** True only when the page literally labels the figure "elemental". */
  elementalStated: boolean;
  /**
   * The basis exactly as the page states it ("serving", "scoop", "100 g"…):
   * from the facts table's own column header or a "… per X" statement. Null
   * when the page does not state one; never assumed to be "per serving".
   */
  basis: string | null;
  where: 'Page title' | 'Product name' | 'Facts table on page' | 'Page text';
}

export interface PageExtraction {
  name: string | null;
  brand: string | null;
  gtin: string | null;
  sku: string | null;
  price: { amount: number; currency: string } | null;
  serving: string | null;
  servingsPerContainer: string | null;
  ingredients: ExtractedIngredient[];
  vegStatement: string | null;
  /** A product/label image was present on the page; it was NOT collected. */
  imagesSeen: boolean;
  methods: Array<'structured_data' | 'parser'>;
}

// ─── JSON-LD ─────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
function* walk(node: unknown, depth = 0): Generator<Json> {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node.slice(0, 50)) yield* walk(n, depth + 1);
    return;
  }
  const obj = node as Json;
  yield obj;
  if (obj['@graph']) yield* walk(obj['@graph'], depth + 1);
}
const isProduct = (o: Json) => {
  const t = o['@type'];
  return t === 'Product' || (Array.isArray(t) && t.includes('Product'));
};

function jsonLdProducts(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let n = 0;
  for (const m of html.matchAll(re)) {
    if (++n > MAX_JSONLD_BLOCKS) break;
    const body = m[1]!.trim();
    if (!body || body.length > MAX_JSONLD_BYTES) continue;
    try {
      for (const o of walk(JSON.parse(body))) if (isProduct(o)) out.push(o);
    } catch {
      /* malformed JSON-LD is ignored, never evaluated */
    }
  }
  return out;
}

function offerPrice(offers: unknown): { amount: number; currency: string } | null {
  for (const o of walk(offers)) {
    const raw = o.price ?? o.lowPrice;
    const amount = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/,/g, ''));
    const currency = clean(o.priceCurrency, 3);
    if (
      Number.isFinite(amount) &&
      amount > 0 &&
      amount < 1_000_000 &&
      currency &&
      /^[A-Z]{3}$/.test(currency)
    )
      return { amount, currency };
  }
  return null;
}

// ─── Visible text ────────────────────────────────────────────────────────

export function visibleText(html: string): string {
  return decodeEntities(
    html
      .slice(0, MAX_TEXT * 5)
      .replace(/<(script|style|noscript|svg|template|iframe|object)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|td|th|section)>/gi, '\n')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(CONTROL, ' ')
    .replace(/[ \t]+/g, ' ')
    .slice(0, MAX_TEXT);
}

/** A link to a product page other than the one analysed (same site). */
function isOtherProduct(href: string, page: URL | null): boolean {
  try {
    const u = page ? new URL(href.trim(), page) : new URL(href.trim());
    if (page && u.hostname.replace(/^www\./, '') !== page.hostname.replace(/^www\./, ''))
      return false;
    const p = u.pathname.replace(/\/+$/, '');
    return /\/products\/[^/]+$/.test(p) && (!page || p !== page.pathname.replace(/\/+$/, ''));
  } catch {
    return false;
  }
}

/**
 * Only content about THIS product: drops site chrome (header, footer, nav,
 * aside, dialogs) and links to any other product page together with their
 * text (related-product cards, menus), so another product's title or amounts
 * are never read as this page's. Structured data and meta tags are read
 * separately and are unaffected.
 */
export function thisProductOnly(html: string, pageUrl: URL | null): string {
  return html
    .replace(/<(header|footer|nav|aside|dialog)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(
      /<a\b[^>]*\bhref\s*=\s*["']([^"']{1,2000})["'][^>]*>[\s\S]*?<\/a>/gi,
      (a, href: string) => (isOtherProduct(href, pageUrl) ? ' ' : a),
    );
}

const AMOUNT_CELL = /^(\d+(?:[.,]\d+)?)\s?(mg|mcg|µg|g|iu|IU|ml|kcal|kJ)$/;

const BASIS =
  /\bper\s+(serving|scoop|capsule|tablet|softgel|sachet|gummy|strip|chew|100\s?(?:g|gm|ml)|\d+\s?(?:g|ml))\b/i;
const basisOf = (s: string) => BASIS.exec(s)?.[1]?.toLowerCase().replace(/\s+/g, ' ') ?? null;

/**
 * Supplement-facts style table rows: a name cell + an amount cell. The basis
 * comes from that table's header (e.g. "Amount per serving", or the column
 * headed "Per 100 g"); rows of a table with no stated basis get none.
 */
export function tableRows(html: string): ExtractedIngredient[] {
  const rows: ExtractedIngredient[] = [];
  const source = html.slice(0, MAX_TEXT * 5);
  const tables = [...source.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((t) => t[1]!);
  // Rows outside a <table> (malformed markup) are read without a basis.
  for (const table of tables.length ? tables : [source]) {
    let columnBasis: Array<string | null> = [];
    let tableBasis: string | null = null;
    for (const tr of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...tr[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
        (c) => clean(c[1], 120) ?? '',
      );
      const amountIdx = cells.findIndex((c) => AMOUNT_CELL.test(c));
      if (amountIdx === -1) {
        const bases = cells.map(basisOf);
        if (bases.some(Boolean)) {
          columnBasis = bases;
          tableBasis = bases.find(Boolean) ?? null;
        }
        continue;
      }
      const nameIdx = cells.findIndex(
        (c, i) => i !== amountIdx && /[a-z]/i.test(c) && !AMOUNT_CELL.test(c),
      );
      if (nameIdx === -1) continue;
      const name = cells[nameIdx]!;
      if (/serving|per\s+100|amount per|%\s*dv|daily value/i.test(name)) continue;
      rows.push({
        label: name,
        value: cells[amountIdx]!.replace(/iu$/i, 'IU'),
        elementalStated: /\belemental\b/i.test(name),
        basis:
          columnBasis[amountIdx] ?? (columnBasis.filter(Boolean).length > 1 ? null : tableBasis),
        where: 'Facts table on page',
      });
      if (rows.length >= 40) return rows;
    }
  }
  return rows;
}

/**
 * `sourceKind` picks the product-name parser: a marketplace/retailer title is
 * read with the conservative listing parser (pack weights and ranges are
 * never doses; a basis only when stated). Brand pages keep titleAmounts.
 */
export function extractProductPage(
  html: string,
  opts: { sourceKind?: 'BRAND_WEBSITE' | 'MARKETPLACE' | 'OTHER'; pageUrl?: URL } = {},
): PageExtraction {
  const own = thisProductOnly(html, opts.pageUrl ?? null);
  const methods = new Set<'structured_data' | 'parser'>();
  const products = jsonLdProducts(html);
  const p = products[0] ?? null;
  const meta = (prop: string) =>
    clean(
      new RegExp(
        `<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${prop}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
        'i',
      ).exec(html)?.[1] ??
        new RegExp(
          `<meta\\b[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${prop}["']`,
          'i',
        ).exec(html)?.[1],
    );

  let name = p ? clean(p.name) : null;
  if (name) methods.add('structured_data');
  name ??= meta('og:title') ?? clean(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
  const brandRaw = p?.brand;
  const brand = clean(
    typeof brandRaw === 'object' && brandRaw ? (brandRaw as Json).name : brandRaw,
    120,
  );
  const gtinRaw = p ? (p.gtin13 ?? p.gtin ?? p.gtin12 ?? p.gtin14 ?? p.gtin8) : null;
  const gtinCheck = normalizeGtin(clean(gtinRaw, 20));
  let price = p ? offerPrice(p.offers) : null;
  if (!price) {
    const amount = Number((meta('product:price:amount') ?? '').replace(/,/g, ''));
    const currency = meta('product:price:currency');
    if (Number.isFinite(amount) && amount > 0 && currency && /^[A-Z]{3}$/.test(currency))
      price = { amount, currency };
  }
  const imagesSeen = Boolean(p?.image || meta('og:image'));

  const text = visibleText(own);
  const serving = clean(
    /serving size\s*[:\-–]?\s*(\d+(?:\.\d+)?\s*(?:capsules?|tablets?|softgels?|scoops?|sachets?|gumm(?:y|ies)|strips?|g|ml|caplets?)(?:\s*\([^)]{1,20}\))?)/i.exec(
      text,
    )?.[1],
    60,
  );
  const servings = clean(
    /servings?\s*per\s*(?:container|pack|bottle|box|jar)\s*[:\-–]?\s*(\d{1,4})/i.exec(text)?.[1],
    6,
  );
  const veg = clean(
    /\b(suitable for (?:vegetarians|vegans)|100% (?:vegetarian|vegan)|(?:vegetarian|veg) capsules?)\b/i.exec(
      text,
    )?.[1],
    40,
  );

  const ingredients: ExtractedIngredient[] = [
    ...(name
      ? opts.sourceKind === 'MARKETPLACE'
        ? listingAmounts(name, '').map((a) => ({
            label: a.label,
            value: a.value,
            elementalStated: /^elemental\b/i.test(a.label),
            basis: a.basis,
            where: 'Product name' as const,
          }))
        : titleAmounts(name).map((a) => ({
            ...a,
            elementalStated: false,
            basis: null, // a product name never states a basis
            where: 'Product name' as const,
          }))
      : []),
    ...tableRows(own),
    ...descriptionAmounts(text).map((a) => ({
      ...a,
      elementalStated: /elemental/i.test(a.label),
      basis: /\(per ([a-z]+)\)$/i.exec(a.label)?.[1]?.toLowerCase() ?? null,
      where: 'Page text' as const,
    })),
  ];
  if (serving || servings || ingredients.length || veg) methods.add('parser');

  return {
    name,
    brand,
    gtin: gtinCheck.status === 'valid' ? gtinCheck.digits : null,
    sku: p ? clean(p.sku, 60) : null,
    price,
    serving,
    servingsPerContainer: servings,
    ingredients: dedupe(ingredients),
    vegStatement: veg,
    imagesSeen,
    methods: [...methods],
  };
}

function dedupe(xs: ExtractedIngredient[]): ExtractedIngredient[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = `${x.label.toLowerCase().replace(/\s*\(per [a-z]+\)$/, '')}|${x.value.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Candidate facts (Layer A). The builder forces every one to "unverified". */
/**
 * Minerals are the ingredients labels declare as compound + elemental. Used
 * only to decide whether a missing elemental figure is worth mentioning;
 * nothing is ever computed from it.
 */
export const MINERALS =
  /\b(magnesium|calcium|zinc|iron|potassium|sodium|selenium|chromium|copper|manganese|iodine|molybdenum|phosphorus)\b/i;

export function toFacts(x: PageExtraction): ExtractedFactInput[] {
  const sd = 'structured_data' as const;
  return [
    ...(x.name ? [{ field: 'name' as const, value: x.name, method: sd }] : []),
    ...(x.brand ? [{ field: 'brand' as const, value: x.brand, method: sd }] : []),
    ...(x.gtin ? [{ field: 'gtin' as const, value: x.gtin, method: sd }] : []),
    ...(x.price
      ? [
          {
            field: 'price' as const,
            value: `${x.price.currency === 'INR' ? '₹' : `${x.price.currency} `}${x.price.amount}`,
            method: sd,
          },
        ]
      : []),
    ...(x.serving
      ? [{ field: 'serving_size' as const, value: x.serving, method: 'parser' as const }]
      : []),
    ...(x.servingsPerContainer
      ? [
          {
            field: 'servings_per_container' as const,
            value: x.servingsPerContainer,
            method: 'parser' as const,
          },
        ]
      : []),
    ...x.ingredients.map((i) => ({
      field: 'ingredient_amount' as const,
      label: i.label,
      value: i.value,
      method: 'parser' as const,
      confidence: i.where === 'Facts table on page' ? 0.7 : 0.5,
    })),
    ...(x.vegStatement
      ? [{ field: 'veg_marker' as const, value: x.vegStatement, method: 'parser' as const }]
      : []),
  ];
}
