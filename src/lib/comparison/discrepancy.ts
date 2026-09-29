import type { DiscrepancyData } from '@/lib/content/types';

/**
 * Read-side view of a discrepancy. The stored status is the only status:
 * a brand response is attached as provenance and never resolves anything by
 * itself. Resolution is a separate, human editorial decision.
 */
export function discrepancyView(d: DiscrepancyData) {
  const open = d.status !== 'RESOLVED' && d.status !== 'SUPERSEDED';
  return {
    status: d.status,
    isOpen: open,
    sourceCount: d.values.length,
    hasBrandResponse: d.brandResponses.length > 0,
    /** A response exists but an editor has not yet decided what it means. */
    awaitingEditorialDecision: open && d.brandResponses.length > 0,
  };
}

export const openDiscrepancyCount = (ds: DiscrepancyData[]) =>
  ds.filter((d) => discrepancyView(d).isOpen).length;
