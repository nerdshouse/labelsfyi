import type { ImageData } from '@/lib/content/types';

/**
 * Every public product image needs an identifiable basis (docs/assets.md):
 *
 *   EDITORIAL_LABEL_PHOTO  a photo labels.fyi took of a pack it holds → shown
 *   AUTHORIZED             shown only with a linked AUTHORIZED, verified permission
 *                          whose scope includes IMAGES, for
 *                          this product (or brand-wide) that has not expired
 *   USER_SUBMITTED         submitted photos stay private (Sprint 4 rule) → not shown
 *   UNKNOWN / NOT_REQUESTED / RESTRICTED / REVOKED → not shown
 *
 * Anything not shown renders the neutral typographic product tile. Scraped
 * third-party images are never displayed just because they exist.
 */
const IMAGE_ASSETS = new Set(['PRODUCT_IMAGE', 'PACK_IMAGE', 'LABEL_IMAGE']);

export function isDisplayableProductImage(
  img: ImageData | null | undefined,
  ctx: { productId: string; brandId: string | null; now?: number },
): boolean {
  if (!img?.url) return false;
  switch (img.provenance) {
    case 'EDITORIAL_LABEL_PHOTO':
      return true;
    case 'AUTHORIZED': {
      const p = img.permission;
      if (!p || p.status !== 'AUTHORIZED' || !IMAGE_ASSETS.has(p.assetType)) return false;
      // The written permission must cover images and have been checked.
      if (!(p.scope ?? []).includes('IMAGES') || !p.verifiedAt) return false;
      const covers = p.product ? p.product === ctx.productId : p.brand === ctx.brandId;
      const expired = p.expiresAt ? Date.parse(p.expiresAt) <= (ctx.now ?? Date.now()) : false;
      return covers && !expired;
    }
    default:
      return false;
  }
}

/** Why an image is (not) shown, for internal tooling and tests. */
export function imageBasisLabel(img: ImageData | null | undefined): string {
  if (!img) return 'No image';
  switch (img.provenance) {
    case 'EDITORIAL_LABEL_PHOTO':
      return 'Label photo by labels.fyi';
    case 'AUTHORIZED':
      return 'Image authorized by the brand';
    case 'USER_SUBMITTED':
      return 'Submitted photo (private)';
    default:
      return 'Not authorized for display';
  }
}
