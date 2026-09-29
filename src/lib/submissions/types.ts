/**
 * Label submissions: a person uploads photos of a supplement label. Nothing
 * here is public. A submission becomes public product data only after human
 * review, fact verification and the existing editorial workflow.
 */

export const SUBMISSION_STATUSES = [
  'RECEIVED',
  'NEEDS_REVIEW',
  'IN_REVIEW',
  'VERIFIED',
  'PUBLISHED',
  'REJECTED',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export type ImageRole = 'front' | 'facts' | 'additional';
export type AllowedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface SubmissionImage {
  _key: string;
  _type: 'submissionImage';
  /** Opaque, server-generated R2 key. Never derived from the client filename. */
  storageKey: string;
  contentType: AllowedImageType;
  bytes: number;
  sha256: string;
  role: ImageRole;
  /** Set by a reviewer. Unconfirmed until a person checks what the photo shows. */
  imageKind: 'PACK_PHOTO' | 'PRINT_ARTWORK' | 'MARKETING_GRAPHIC' | 'RETYPESET_TABLE' | 'UNKNOWN';
  depictsExactProduct: 'CONFIRMED' | 'UNCONFIRMED' | 'NOT_THIS_PRODUCT';
  depictsConfirmedBy: string | null;
  depictsConfirmedAt: string | null;
}

export interface LabelSubmission {
  _id: string;
  _type: 'labelSubmission';
  status: SubmissionStatus;
  submittedAt: string;
  brand: string;
  productName: string;
  variant: string | null;
  productUrl: string | null;
  /** Private. Never copied into products, observations or any public read model. */
  submitterName: string | null;
  submitterContact: string | null;
  images: SubmissionImage[];
  ingestionCandidate: { _type: 'reference'; _ref: string } | null;
  product: { _type: 'reference'; _ref: string } | null;
  /** Set when a submission is for an update to an existing product's label. */
  updateOfProduct: string | null;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  isDemo: false;
}

/** Cleaned, validated submission metadata (images validated separately). */
export interface CleanSubmissionFields {
  brand: string;
  productName: string;
  variant: string | null;
  productUrl: string | null;
  submitterName: string | null;
  submitterContact: string | null;
  updateOfProduct: string | null;
}
