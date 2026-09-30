import { toCandidateDocument, type CandidateDocument } from './candidate';
import type { ExtractedFactInput, ExtractedProduct } from './types';

/**
 * Research adapter for a Shopify store's public product feed (/products.json)
 * — used ONLY for sources whose access mode permits it (brand permission or a
 * brand-supplied/authorized feed) AND whose written permission is verified.
 * It is not a crawler: one request, no link following, no images downloaded.
 *
 * Output is Layer A (what the store says), all UNVERIFIED:
 *   - identity (title, vendor), per-variant price and MRP, stated amounts
 *   - goal SUGGESTIONS from the store's product type/tags: BRAND_MARKETING on
 *     a brand's own store, RETAILER_LISTING on a retailer/marketplace
 *   - brand's own store only: image references (URLs; never displayed without
 *     permission) and a short description excerpt for verification
 * Retailer/marketplace sources (e.g. a multi-brand store): the retailer is the
 * source of the listing, never the brand. The brand is the store's `vendor`
 * exactly as reported, and omitted when the vendor is the retailer itself. No
 * image references and no description text are kept: a retailer cannot
 * license the manufacturers' imagery, label artwork or copy.
 * Nothing is inferred: no elemental amounts, no ratios, no efficacy.
 */

export const PERMITTED_ACCESS_MODES = [
  'BRAND_PERMISSION',
  'BRAND_SUPPLIED_FEED',
  'AUTHORIZED_FEED',
];

export type SourceKind = 'BRAND_WEBSITE' | 'MARKETPLACE' | 'OTHER';

export interface SourceConfig {
  id: string;
  name: string;
  domain: string;
  accessMode: string;
  /** Who runs the store: a brand's own site, or a retailer/marketplace. Required. */
  sourceKind: SourceKind | string;
  /** Written permission checked and on file (research/sources.json). */
  permissionVerified?: boolean;
  permissionRecord?: string | null;
}

/** dataSource.sourceType for a registered source. Never defaults to "brand". */
export function dataSourceTypeFor(s: Pick<SourceConfig, 'name' | 'sourceKind'>): string {
  switch (s.sourceKind) {
    case 'BRAND_WEBSITE':
      return 'brand';
    case 'MARKETPLACE':
      return 'marketplace';
    case 'OTHER':
      return 'other';
    default:
      throw new Error(`${s.name}: unknown sourceKind "${String(s.sourceKind)}".`);
  }
}

/** Goal-suggestion basis: only a brand's own store is "brand marketing". */
export function goalBasisFor(
  s: Pick<SourceConfig, 'name' | 'sourceKind'>,
): 'BRAND_MARKETING' | 'RETAILER_LISTING' {
  return dataSourceTypeFor(s) === 'brand' ? 'BRAND_MARKETING' : 'RETAILER_LISTING';
}

/** The product's brand as the store reports it; never the retailer itself. */
export function brandFromVendor(
  vendor: string | null | undefined,
  s: Pick<SourceConfig, 'name' | 'domain' | 'sourceKind'>,
): string | null {
  const v = (vendor ?? '').trim();
  if (!v) return null;
  if (dataSourceTypeFor(s) === 'brand') return v;
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const retailer = [s.name, s.domain, s.domain.replace(/\.[a-z.]+$/, '')].map(norm);
  return retailer.includes(norm(v)) ? null : v;
}

/** Refuses any source whose recorded terms do not permit collection. */
export function assertCollectionPermitted(s: SourceConfig): void {
  if (!PERMITTED_ACCESS_MODES.includes(s.accessMode))
    throw new Error(
      `${s.name}: access mode ${s.accessMode} does not permit automated collection. Use manual research, a brand-supplied feed, or user-submitted labels.`,
    );
  if (s.permissionVerified !== true || !s.permissionRecord)
    throw new Error(
      `${s.name}: permission is not verified. File the written permission as an AUTHORIZED assetPermission record, then set permissionVerified and permissionRecord in research/sources.json.`,
    );
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  tags: string[] | string;
  variants: Array<{
    id: number;
    title: string;
    price: string;
    compare_at_price: string | null;
    sku: string | null;
    barcode?: string | null;
  }>;
  images: Array<{ src: string }>;
}

/** Brand marketing signals → goal slugs. Sensitive categories are deliberately absent. */
const GOAL_SIGNALS: Array<[RegExp, string]> = [
  [/\bsleep\b/i, 'sleep'],
  [/\bstress\b/i, 'stress'],
  [/\bimmun/i, 'immunity'],
  [/\bhydration\b/i, 'hydration'],
  [/\benergy\b/i, 'energy'],
  [/\bgut\b/i, 'gut-health'],
  [/\bjoints?\b/i, 'joint-health'],
  [/\b(skin|hair)\b/i, 'hair-skin'],
  [/\bheart\b/i, 'heart-health'],
];

const SKIP = /\b(sample|bundle|routine|combo pack|gift)\b/i;
const text = (html: string | null) =>
  (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const tagsOf = (p: ShopifyProduct) =>
  (Array.isArray(p.tags) ? p.tags : p.tags.split(',')).map((t) => t.trim()).filter(Boolean);

/** Amounts exactly as stated in the title, e.g. "Melatonin 3 mg Chewables" → Melatonin: 3 mg. */
export function titleAmounts(title: string): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const re = /([A-Za-z][A-Za-z0-9\- ]*?)\s+(\d+(?:\.\d+)?)\s?(mg|mcg|µg|g|IU)\b/g;
  for (const m of title.matchAll(re)) {
    const label = m[1]!.replace(/^(and|with|\+)\s+/i, '').trim();
    out.push({ label, value: `${m[2]} ${m[3]}` });
  }
  return out;
}

/** "3mg of melatonin per tablet" → melatonin: 3 mg (per tablet). */
export function descriptionAmounts(desc: string): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const re =
    /(\d+(?:\.\d+)?)\s?(mg|mcg|µg|g|IU) of ([a-z][a-z0-9\- ]{1,40}?) per (serving|tablet|capsule|softgel|sachet|scoop|gummy)/gi;
  for (const m of desc.matchAll(re))
    out.push({ label: `${m[3]} (per ${m[4]!.toLowerCase()})`, value: `${m[1]} ${m[2]}` });
  return out;
}

export interface FeedExtraction {
  source: SourceConfig;
  fetchedAt: string;
  skipped: Array<{ handle: string; reason: string }>;
  products: Array<{
    snapshot: Record<string, unknown>;
    candidate: CandidateDocument & {
      goalSuggestions: Array<{
        _key: string;
        goalSlug: string;
        basis: 'BRAND_MARKETING' | 'RETAILER_LISTING';
        statement: string;
        sourceLocator: string;
      }>;
    };
  }>;
}

export function extractShopifyFeed(
  feed: { products: ShopifyProduct[] },
  source: SourceConfig,
  fetchedAt: string,
  extractor = 'shopify-feed@1',
): FeedExtraction {
  assertCollectionPermitted(source);
  const isBrandStore = dataSourceTypeFor(source) === 'brand';
  const basis = goalBasisFor(source);
  const skipped: FeedExtraction['skipped'] = [];
  const products: FeedExtraction['products'] = [];
  const base = `https://${source.domain}`;
  for (const p of feed.products) {
    if (SKIP.test(p.title) || /sample/i.test(p.product_type)) {
      skipped.push({ handle: p.handle, reason: 'Sample, bundle or combo (not a single product)' });
      continue;
    }
    const url = `${base}/products/${p.handle}`;
    const snapshotId = `snapshot.${source.id}.${p.handle}`;
    const desc = text(p.body_html);
    const tags = tagsOf(p);
    const brand = brandFromVendor(p.vendor, source);
    const facts: ExtractedFactInput[] = [
      { field: 'name', value: p.title, method: 'structured_data' },
      // Missing stays missing: no brand fact when the vendor is absent or is
      // the retailer itself.
      ...(brand
        ? [{ field: 'brand' as const, value: brand, method: 'structured_data' as const }]
        : []),
      ...p.variants.flatMap((v): ExtractedFactInput[] => {
        const label = v.title === 'Default Title' ? null : v.title;
        const withLabel = label ? { label } : {};
        const sd = 'structured_data' as const;
        return [
          ...(label ? [{ field: 'pack_size' as const, value: label, method: sd }] : []),
          { field: 'price' as const, ...withLabel, value: `₹${v.price}`, method: sd },
          ...(v.compare_at_price
            ? [{ field: 'mrp' as const, ...withLabel, value: `₹${v.compare_at_price}`, method: sd }]
            : []),
          ...(v.barcode
            ? [{ field: 'gtin' as const, ...withLabel, value: v.barcode, method: sd }]
            : []),
        ];
      }),
      ...titleAmounts(p.title).map((a) => ({
        field: 'ingredient_amount' as const,
        label: a.label,
        value: a.value,
        method: 'parser' as const,
        confidence: 0.5,
      })),
      ...descriptionAmounts(desc).map((a) => ({
        field: 'ingredient_amount' as const,
        label: a.label,
        value: a.value,
        method: 'parser' as const,
        confidence: 0.6,
      })),
    ];
    const extracted: ExtractedProduct = {
      provenance: {
        dataSourceId: `dataSource.${source.id}`,
        snapshotId,
        sourceUrl: url,
        fetchedAt,
      },
      title: p.title,
      externalId: String(p.id),
      extractedAt: fetchedAt,
      extractor,
      facts,
    } as ExtractedProduct;
    // The store's positioning: product type, tags, and title segments after
    // "|" (e.g. "CoQ10 200 mg | Softgels | Heart and Energy"). On a retailer
    // this is the retailer's listing, not the brand's marketing.
    const signals = [
      ...(p.product_type ? [{ value: p.product_type, where: 'Store product type' }] : []),
      ...tags.map((t) => ({ value: t, where: 'Store product tag' })),
      ...p.title
        .split('|')
        .slice(1)
        .map((t) => ({ value: t.trim(), where: 'Product title' })),
    ];
    const goalSuggestions = GOAL_SIGNALS.flatMap(([re, goalSlug]) => {
      const hit = signals.find((s) => re.test(s.value));
      return hit
        ? [
            {
              _key: goalSlug,
              goalSlug,
              basis,
              statement: hit.value.slice(0, 160),
              sourceLocator: hit.where,
            },
          ]
        : [];
    });
    products.push({
      snapshot: {
        _id: snapshotId,
        _type: 'sourceSnapshot',
        dataSource: { _type: 'reference', _ref: `dataSource.${source.id}` },
        url,
        fetchedAt,
        httpStatus: 200,
        title: p.title,
        // Brand's own store: only the minimal text needed to verify the
        // extracted facts. Retailer: none (the copy is not the retailer's).
        excerpt: isBrandStore ? desc.slice(0, 600) : null,
        // Brand's own store: references only, nothing downloaded, never
        // displayed without permission. Retailer: not even referenced.
        images: isBrandStore
          ? p.images.slice(0, 12).map((img, i) => ({
              _key: `i${i}`,
              _type: 'snapshotImage',
              sourceUrl: img.src,
              imageKind: 'UNKNOWN',
              depictsExactProduct: 'UNCONFIRMED',
              galleryPosition: i + 1,
              role: 'unknown',
            }))
          : [],
        capturedBy: extractor,
        notes: isBrandStore
          ? 'Research import. Images are references only (permission not recorded).'
          : `Retailer listing import (${source.name} is the seller, not the brand). ${p.images.length} product image(s) on the listing were not recorded: retailer permission does not cover brand imagery or label artwork.`,
      },
      candidate: { ...toCandidateDocument(extracted), goalSuggestions },
    });
  }
  return { source, fetchedAt, skipped, products };
}
