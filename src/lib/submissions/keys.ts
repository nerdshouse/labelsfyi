import type { AllowedImageType } from './types';
import { extensionFor } from './validate';

/**
 * Opaque identifiers and object keys. Keys are generated server-side from
 * random values only; nothing user-supplied (filenames, names) ever reaches a
 * key, and every key read back is re-validated against the exact pattern.
 */

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const random = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));

export const newSubmissionId = () => `sub-${random(10)}`;
export const SUBMISSION_ID = /^sub-[0-9a-f]{20}$/;
export const isSubmissionId = (id: string) => SUBMISSION_ID.test(id);

export const OBJECT_KEY =
  /^submissions\/\d{4}\/\d{2}\/sub-[0-9a-f]{20}\/\d{2}-[0-9a-f]{16}\.(jpg|png|webp)$/;

export function objectKey(
  submissionId: string,
  index: number,
  type: AllowedImageType,
  now = new Date(),
): string {
  if (!isSubmissionId(submissionId)) throw new Error('Invalid submission id');
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const key = `submissions/${yyyy}/${mm}/${submissionId}/${String(index).padStart(2, '0')}-${random(8)}.${extensionFor(type)}`;
  if (!OBJECT_KEY.test(key)) throw new Error('Generated an invalid key');
  return key;
}

/** Guard for any key that comes back from a URL or a stored document. */
export const isValidObjectKey = (key: string) => OBJECT_KEY.test(key) && !key.includes('..');

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
  );
}
