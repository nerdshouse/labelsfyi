import registry from '../../../research/sources.json';

/**
 * Source access policy (docs/source-policy.md). The single register of which
 * external sites labels.fyi may collect facts from, and how. Used by the
 * research importer and, at request time, by the URL analyser.
 *
 * FAIL CLOSED: a host that is not in the register, or whose access mode does
 * not permit automated collection, is never fetched.
 */

export type AccessMode =
  | 'NOT_PERMITTED'
  | 'MANUAL_RESEARCH'
  | 'BRAND_PERMISSION'
  | 'BRAND_SUPPLIED_FEED'
  | 'AUTHORIZED_FEED'
  | 'USER_SUBMITTED_LABEL';

export interface SourcePolicy {
  id: string;
  name: string;
  domain: string;
  hosts: string[];
  accessMode: AccessMode;
  /** How facts from this source are labelled publicly. */
  sourceKind: 'BRAND_WEBSITE' | 'MARKETPLACE' | 'OTHER';
  /** Regex (string) a product page path must match; absent → no page fetching. */
  productPath?: string;
  termsExcerpt: string;
  permissionBasis?: string;
  /**
   * True only once WRITTEN permission is on file and checked (an AUTHORIZED
   * assetPermission record, named in permissionRecord). An automated access
   * mode alone is not enough: until verified the source is refused.
   */
  permissionVerified?: boolean;
  permissionRecord?: string | null;
}

/** Modes under which labels.fyi may fetch a page automatically. */
export const AUTOMATED_MODES: AccessMode[] = [
  'BRAND_PERMISSION',
  'BRAND_SUPPLIED_FEED',
  'AUTHORIZED_FEED',
];

export const SOURCES: SourcePolicy[] = (registry as { sources: SourcePolicy[] }).sources;
export const REGISTER_REVIEWED_AT: string = (registry as { reviewedAt: string }).reviewedAt;

export function policyForHost(
  host: string,
  sources: SourcePolicy[] = SOURCES,
): SourcePolicy | null {
  const h = host.toLowerCase().replace(/\.$/, '');
  return sources.find((s) => s.hosts.includes(h)) ?? null;
}

export type PolicyDecision =
  | { allowed: true; policy: SourcePolicy }
  | {
      allowed: false;
      reason: 'UNKNOWN_SOURCE' | 'NOT_PERMITTED' | 'PERMISSION_UNVERIFIED' | 'NOT_A_PRODUCT_PAGE';
      policy: SourcePolicy | null;
    };

/** May labels.fyi automatically read this product URL? */
export function decide(url: URL, sources: SourcePolicy[] = SOURCES): PolicyDecision {
  const policy = policyForHost(url.hostname, sources);
  if (!policy) return { allowed: false, reason: 'UNKNOWN_SOURCE', policy: null };
  if (!AUTOMATED_MODES.includes(policy.accessMode))
    return { allowed: false, reason: 'NOT_PERMITTED', policy };
  if (policy.permissionVerified !== true || !policy.permissionRecord)
    return { allowed: false, reason: 'PERMISSION_UNVERIFIED', policy };
  if (!policy.productPath || !new RegExp(policy.productPath).test(url.pathname))
    return { allowed: false, reason: 'NOT_A_PRODUCT_PAGE', policy };
  return { allowed: true, policy };
}
