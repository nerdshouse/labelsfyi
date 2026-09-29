import type { AllowedImageType, CleanSubmissionFields, ImageRole } from './types';

/**
 * Server-side validation for untrusted submissions. The client-side checks
 * on /submit are a convenience; these are the ones that count.
 */

export const LIMITS = {
  maxImageBytes: 10 * 1024 * 1024,
  maxImages: 6,
  maxTotalBytes: 40 * 1024 * 1024,
  maxRequestBytes: 42 * 1024 * 1024,
  text: {
    brand: 120,
    productName: 160,
    variant: 80,
    productUrl: 500,
    submitterName: 120,
    submitterContact: 200,
    updateOfProduct: 200,
  },
} as const;

const EXT: Record<AllowedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export const extensionFor = (t: AllowedImageType) => EXT[t];
const ALLOWED_EXTENSIONS: Record<string, AllowedImageType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Identify the real image type from its first bytes (magic numbers). */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

// Control characters, zero-width and bidi-override characters (U+200B–U+200F,
// U+202A–U+202E): invisible in the review UI, so they could hide text.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

/** Remove control characters and angle brackets, collapse whitespace, trim, cap length. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const s = value
    .normalize('NFC')
    .replace(UNSAFE_CHARS, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s ? s.slice(0, max) : null;
}

export interface IncomingImage {
  role: ImageRole;
  /** Client-declared filename and type are recorded nowhere and trusted for nothing but a consistency check. */
  declaredName: string;
  declaredType: string;
  bytes: Uint8Array;
}

export interface ValidImage {
  role: ImageRole;
  contentType: AllowedImageType;
  bytes: Uint8Array;
}

export function validateImages(
  images: IncomingImage[],
): { ok: true; images: ValidImage[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const front = images.filter((i) => i.role === 'front');
  const facts = images.filter((i) => i.role === 'facts');
  if (front.length !== 1)
    errors.push(
      front.length
        ? 'Only one front-of-pack photo is allowed.'
        : 'A front-of-pack photo is required.',
    );
  if (facts.length !== 1)
    errors.push(
      facts.length
        ? 'Only one facts-panel photo is allowed.'
        : 'A facts/composition panel photo is required.',
    );
  if (images.length > LIMITS.maxImages)
    errors.push(`At most ${LIMITS.maxImages} photos per submission.`);
  const total = images.reduce((n, i) => n + i.bytes.byteLength, 0);
  if (total > LIMITS.maxTotalBytes) errors.push('Photos are too large in total (40 MB maximum).');

  const valid: ValidImage[] = [];
  images.forEach((img, n) => {
    const label =
      img.role === 'additional'
        ? `Additional photo ${n + 1}`
        : img.role === 'front'
          ? 'Front-of-pack photo'
          : 'Facts panel photo';
    if (img.bytes.byteLength === 0) return void errors.push(`${label} is empty.`);
    if (img.bytes.byteLength > LIMITS.maxImageBytes)
      return void errors.push(`${label} is larger than 10 MB.`);
    const sniffed = sniffImageType(img.bytes);
    if (!sniffed) return void errors.push(`${label} must be a JPEG, PNG or WebP image.`);
    // The declared type and extension must not contradict the real content.
    const ext = img.declaredName.includes('.')
      ? img.declaredName.split('.').pop()!.toLowerCase()
      : '';
    if (img.declaredType && img.declaredType !== sniffed)
      return void errors.push(`${label}: file type does not match its content.`);
    if (ext && ALLOWED_EXTENSIONS[ext] !== sniffed)
      return void errors.push(`${label}: file extension does not match its content.`);
    valid.push({ role: img.role, contentType: sniffed, bytes: img.bytes });
  });
  return errors.length ? { ok: false, errors } : { ok: true, images: valid };
}

export function validateFields(
  input: Record<string, unknown>,
): { ok: true; fields: CleanSubmissionFields } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  // Honeypot: real users never see or fill this field.
  if (typeof input.website === 'string' && input.website.trim() !== '')
    errors.push('Submission rejected.');
  const brand = cleanText(input.brand, LIMITS.text.brand);
  const productName = cleanText(input.productName, LIMITS.text.productName);
  if (!brand) errors.push('Brand is required.');
  if (!productName) errors.push('Product name is required.');
  let productUrl = cleanText(input.productUrl, LIMITS.text.productUrl);
  if (productUrl) {
    try {
      const u = new URL(productUrl);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
      if (u.username || u.password) throw new Error('credentials');
      productUrl = u.toString();
    } catch {
      errors.push('Product URL must be a valid http(s) link.');
      productUrl = null;
    }
  }
  const updateOfProduct = cleanText(input.updateOfProduct, LIMITS.text.updateOfProduct);
  if (updateOfProduct && !/^[a-z0-9-]+$/.test(updateOfProduct))
    errors.push('Invalid product reference.');
  if (input.rights !== 'on' && input.rights !== true)
    errors.push('Confirm you can share these photos.');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    fields: {
      brand: brand!,
      productName: productName!,
      variant: cleanText(input.variant, LIMITS.text.variant),
      productUrl,
      submitterName: cleanText(input.submitterName, LIMITS.text.submitterName),
      submitterContact: cleanText(input.submitterContact, LIMITS.text.submitterContact),
      updateOfProduct,
    },
  };
}
