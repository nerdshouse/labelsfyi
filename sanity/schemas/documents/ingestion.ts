import { defineArrayMember, defineField, defineType } from 'sanity';
import {
  CANDIDATE_STATUS,
  DATA_SOURCE_TYPE,
  EXTRACTED_FIELD,
  EXTRACTION_METHOD,
  IMAGE_ROLE,
  INGESTION_RUN_STATUS,
  MATCH_STATUS,
  UNITS,
  VERIFICATION_STATUS,
} from '../../lib/constants';
import { lockedAfterWindow } from '../../lib/validation';

/**
 * Ingestion-readiness schemas (docs/ingestion.md).
 *
 * INGESTION IS NOT PUBLISHING. Nothing in this file is ever queried by the
 * site. Data here is *what an external source said*; it only becomes
 * labels.fyi content when an editor records a verified Observation / label
 * panel / claim, which then goes through the normal editorial workflow.
 *
 * Naming: `dataSource` is a website/organisation we fetch from. The existing
 * `source` type is a *citation* (a specific study, label capture or page),
 * and is unchanged.
 */

export const dataSource = defineType({
  name: 'dataSource',
  title: 'Data source',
  type: 'document',
  description:
    'A website or organisation we may collect product data from (e.g. a brand site, a retailer). Record access terms before any automated collection.',
  fields: [
    defineField({ name: 'name', type: 'string', validation: (r) => r.required() }),
    defineField({
      name: 'domain',
      type: 'string',
      description: 'Bare domain, e.g. "example.com".',
      validation: (r) =>
        r.required().regex(/^(?!https?:\/\/)[a-z0-9.-]+\.[a-z]{2,}$/i, { name: 'domain' }),
    }),
    defineField({
      name: 'sourceType',
      type: 'string',
      options: { list: DATA_SOURCE_TYPE },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'active',
      type: 'boolean',
      initialValue: false,
      description: 'Only active sources may be fetched by a future adapter.',
    }),
    defineField({
      name: 'brand',
      type: 'reference',
      to: [{ type: 'brand' }],
      description: 'If this is a brand’s own site.',
    }),
    defineField({
      name: 'merchant',
      type: 'reference',
      to: [{ type: 'merchant' }],
      description: 'If products are sold here.',
    }),
    defineField({
      name: 'accessPolicy',
      title: 'Access terms & robots notes',
      type: 'text',
      rows: 3,
      description:
        'What the site’s terms and robots.txt allow, checked when, and any agreed rate limit. Leave the source inactive until this is filled in.',
      validation: (r) =>
        r.custom((v, ctx) =>
          (ctx.document as { active?: boolean })?.active && !v
            ? 'Record access terms before activating a source.'
            : true,
        ),
    }),
    defineField({ name: 'notes', type: 'text', rows: 2 }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  preview: {
    select: { title: 'name', domain: 'domain', type: 'sourceType', active: 'active' },
    prepare: ({ title, domain, type, active }) => ({
      title,
      subtitle: `${domain} · ${type}${active ? '' : ' · inactive'}`,
    }),
  },
});

export const snapshotImage = defineType({
  name: 'snapshotImage',
  title: 'Snapshot image',
  type: 'object',
  description:
    'A reference to an image seen on the source page. Store the file in object storage (storageKey), not in Sanity; only promote a copy to a label photo after review.',
  fields: [
    defineField({
      name: 'sourceUrl',
      title: 'Image URL on source',
      type: 'url',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'storageKey',
      type: 'string',
      description: 'Object-storage key of our archived copy, if any.',
    }),
    defineField({ name: 'contentHash', type: 'string' }),
    defineField({
      name: 'role',
      type: 'string',
      options: { list: IMAGE_ROLE },
      initialValue: 'unknown',
    }),
    defineField({
      name: 'roleAssignedBy',
      type: 'string',
      options: { list: ['human', 'parser', 'ocr', 'ai'] },
      description: 'Who classified the role. Machine classifications are suggestions.',
    }),
  ],
  preview: { select: { title: 'role', subtitle: 'sourceUrl' } },
});

export const sourceSnapshot = defineType({
  name: 'sourceSnapshot',
  title: 'Source snapshot',
  type: 'document',
  description:
    'What a URL showed at a moment in time. Historical evidence: append-only, fields lock after 24 hours. Raw HTML/images belong in object storage; this stores metadata and references.',
  fields: [
    defineField({
      readOnly: lockedAfterWindow,
      name: 'dataSource',
      type: 'reference',
      to: [{ type: 'dataSource' }],
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'url',
      type: 'url',
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'fetchedAt',
      type: 'datetime',
      validation: (r) => r.required(),
    }),
    defineField({ readOnly: lockedAfterWindow, name: 'httpStatus', type: 'number' }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'contentHash',
      type: 'string',
      description: 'Hash of the raw response body, used to detect page changes.',
    }),
    defineField({ readOnly: lockedAfterWindow, name: 'title', type: 'string' }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'rawContentKey',
      title: 'Raw content storage key',
      type: 'string',
      description: 'Object-storage key of the archived raw response. Not stored in Sanity.',
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'excerpt',
      type: 'text',
      rows: 6,
      description:
        'Only the minimal text needed to verify extracted facts (e.g. the label/nutrition section). Not a copy of the page or of marketing copy.',
      validation: (r) => r.max(4000),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'images',
      type: 'array',
      of: [defineArrayMember({ type: 'snapshotImage' })],
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'ingestionRun',
      type: 'reference',
      to: [{ type: 'ingestionRun' }],
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'capturedBy',
      type: 'string',
      description: 'Adapter name + version, or the editor who saved it manually.',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'notes', type: 'text', rows: 2 }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  orderings: [
    {
      title: 'Fetched, newest',
      name: 'fetchedDesc',
      by: [{ field: 'fetchedAt', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', url: 'url', date: 'fetchedAt', status: 'httpStatus' },
    prepare: ({ title, url, date, status }) => ({
      title: title ?? url,
      subtitle: `${date?.slice(0, 10) ?? '—'}${status ? ` · HTTP ${status}` : ''} · ${url}`,
    }),
  },
});

export const ingestionRun = defineType({
  name: 'ingestionRun',
  title: 'Ingestion run',
  type: 'document',
  description:
    'One run of a (future) source adapter. Written by the pipeline; read-only for editors in practice.',
  fields: [
    defineField({
      readOnly: lockedAfterWindow,
      name: 'dataSource',
      type: 'reference',
      to: [{ type: 'dataSource' }],
      validation: (r) => r.required(),
    }),
    defineField({ name: 'adapter', type: 'string', description: 'Adapter id and version.' }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'startedAt',
      type: 'datetime',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'completedAt', type: 'datetime' }),
    defineField({
      name: 'status',
      type: 'string',
      options: { list: INGESTION_RUN_STATUS },
      initialValue: 'running',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'pagesFetched', type: 'number', initialValue: 0 }),
    defineField({ name: 'productsFound', type: 'number', initialValue: 0 }),
    defineField({ name: 'productsChanged', type: 'number', initialValue: 0 }),
    defineField({ name: 'errors', type: 'array', of: [defineArrayMember({ type: 'string' })] }),
    defineField({ name: 'notes', type: 'text', rows: 2 }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  preview: {
    select: { source: 'dataSource.name', status: 'status', date: 'startedAt' },
    prepare: ({ source, status, date }) => ({
      title: `${source ?? '—'} · ${status}`,
      subtitle: date?.slice(0, 16),
    }),
  },
});

/**
 * One fact as the external source stated it (Layer A). Lives inside its
 * candidate: it has no meaning outside that extraction context, and keeping
 * it embedded means there is no standalone "fact" document that could be
 * mistaken for labels.fyi data. Verification links it to the Observation an
 * editor recorded (Layer B).
 */
export const extractedFact = defineType({
  name: 'extractedFact',
  title: 'Extracted fact',
  type: 'object',
  fields: [
    defineField({
      name: 'field',
      type: 'string',
      options: { list: EXTRACTED_FIELD },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'label',
      type: 'string',
      description: 'Qualifier, e.g. the ingredient or nutrient name.',
    }),
    defineField({
      name: 'value',
      title: 'Value as the source states it',
      type: 'text',
      rows: 2,
      validation: (r) => r.required(),
    }),
    defineField({ name: 'amount', title: 'Parsed amount', type: 'number' }),
    defineField({ name: 'unit', title: 'Parsed unit', type: 'string', options: { list: UNITS } }),
    defineField({
      name: 'method',
      type: 'string',
      options: { list: EXTRACTION_METHOD },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'confidence', type: 'number', validation: (r) => r.min(0).max(1) }),
    defineField({ name: 'imageRef', title: 'Supporting image URL', type: 'url' }),
    defineField({
      name: 'verificationStatus',
      type: 'string',
      options: { list: VERIFICATION_STATUS, layout: 'radio' },
      initialValue: 'unverified',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'verifiedBy',
      type: 'string',
      description:
        'The person who checked this against the label/source. Never an automated process.',
      validation: (r) =>
        r.custom((v, ctx) => {
          const status = (ctx.parent as { verificationStatus?: string })?.verificationStatus;
          return status && status !== 'unverified' && !v
            ? 'Name the person who verified or rejected this fact.'
            : true;
        }),
    }),
    defineField({
      name: 'verifiedAt',
      type: 'datetime',
      validation: (r) =>
        r.custom((v, ctx) => {
          const status = (ctx.parent as { verificationStatus?: string })?.verificationStatus;
          return status && status !== 'unverified' && !v ? 'When was this fact checked?' : true;
        }),
    }),
    defineField({
      name: 'observation',
      title: 'Resulting observation',
      type: 'reference',
      to: [{ type: 'observation' }],
      description: 'The labels.fyi observation recorded after verification.',
    }),
    defineField({
      name: 'rejectionReason',
      type: 'string',
      hidden: ({ parent }) =>
        (parent as { verificationStatus?: string })?.verificationStatus !== 'rejected',
    }),
  ],
  preview: {
    select: {
      field: 'field',
      label: 'label',
      value: 'value',
      status: 'verificationStatus',
      method: 'method',
    },
    prepare: ({ field, label, value, status, method }) => ({
      title: `${status === 'verified' ? '✓' : status === 'rejected' ? '✕' : '⚠'} ${field}${label ? ` · ${label}` : ''}`,
      subtitle: `${value} (${method})`,
    }),
  },
});

export const possibleMatch = defineType({
  name: 'possibleMatch',
  title: 'Possible match',
  type: 'object',
  fields: [
    defineField({
      name: 'product',
      type: 'reference',
      to: [{ type: 'product' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'reason',
      type: 'string',
      description: 'e.g. "Same brand, name and pack size; different flavour".',
    }),
    defineField({ name: 'score', type: 'number', validation: (r) => r.min(0).max(1) }),
  ],
  preview: { select: { title: 'product.name', subtitle: 'reason' } },
});

export const ingestionCandidate = defineType({
  name: 'ingestionCandidate',
  title: 'Ingestion candidate',
  type: 'document',
  description:
    'Product data extracted from one source snapshot, awaiting human verification. Never shown on the site. Accepting a candidate does not change any product: editors record verified facts as observations/label panels, which go through fact check and review.',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      description: 'Product name as the source shows it.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'dataSource',
      type: 'reference',
      to: [{ type: 'dataSource' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'snapshot',
      type: 'reference',
      to: [{ type: 'sourceSnapshot' }],
      validation: (r) => r.required(),
    }),
    defineField({ name: 'sourceUrl', type: 'url', validation: (r) => r.required() }),
    defineField({ name: 'externalId', title: 'External ID / SKU / ASIN', type: 'string' }),
    defineField({ name: 'extractedAt', type: 'datetime', validation: (r) => r.required() }),
    defineField({
      name: 'extractor',
      type: 'string',
      description: 'Adapter/extractor name and version.',
    }),
    defineField({
      name: 'status',
      type: 'string',
      options: { list: CANDIDATE_STATUS, layout: 'radio' },
      initialValue: 'needs_verification',
      validation: (r) =>
        r.required().custom((status, ctx) => {
          const d = ctx.document as {
            matchStatus?: string;
            facts?: Array<{ verificationStatus?: string }>;
          };
          if (status !== 'accepted') return true;
          if (!['confirmed', 'new_product'].includes(d?.matchStatus ?? ''))
            return 'Confirm the product match (existing or new) before accepting.';
          if (d?.facts?.some((f) => f.verificationStatus === 'unverified'))
            return 'Verify or reject every fact before accepting.';
          return true;
        }),
    }),
    defineField({
      name: 'facts',
      title: 'Extracted facts',
      type: 'array',
      of: [defineArrayMember({ type: 'extractedFact' })],
    }),
    defineField({
      name: 'matchStatus',
      type: 'string',
      options: { list: MATCH_STATUS },
      initialValue: 'unmatched',
      description: 'A pipeline may suggest matches; only a person confirms one.',
    }),
    defineField({
      name: 'possibleMatches',
      type: 'array',
      of: [defineArrayMember({ type: 'possibleMatch' })],
    }),
    defineField({
      name: 'resolvedProduct',
      title: 'Confirmed product',
      type: 'reference',
      to: [{ type: 'product' }],
      hidden: ({ document }) =>
        document?.matchStatus !== 'confirmed' && document?.matchStatus !== 'new_product',
      validation: (r) =>
        r.custom((v, ctx) =>
          (ctx.document as { matchStatus?: string })?.matchStatus === 'confirmed' && !v
            ? 'Pick the existing product this candidate matches.'
            : true,
        ),
    }),
    defineField({ name: 'reviewedBy', type: 'string' }),
    defineField({ name: 'reviewedAt', type: 'datetime' }),
    defineField({ name: 'notes', type: 'text', rows: 2 }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  orderings: [
    {
      title: 'Extracted, newest',
      name: 'extractedDesc',
      by: [{ field: 'extractedAt', direction: 'desc' }],
    },
  ],
  preview: {
    select: {
      title: 'title',
      source: 'dataSource.name',
      status: 'status',
      match: 'matchStatus',
      date: 'extractedAt',
    },
    prepare: ({ title, source, status, match, date }) => ({
      title,
      subtitle: `${source ?? '—'} · ${status} · ${match} · ${date?.slice(0, 10) ?? ''}`,
    }),
  },
});

/**
 * A listing of a canonical product on an external source. Many references
 * can point to one product (brand site + Amazon + HealthKart). Kept out of the
 * product document so routine "last seen" updates never touch canonical data.
 */
export const productReference = defineType({
  name: 'productReference',
  title: 'External product reference',
  type: 'document',
  fields: [
    defineField({
      name: 'product',
      title: 'Canonical product',
      type: 'reference',
      to: [{ type: 'product' }],
      description: 'Set by a person when confirming a match.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'dataSource',
      type: 'reference',
      to: [{ type: 'dataSource' }],
      validation: (r) => r.required(),
    }),
    defineField({ name: 'url', type: 'url', validation: (r) => r.required() }),
    defineField({ name: 'externalId', title: 'External ID / SKU / ASIN', type: 'string' }),
    defineField({
      name: 'variantLabel',
      title: 'Variant as listed',
      type: 'string',
      description: 'e.g. "Chocolate, 1 kg".',
    }),
    defineField({
      name: 'packSize',
      type: 'quantity',
      description:
        'Different pack sizes of the same formulation are the same product. Different flavours or formulations are different products.',
    }),
    defineField({ name: 'firstSeenAt', type: 'datetime', validation: (r) => r.required() }),
    defineField({ name: 'lastSeenAt', type: 'datetime' }),
    defineField({ name: 'active', type: 'boolean', initialValue: true }),
    defineField({ name: 'matchedBy', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'matchedAt', type: 'datetime', validation: (r) => r.required() }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  preview: {
    select: {
      product: 'product.name',
      source: 'dataSource.name',
      variant: 'variantLabel',
      active: 'active',
    },
    prepare: ({ product, source, variant, active }) => ({
      title: `${source ?? '—'} → ${product ?? '—'}`,
      subtitle: `${variant ?? ''}${active ? '' : ' · inactive'}`,
    }),
  },
});

export const ingestionTypes = [
  dataSource,
  snapshotImage,
  sourceSnapshot,
  ingestionRun,
  extractedFact,
  possibleMatch,
  ingestionCandidate,
  productReference,
];
