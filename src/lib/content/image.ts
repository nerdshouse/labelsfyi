import type { ImageData } from './types';

/** Responsive srcset for Sanity CDN images; other URLs pass through untouched. */
export function imageSrcset(
  img: ImageData,
  widths = [320, 480, 720, 960, 1280],
): string | undefined {
  if (!img.url.includes('cdn.sanity.io')) return undefined;
  return widths
    .filter((w) => !img.width || w <= img.width)
    .map((w) => `${img.url}?w=${w}&auto=format&fit=max ${w}w`)
    .join(', ');
}

export function imageSrc(img: ImageData, width = 720): string {
  return img.url.includes('cdn.sanity.io') ? `${img.url}?w=${width}&auto=format&fit=max` : img.url;
}
