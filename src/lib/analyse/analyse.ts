import { toCandidateDocument, type CandidateDocument } from '@/lib/ingestion/candidate';
import type { IdentityRecord } from '@/lib/identity/match';
import { decide, type SourcePolicy } from '@/lib/sources/policy';
import type { HostResolver } from './dns-guard';
import { safeFetch, type FetchLike } from './fetch';
import { extractProductPage, MINERALS, toFacts, type PageExtraction } from './extract';
import { robotsAllows } from './robots';
import { checkUrl } from './safe-url';

/**
 * "Check a supplement": the product URL analyser (docs/ingestion.md,
 * docs/security.md). Pipeline, failing closed at every step:
 *
 *   validate URL → source register (policy) → public-DNS check → robots.txt → fetch page
 *   → extract facts → UNVERIFIED candidate (only on "Submit for verification")
 *
 * Never: publishes, downloads images, stores descriptions, runs page JS.
 */

export type AnalysisState =
  | 'INVALID_URL'
  | 'SOURCE_NOT_ALLOWED'
  | 'EXTRACTION_SUCCESS'
  | 'EXTRACTION_PARTIAL'
  | 'NOTHING_FOUND'
  | 'ERROR';

export interface Provenance {
  sourceUrl: string;
  sourceKind: SourcePolicy['sourceKind'];
  sourceName: string;
  observedAt: string;
  methods: string[];
  verificationStatus: 'UNVERIFIED';
}

export interface AnalysisResult {
  state: AnalysisState;
  message: string;
  url?: string;
  policy?: Pick<SourcePolicy, 'id' | 'name' | 'sourceKind'> | null;
  extraction?: PageExtraction;
  missing?: string[];
  provenance?: Provenance;
}

const NOT_ALLOWED = "We can't automatically analyse this source.";

export async function analyseUrl(
  input: string,
  opts: {
    fetchImpl?: FetchLike;
    resolveHost?: HostResolver;
    now?: Date;
    sources?: SourcePolicy[];
  } = {},
): Promise<AnalysisResult> {
  const now = (opts.now ?? new Date()).toISOString();
  const checked = checkUrl(input);
  if (!checked.ok) return { state: 'INVALID_URL', message: checked.reason };
  const url = checked.url;
  const decision = decide(url, opts.sources);
  if (!decision.allowed)
    return {
      state: 'SOURCE_NOT_ALLOWED',
      message:
        decision.reason === 'NOT_A_PRODUCT_PAGE'
          ? 'That is not a product page we can read. Paste the direct product page URL.'
          : NOT_ALLOWED,
      url: url.toString(),
      policy: decision.policy && {
        id: decision.policy.id,
        name: decision.policy.name,
        sourceKind: decision.policy.sourceKind,
      },
    };
  const policy = decision.policy;
  const pub = { id: policy.id, name: policy.name, sourceKind: policy.sourceKind };

  // robots.txt: 4xx → no rules; unreachable/5xx → fail closed.
  const robots = await safeFetch(new URL('/robots.txt', url), policy, {
    fetchImpl: opts.fetchImpl,
    resolveHost: opts.resolveHost,
    accept: ['text/plain'],
    requireProductPath: false,
    limits: { maxBytes: 200_000 },
  });
  const robotsTxt = robots.ok
    ? robots.body
    : robots.code === 'HTTP' && /HTTP 4\d\d/.test(robots.detail)
      ? ''
      : null;
  if (robotsTxt === null || !robotsAllows(robotsTxt, url.pathname + url.search))
    return { state: 'SOURCE_NOT_ALLOWED', message: NOT_ALLOWED, url: url.toString(), policy: pub };

  const page = await safeFetch(url, policy, {
    fetchImpl: opts.fetchImpl,
    resolveHost: opts.resolveHost,
    accept: ['text/html', 'application/xhtml+xml'],
  });
  if (!page.ok)
    return {
      state: page.code === 'BLOCKED' || page.code === 'REDIRECT' ? 'SOURCE_NOT_ALLOWED' : 'ERROR',
      message: page.code === 'BLOCKED' || page.code === 'REDIRECT' ? NOT_ALLOWED : page.detail,
      url: url.toString(),
      policy: pub,
    };

  const extraction = extractProductPage(page.body);
  const provenance: Provenance = {
    sourceUrl: page.url.toString(),
    sourceKind: policy.sourceKind,
    sourceName: policy.name,
    observedAt: now,
    methods: extraction.methods,
    verificationStatus: 'UNVERIFIED',
  };
  const missing = [
    ...(extraction.serving ? [] : ['Serving size']),
    ...(extraction.servingsPerContainer ? [] : ['Servings per pack']),
    ...(extraction.ingredients.length ? [] : ['Ingredient amounts']),
    ...(extraction.ingredients.some(
      (i) => MINERALS.test(i.label) || MINERALS.test(extraction.name ?? ''),
    ) && !extraction.ingredients.some((i) => i.elementalStated)
      ? ['Elemental amount (only counted when stated)']
      : []),
    ...(extraction.price ? [] : ['Price']),
    ...(extraction.gtin ? [] : ['Barcode (GTIN)']),
    'Label evidence (a photo of the actual label)',
  ];
  if (!extraction.name)
    return {
      state: 'NOTHING_FOUND',
      message: 'We could not find product facts on this page.',
      url: provenance.sourceUrl,
      policy: pub,
      missing,
      provenance,
    };
  const complete = Boolean(extraction.serving && extraction.ingredients.length);
  return {
    state: complete ? 'EXTRACTION_SUCCESS' : 'EXTRACTION_PARTIAL',
    message: complete ? 'Product found.' : 'Product found, but some facts are missing.',
    url: provenance.sourceUrl,
    policy: pub,
    extraction,
    missing,
    provenance,
  };
}

/** Documents for "Submit for verification". Never a Product: a private, unverified candidate. */
export function candidateDocuments(
  result: AnalysisResult,
  policy: SourcePolicy,
  existing: IdentityRecord[],
  stamp: string,
): {
  dataSource: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  candidate: CandidateDocument;
} {
  if (
    !result.extraction ||
    !result.provenance ||
    (result.state !== 'EXTRACTION_SUCCESS' && result.state !== 'EXTRACTION_PARTIAL')
  )
    throw new Error('Nothing to submit.');
  const x = result.extraction;
  const p = result.provenance;
  const snapshotId = `snapshot.analyse.${policy.id}.${stamp}`;
  const facts = toFacts(x);
  const candidate = toCandidateDocument(
    {
      provenance: {
        dataSourceId: `dataSource.${policy.id}`,
        snapshotId,
        sourceUrl: p.sourceUrl,
        fetchedAt: p.observedAt,
      },
      title: x.name!,
      extractedAt: p.observedAt,
      extractor: 'url-analyser@1',
      facts,
    },
    existing,
  );
  return {
    dataSource: {
      _id: `dataSource.${policy.id}`,
      _type: 'dataSource',
      name: policy.name,
      domain: policy.domain,
      sourceType: policy.sourceKind === 'MARKETPLACE' ? 'marketplace' : 'brand',
      active: false,
      accessMode: policy.accessMode,
      termsSummary: policy.termsExcerpt,
    },
    snapshot: {
      _id: snapshotId,
      _type: 'sourceSnapshot',
      dataSource: { _type: 'reference', _ref: `dataSource.${policy.id}` },
      url: p.sourceUrl,
      fetchedAt: p.observedAt,
      httpStatus: 200,
      title: x.name,
      // No excerpt: marketing prose is never stored. No image references.
      images: [],
      capturedBy: 'url-analyser@1',
      notes: x.imagesSeen
        ? 'A product/label image was present on the page and was not collected.'
        : null,
    },
    candidate,
  };
}
