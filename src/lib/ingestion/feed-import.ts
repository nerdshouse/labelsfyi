/**
 * Building and checking the NDJSON that `sanity dataset import … --missing`
 * loads into the PRIVATE dataset (docs/production.md §7).
 *
 * Idempotency comes from deterministic document IDs plus `--missing` (skip any
 * document whose ID already exists): importing the same file twice creates
 * nothing the second time and never overwrites a reviewer's edits.
 *   dataSource.<source>            one per source
 *   snapshot.<source>.<shopifyId>  one per listing (stable across handle renames)
 *   candidate.<source>.<shopifyId> one per listing
 *
 * checkImportDocuments() refuses a file that could do anything other than add
 * private, UNVERIFIED, UNMATCHED candidates: no products, reviews or other
 * content types, no drafts, no invalid IDs, no invented matches or GTINs.
 */
import { dataSourceTypeFor, type FeedExtraction, type SourceConfig } from './shopify-feed';

export type ImportDoc = Record<string, unknown> & { _id: string; _type: string };

export interface RegisteredSource extends SourceConfig {
  termsExcerpt: string;
  permissionBasis?: string;
  robots: string;
}

/** Deep copy without null values: in the import file, missing = absent. */
function stripNulls<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v: unknown) => (v === null ? undefined : v))) as T;
}

/** The exact documents written to research/catalogue/<source>-<date>.ndjson. */
export function buildFeedImportDocuments(
  out: FeedExtraction,
  source: RegisteredSource,
  opts: { contentHash: string },
): ImportDoc[] {
  const date = out.fetchedAt.slice(0, 10);
  const docs: ImportDoc[] = [
    {
      _id: `dataSource.${source.id}`,
      _type: 'dataSource',
      name: source.name,
      domain: source.domain,
      // From the registered sourceKind: a retailer/marketplace is never "brand".
      sourceType: dataSourceTypeFor(source),
      active: false,
      accessMode: source.accessMode,
      termsReviewedAt: out.fetchedAt,
      termsSummary: source.termsExcerpt,
      accessPolicy: `${source.permissionBasis ?? ''} Robots: ${source.robots}`.trim(),
      // Listings deliberately not turned into candidates, with the reason.
      notes: out.skipped.length
        ? `Skipped ${out.skipped.length} listing(s) on ${date}: ${out.skipped
            .map((k) => `${k.handle} (${k.reason})`)
            .join('; ')}`
        : null,
    },
    ...out.products.flatMap((p) => [
      { ...(p.snapshot as ImportDoc), contentHash: opts.contentHash },
      p.candidate as unknown as ImportDoc,
    ]),
  ];
  return stripNulls(docs);
}

// ─── Pre-import check ────────────────────────────────────────────────────

const ALLOWED_TYPES = new Map([
  ['dataSource', 'dataSource.'],
  ['sourceSnapshot', 'snapshot.'],
  ['ingestionCandidate', 'candidate.'],
]);
/** Sanity document ID rules: [A-Za-z0-9._-], ≤ 128 chars, no leading "-". */
const VALID_ID = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

export interface ImportCheck {
  ok: boolean;
  problems: string[];
  summary: {
    documents: Record<string, number>;
    facts: number;
    factsByField: Record<string, number>;
    goalSuggestions: Record<string, number>;
    duplicateFlagged: number;
    skippedListings: number;
  };
}

function hasNull(v: unknown): boolean {
  if (v === null) return true;
  if (Array.isArray(v)) return v.some(hasNull);
  if (typeof v === 'object') return Object.values(v as object).some(hasNull);
  return false;
}
const refOf = (v: unknown) => (v as { _ref?: string } | undefined)?._ref;

export function checkImportDocuments(docs: ImportDoc[]): ImportCheck {
  const problems: string[] = [];
  const byId = new Map<string, ImportDoc>();
  const counts: Record<string, number> = {};
  for (const d of docs) {
    const where = `${d._type ?? '?'} ${d._id ?? '?'}`;
    counts[d._type] = (counts[d._type] ?? 0) + 1;
    const prefix = ALLOWED_TYPES.get(d._type);
    if (!prefix) problems.push(`${where}: type "${d._type}" may not be imported by a feed`);
    if (typeof d._id !== 'string' || !VALID_ID.test(d._id))
      problems.push(`${where}: invalid Sanity document ID (chars/length)`);
    else if (/^(drafts|versions)\./.test(d._id))
      problems.push(`${where}: drafts/versions are not allowed`);
    else if (prefix && !d._id.startsWith(prefix))
      problems.push(`${where}: ID must start "${prefix}"`);
    if (byId.has(d._id)) problems.push(`${where}: duplicate ID in file`);
    byId.set(d._id, d);
    if (hasNull(d)) problems.push(`${where}: contains null values`);
  }

  const dataSources = docs.filter((d) => d._type === 'dataSource');
  const typeOf = (id: string | undefined) => (id ? byId.get(id)?._type : undefined);
  let facts = 0;
  const factsByField: Record<string, number> = {};
  const goalSuggestions: Record<string, number> = {};
  let duplicateFlagged = 0;

  for (const s of docs.filter((d) => d._type === 'sourceSnapshot')) {
    const w = `sourceSnapshot ${s._id}`;
    const ds = byId.get(refOf(s.dataSource) ?? '');
    if (ds?._type !== 'dataSource') problems.push(`${w}: dataSource reference not in file`);
    if (!s.url || !s.fetchedAt || !s.capturedBy)
      problems.push(`${w}: missing url/fetchedAt/capturedBy`);
    // Retailer/marketplace: no brand imagery (not even references) and no copy.
    if (ds && ds.sourceType !== 'brand') {
      if (Array.isArray(s.images) && s.images.length)
        problems.push(
          `${w}: image references are not allowed for a ${String(ds.sourceType)} source`,
        );
      if (s.excerpt)
        problems.push(
          `${w}: description text is not allowed for a ${String(ds.sourceType)} source`,
        );
    }
  }

  for (const c of docs.filter((d) => d._type === 'ingestionCandidate')) {
    const w = `ingestionCandidate ${c._id}`;
    const ds = byId.get(refOf(c.dataSource) ?? '');
    if (ds?._type !== 'dataSource') problems.push(`${w}: dataSource reference not in file`);
    if (typeOf(refOf(c.snapshot)) !== 'sourceSnapshot')
      problems.push(`${w}: snapshot reference not in file`);
    if (c.status !== 'needs_verification') problems.push(`${w}: status must be needs_verification`);
    // No match is ever decided at import time (nothing to compare against).
    if (c.matchStatus !== 'unmatched') problems.push(`${w}: matchStatus must be unmatched`);
    if (Array.isArray(c.possibleMatches) && c.possibleMatches.length)
      problems.push(`${w}: possible matches must not be invented at import`);
    for (const k of ['resolvedProduct', 'reviewedBy', 'reviewedAt', 'proposedChangesAppliedAt'])
      if (c[k] !== undefined) problems.push(`${w}: "${k}" must not be set at import`);
    if (!c.sourceUrl || !c.extractedAt || !c.extractor)
      problems.push(`${w}: provenance incomplete`);
    const domain = ds?.domain as string | undefined;
    if (domain && typeof c.sourceUrl === 'string') {
      const host = new URL(c.sourceUrl).hostname.replace(/^www\./, '');
      if (host !== domain.replace(/^www\./, ''))
        problems.push(`${w}: sourceUrl is not on ${domain}`);
    }
    const fs = (c.facts as Array<Record<string, unknown>> | undefined) ?? [];
    facts += fs.length;
    for (const f of fs) {
      factsByField[String(f.field)] = (factsByField[String(f.field)] ?? 0) + 1;
      if (f.verificationStatus !== 'unverified')
        problems.push(`${w}: fact "${String(f.field)}" is not unverified`);
      if (!f.method) problems.push(`${w}: fact "${String(f.field)}" has no extraction method`);
      if (
        ds &&
        ds.sourceType !== 'brand' &&
        f.field === 'ingredient_amount' &&
        !/\(per [^)]+\)$/.test(String(f.label))
      )
        problems.push(`${w}: ingredient_amount "${String(f.label)}" has no stated basis`);
    }
    // A candidate GTIN only ever comes from a GTIN fact in the listing.
    if (
      c.gtin !== undefined &&
      !fs.some(
        (f) => f.field === 'gtin' && String(f.value).replace(/\D/g, '').endsWith(String(c.gtin)),
      )
    )
      problems.push(`${w}: gtin ${String(c.gtin)} has no GTIN fact in the listing`);
    for (const g of (c.goalSuggestions as Array<{ basis?: string }> | undefined) ?? [])
      goalSuggestions[String(g.basis)] = (goalSuggestions[String(g.basis)] ?? 0) + 1;
    if (typeof c.notes === 'string' && /Possible duplicate/.test(c.notes)) duplicateFlagged++;
  }

  if (dataSources.length !== 1)
    problems.push(`expected exactly one dataSource, found ${dataSources.length}`);
  const skippedListings = Number(
    /Skipped (\d+) listing/.exec(String(dataSources[0]?.notes ?? ''))?.[1] ?? 0,
  );
  return {
    ok: problems.length === 0,
    problems,
    summary: {
      documents: counts,
      facts,
      factsByField,
      goalSuggestions,
      duplicateFlagged,
      skippedListings,
    },
  };
}
