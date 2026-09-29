import { toCandidateDocument, type CandidateDocument } from './candidate';
import type { ExtractedFactInput, ExtractedProduct } from './types';

/**
 * Research adapter for a Shopify store's public product feed (/products.json)
 * — used ONLY for sources whose access mode permits it (brand permission or a
 * brand-supplied/authorized feed). It is not a crawler: one request, no link
 * following, no images downloaded.
 *
 * Output is Layer A (what the brand's store says), all UNVERIFIED:
 *   - identity (title, vendor), per-variant price and MRP, stated amounts
 *   - goal SUGGESTIONS from the brand's own product type/tags (BRAND_MARKETING)
 *   - image references (URLs only; provenance NOT_REQUESTED → never displayed)
 * Nothing is inferred: no elemental amounts, no ratios, no efficacy.
 */

export const PERMITTED_ACCESS_MODES = [
  'BRAND_PERMISSION',
  'BRAND_SUPPLIED_FEED',
  'AUTHORIZED_FEED',
];

export interface SourceConfig {
  id: string;
  name: string;
  domain: string;
  accessMode: string;
  /** Written permission checked and on file (research/sources.json). */
  permissionVerified?: boolean;
  permissionRecord?: string | null;
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
        basis: 'BRAND_MARKETING';
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
    const facts: ExtractedFactInput[] = [
      { field: 'name', value: p.title, method: 'structured_data' },
      { field: 'brand', value: p.vendor, method: 'structured_data' },
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
    // The brand's own positioning: product type, tags, and title segments
    // after "|" (e.g. "CoQ10 200 mg | Softgels | Heart and Energy").
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
              basis: 'BRAND_MARKETING' as const,
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
        // Only the minimal text needed to verify the extracted facts.
        excerpt: desc.slice(0, 600),
        // References only: nothing downloaded, never displayed without permission.
        images: p.images.slice(0, 12).map((img, i) => ({
          _key: `i${i}`,
          _type: 'snapshotImage',
          sourceUrl: img.src,
          imageKind: 'UNKNOWN',
          depictsExactProduct: 'UNCONFIRMED',
          galleryPosition: i + 1,
          role: 'unknown',
        })),
        capturedBy: extractor,
        notes: 'Research import. Images are references only (permission not recorded).',
      },
      candidate: { ...toCandidateDocument(extracted), goalSuggestions },
    });
  }
  return { source, fetchedAt, skipped, products };
}
