import type {
  AssessmentStatus,
  ClaimData,
  ProductDetail,
  ProductSummary,
  SourceData,
} from '@/lib/content/types';
import { formatAmount } from '@/lib/formatting/quantity';
import { formatMoney } from '@/lib/formatting/money';
import { OBSERVATION_TYPE, PANEL_TYPE } from './meta';
import { collectSources } from './sources';

/** Lower-case ordinary words only: "Vitamin D3" → "vitamin D3", "EPA" stays. */
export function inlineName(name: string): string {
  return name
    .split(' ')
    .map((w) => (/^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w))
    .join(' ');
}

/** Short "what you get per serving" lines, e.g. ["24 g protein"]. */
export function keyPerServing(p: Pick<ProductSummary, 'keyActives' | 'keyNutrients'>): string[] {
  const nutrients = p.keyNutrients
    .filter((n) => n.perServing !== null)
    .map((n) => `${formatAmount(n.perServing, n.unit)} ${inlineName(n.name)}`);
  const actives = p.keyActives.map((a) => {
    const name = a.ingredient?.name ?? a.displayName;
    return a.amountPerServing !== null
      ? `${formatAmount(a.amountPerServing, a.unit)} ${inlineName(name)}`
      : `${name} (amount not disclosed)`;
  });
  // A product with a protein figure doesn't need "whey (amount not disclosed)".
  return nutrients.length ? nutrients : actives;
}

export function claimCounts(
  claims: ClaimData[],
): Array<{ status: AssessmentStatus; count: number }> {
  const counts = new Map<AssessmentStatus, number>();
  for (const c of claims) counts.set(c.assessmentStatus, (counts.get(c.assessmentStatus) ?? 0) + 1);
  const order: AssessmentStatus[] = [
    'supported',
    'partially_supported',
    'requires_context',
    'insufficient_evidence',
    'not_verifiable',
  ];
  return order.flatMap((status) =>
    counts.get(status) ? [{ status, count: counts.get(status)! }] : [],
  );
}

/** All sources cited anywhere on a product page, in first-cited order. */
export function productSources(p: ProductDetail): SourceData[] {
  return collectSources(
    p.panels.filter((x) => x.isCurrent).map((x) => x.source),
    ...p.claims.map((c) => [...c.evidence.map((e) => e.source), ...c.sources]),
    p.observations.map((o) => o.source),
    p.panels.filter((x) => !x.isCurrent).map((x) => x.source),
  );
}

export interface HistoryEvent {
  date: string;
  kind: 'published' | 'label' | 'observation' | 'review' | 'price' | 'superseded';
  text: string;
  detail?: string;
}

/** An auditable timeline assembled from dated records. Newest first. */
export function productHistory(p: ProductDetail): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  if (p.firstPublishedAt)
    events.push({ date: p.firstPublishedAt, kind: 'published', text: 'Page first published' });
  for (const panel of p.panels) {
    events.push({
      date: panel.capturedAt,
      kind: 'label',
      text: `${panel.title ?? PANEL_TYPE[panel.panelType]} captured${panel.isCurrent ? '' : ' (since superseded)'}`,
      detail: [panel.capturedBy && `By ${panel.capturedBy}`, panel.source?.title, panel.notes]
        .filter(Boolean)
        .join(' · '),
    });
  }
  for (const o of p.observations) {
    events.push({
      date: o.observedAt,
      kind: 'observation',
      text: `${OBSERVATION_TYPE[o.type]}: ${o.value}`,
      // Provenance: who observed it, from what, with any note.
      detail: [
        o.observedBy && `By ${o.observedBy}`,
        o.verifiedBy && `verified by ${o.verifiedBy}`,
        o.source?.title,
        o.snapshot && `page captured ${o.snapshot.fetchedAt.slice(0, 10)}`,
        o.notes,
      ]
        .filter(Boolean)
        .join(' · '),
    });
    if (o.supersededAt) {
      events.push({
        date: o.supersededAt,
        kind: 'superseded',
        text: `Earlier observation superseded: ${o.value}`,
      });
    }
  }
  for (const c of p.claims) {
    if (c.status === 'superseded' && c.supersededAt) {
      events.push({
        date: c.supersededAt,
        kind: 'superseded',
        text: `Claim no longer on label: “${c.exactClaim}”`,
      });
    }
  }
  for (const r of p.reviews) {
    events.push({
      date: r.reviewedAt,
      kind: 'review',
      text: `Reviewed by ${r.reviewer.name}`,
      detail: r.reviewer.credentials,
    });
  }
  for (const s of p.prices) {
    events.push({
      date: s.capturedAt,
      kind: 'price',
      text: `${s.merchant.name} price observed: ${formatMoney({ amount: s.price, currency: s.currency })}${
        s.availability === 'out_of_stock' ? ' (out of stock)' : ''
      }`,
    });
  }
  return events.sort((a, b) => b.date.localeCompare(a.date));
}
