import type { ExtractedFactInput } from '@/lib/ingestion/types';
import { normalizeGtin } from '@/lib/identity/gtin';
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

const AMOUNT_CELL = /^(\d+(?:[.,]\d+)?)\s?(mg|mcg|µg|g|iu|IU|ml)$/;

/** Supplement-facts style table rows: a name cell + an amount cell. */
export function tableRows(html: string): ExtractedIngredient[] {
  const rows: ExtractedIngredient[] = [];
  for (const tr of html.slice(0, MAX_TEXT * 5).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (c) => clean(c[1], 120) ?? '',
    );
    const amountIdx = cells.findIndex((c) => AMOUNT_CELL.test(c));
    const nameIdx = cells.findIndex(
      (c, i) => i !== amountIdx && /[a-z]/i.test(c) && !AMOUNT_CELL.test(c),
    );
    if (amountIdx === -1 || nameIdx === -1) continue;
    const name = cells[nameIdx]!;
    if (/serving|per\s+100|amount per|%\s*dv|daily value/i.test(name)) continue;
    rows.push({
      label: name,
      value: cells[amountIdx]!.replace(/iu$/i, 'IU'),
      elementalStated: /\belemental\b/i.test(name),
      where: 'Facts table on page',
    });
    if (rows.length >= 40) break;
  }
  return rows;
}

export function extractProductPage(html: string): PageExtraction {
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

  const text = visibleText(html);
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
      ? titleAmounts(name).map((a) => ({
          ...a,
          elementalStated: false,
          where: 'Product name' as const,
        }))
      : []),
    ...tableRows(html),
    ...descriptionAmounts(text).map((a) => ({
      ...a,
      elementalStated: /elemental/i.test(a.label),
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
