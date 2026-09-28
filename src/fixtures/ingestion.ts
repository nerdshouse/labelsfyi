import type { RawDoc } from './helpers.ts';
import { key, qty, ref } from './helpers.ts';

/**
 * Demo ingestion records (docs/ingestion.md). Nothing was fetched: every
 * domain uses the reserved `.example` TLD and every value is fictional.
 *
 * Shows the intended flow for one product, Specimen Nutrition Whey (P4):
 *   two sources (brand site + marketplace) → snapshots → candidates
 *   → one confirmed match with some facts verified into observations
 *   → one different-flavour listing left as an unconfirmed *possible* match.
 * None of these document types is ever queried by the site.
 */

const P4 = 'product.specimen-whey';
const EDITOR = 'labels.fyi editorial (demo)';

const fact = (f: {
  field: string;
  value: string;
  method: string;
  label?: string;
  amount?: number;
  unit?: string;
  confidence?: number;
  verified?: { by: string; at: string; observation?: string };
  rejected?: { by: string; at: string; reason: string };
}) => ({
  _key: key(),
  _type: 'extractedFact',
  field: f.field,
  label: f.label ?? null,
  value: f.value,
  amount: f.amount ?? null,
  unit: f.unit ?? null,
  method: f.method,
  confidence: f.confidence ?? null,
  verificationStatus: f.verified ? 'verified' : f.rejected ? 'rejected' : 'unverified',
  verifiedBy: f.verified?.by ?? f.rejected?.by ?? null,
  verifiedAt: f.verified
    ? `${f.verified.at}T12:00:00Z`
    : f.rejected
      ? `${f.rejected.at}T12:00:00Z`
      : null,
  observation: f.verified?.observation ? ref(f.verified.observation) : null,
  rejectionReason: f.rejected?.reason ?? null,
});

export const ingestion: RawDoc[] = [
  {
    _id: 'dataSource.demo-brand',
    _type: 'dataSource',
    name: 'Specimen Nutrition (brand site, demo)',
    domain: 'specimen.example',
    sourceType: 'brand',
    active: false,
    brand: ref('brand.specimen'),
    merchant: ref('merchant.brand-site'),
    accessPolicy: 'Demo source. Not a real website; never fetched.',
    isDemo: true,
  },
  {
    _id: 'dataSource.demo-marketplace',
    _type: 'dataSource',
    name: 'Demo marketplace',
    domain: 'marketplace.example',
    sourceType: 'marketplace',
    active: false,
    merchant: ref('merchant.amazon-in'),
    accessPolicy: 'Demo source. Not a real website; never fetched.',
    isDemo: true,
  },
  {
    _id: 'ingestionRun.demo-2026-09-18',
    _type: 'ingestionRun',
    dataSource: ref('dataSource.demo-brand'),
    adapter: 'demo-fixture@0.0.0',
    startedAt: '2026-09-18T09:00:00Z',
    completedAt: '2026-09-18T09:02:00Z',
    status: 'completed',
    pagesFetched: 2,
    productsFound: 2,
    productsChanged: 1,
    errors: [],
    notes: 'Fixture record: no pages were actually fetched.',
    isDemo: true,
  },
  {
    _id: 'snapshot.demo-brand-whey-choc',
    _type: 'sourceSnapshot',
    dataSource: ref('dataSource.demo-brand'),
    url: 'https://specimen.example/products/whey-protein-concentrate-rich-chocolate',
    fetchedAt: '2026-09-18T09:01:00Z',
    httpStatus: 200,
    contentHash: 'sha256:demo-0001',
    title: 'Whey Protein Concentrate, Rich Chocolate, 1 kg',
    rawContentKey: 'demo/specimen.example/2026-09-18/whey-choc.html',
    excerpt: 'Protein per serving (33 g): 24 g. Net weight 1 kg. 30 servings.',
    images: [
      {
        _key: key(),
        _type: 'snapshotImage',
        sourceUrl: 'https://specimen.example/img/whey-choc-front.jpg',
        role: 'front',
        roleAssignedBy: 'parser',
      },
      {
        _key: key(),
        _type: 'snapshotImage',
        sourceUrl: 'https://specimen.example/img/whey-choc-back.jpg',
        role: 'nutrition',
        roleAssignedBy: 'human',
      },
    ],
    ingestionRun: ref('ingestionRun.demo-2026-09-18'),
    capturedBy: 'demo-fixture@0.0.0',
    isDemo: true,
  },
  {
    _id: 'snapshot.demo-brand-whey-vanilla',
    _type: 'sourceSnapshot',
    dataSource: ref('dataSource.demo-brand'),
    url: 'https://specimen.example/products/whey-protein-concentrate-vanilla',
    fetchedAt: '2026-09-18T09:01:30Z',
    httpStatus: 200,
    contentHash: 'sha256:demo-0002',
    title: 'Whey Protein Concentrate, Vanilla, 1 kg',
    images: [],
    ingestionRun: ref('ingestionRun.demo-2026-09-18'),
    capturedBy: 'demo-fixture@0.0.0',
    isDemo: true,
  },
  {
    _id: 'snapshot.demo-marketplace-whey-choc',
    _type: 'sourceSnapshot',
    dataSource: ref('dataSource.demo-marketplace'),
    url: 'https://marketplace.example/listing/SPEC-WPC-CHOC-1KG',
    fetchedAt: '2026-09-18T10:00:00Z',
    httpStatus: 200,
    contentHash: 'sha256:demo-0003',
    title: 'Specimen Nutrition Whey Protein Concentrate Chocolate 1kg',
    images: [],
    capturedBy: EDITOR,
    isDemo: true,
  },
  // Two external listings → one canonical product.
  {
    _id: 'productReference.specimen-whey.brand',
    _type: 'productReference',
    product: ref(P4),
    dataSource: ref('dataSource.demo-brand'),
    url: 'https://specimen.example/products/whey-protein-concentrate-rich-chocolate',
    variantLabel: 'Rich Chocolate, 1 kg',
    packSize: qty(1, 'kg'),
    firstSeenAt: '2026-03-10T00:00:00Z',
    lastSeenAt: '2026-09-18T09:01:00Z',
    active: true,
    matchedBy: EDITOR,
    matchedAt: '2026-09-18T12:00:00Z',
    isDemo: true,
  },
  {
    _id: 'productReference.specimen-whey.marketplace',
    _type: 'productReference',
    product: ref(P4),
    dataSource: ref('dataSource.demo-marketplace'),
    url: 'https://marketplace.example/listing/SPEC-WPC-CHOC-1KG',
    externalId: 'SPEC-WPC-CHOC-1KG',
    variantLabel: 'Chocolate 1kg',
    packSize: qty(1, 'kg'),
    firstSeenAt: '2026-04-02T00:00:00Z',
    lastSeenAt: '2026-09-18T10:00:00Z',
    active: true,
    matchedBy: EDITOR,
    matchedAt: '2026-09-18T12:05:00Z',
    isDemo: true,
  },
  // Confirmed match, partly verified. Verified facts point at the observation
  // an editor recorded; the AI-extracted claim is still unverified.
  {
    _id: 'candidate.demo-brand-whey-choc',
    _type: 'ingestionCandidate',
    title: 'Whey Protein Concentrate, Rich Chocolate, 1 kg',
    dataSource: ref('dataSource.demo-brand'),
    snapshot: ref('snapshot.demo-brand-whey-choc'),
    sourceUrl: 'https://specimen.example/products/whey-protein-concentrate-rich-chocolate',
    extractedAt: '2026-09-18T09:05:00Z',
    extractor: 'demo-fixture@0.0.0',
    status: 'in_review',
    matchStatus: 'confirmed',
    resolvedProduct: ref(P4),
    possibleMatches: [
      {
        _key: key(),
        _type: 'possibleMatch',
        product: ref(P4),
        reason: 'Same brand, name, flavour and pack size.',
        score: 0.95,
      },
    ],
    facts: [
      fact({
        field: 'name',
        value: 'Whey Protein Concentrate, Rich Chocolate',
        method: 'structured_data',
        verified: { by: EDITOR, at: '2026-09-18' },
      }),
      fact({
        field: 'pack_size',
        value: 'Net weight 1 kg',
        amount: 1,
        unit: 'kg',
        method: 'parser',
        verified: {
          by: EDITOR,
          at: '2026-09-18',
          observation: 'observation.specimen-whey.pack-size-ingested',
        },
      }),
      fact({
        field: 'nutrient',
        label: 'Protein',
        value: '24 g per 33 g serving',
        amount: 24,
        unit: 'g',
        method: 'parser',
      }),
      fact({ field: 'claim', value: 'Builds lean muscle fast', method: 'ai', confidence: 0.7 }),
      fact({
        field: 'veg_marker',
        value: 'Vegetarian',
        method: 'ai',
        confidence: 0.6,
        rejected: {
          by: EDITOR,
          at: '2026-09-18',
          reason: 'Inferred from page copy; no veg mark visible in the snapshot images.',
        },
      }),
    ],
    reviewedBy: EDITOR,
    notes: 'Demo candidate.',
    isDemo: true,
  },
  // Different flavour: flagged as a *possible* match only. A different
  // flavour is a different product and must not be merged.
  {
    _id: 'candidate.demo-brand-whey-vanilla',
    _type: 'ingestionCandidate',
    title: 'Whey Protein Concentrate, Vanilla, 1 kg',
    dataSource: ref('dataSource.demo-brand'),
    snapshot: ref('snapshot.demo-brand-whey-vanilla'),
    sourceUrl: 'https://specimen.example/products/whey-protein-concentrate-vanilla',
    extractedAt: '2026-09-18T09:05:30Z',
    extractor: 'demo-fixture@0.0.0',
    status: 'needs_verification',
    matchStatus: 'possible_match',
    possibleMatches: [
      {
        _key: key(),
        _type: 'possibleMatch',
        product: ref(P4),
        reason: 'Same brand and base product; different flavour. Likely a separate product.',
        score: 0.7,
      },
    ],
    facts: [
      fact({
        field: 'name',
        value: 'Whey Protein Concentrate, Vanilla',
        method: 'structured_data',
      }),
      fact({ field: 'variant', value: 'Vanilla', method: 'parser' }),
    ],
    isDemo: true,
  },
  // The observation an editor recorded after checking the ingested pack size.
  {
    _id: 'observation.specimen-whey.pack-size-ingested',
    _type: 'observation',
    product: ref(P4),
    type: 'pack_size',
    value: 'Net weight printed as 1 kg (brand product page, checked against back-label image).',
    source: ref('source.label.specimen-whey'),
    snapshot: ref('snapshot.demo-brand-whey-choc'),
    extractedFrom: ref('candidate.demo-brand-whey-choc'),
    observedAt: '2026-09-18T12:00:00Z',
    observedBy: EDITOR,
    verifiedBy: EDITOR,
    verifiedAt: '2026-09-18T12:00:00Z',
    isDemo: true,
  },
];
