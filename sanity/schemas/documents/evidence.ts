import { defineArrayMember, defineField, defineType } from 'sanity';
import {
  ASSESSMENT_STATUS,
  CLAIM_TYPE,
  RESEARCH_STATUS,
  SOURCE_KIND,
  SOURCE_TYPE,
} from '../../lib/constants';
import {
  editorialFields,
  editorialGroups,
  requiredAfterDraft,
  requiredWhenApproved,
} from '../../lib/fields';
import { languageWarning } from '../../lib/validation';

export const source = defineType({
  name: 'source',
  title: 'Source',
  type: 'document',
  description: 'Never invent a source, DOI or PMID. Copy identifiers from the publisher or PubMed.',
  fields: [
    defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
    defineField({
      name: 'sourceType',
      type: 'string',
      options: { list: SOURCE_TYPE },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'publisher', type: 'string' }),
    defineField({ name: 'authors', type: 'array', of: [defineArrayMember({ type: 'string' })] }),
    defineField({ name: 'url', type: 'url' }),
    defineField({
      name: 'doi',
      title: 'DOI',
      type: 'string',
      description: 'Without the https://doi.org/ prefix.',
      validation: (r) => r.regex(/^10\.\d{4,9}\/\S+$/, { name: 'DOI' }),
    }),
    defineField({
      name: 'pmid',
      title: 'PMID',
      type: 'string',
      validation: (r) => r.regex(/^\d{1,9}$/, { name: 'PMID' }),
    }),
    defineField({ name: 'publicationDate', type: 'date' }),
    defineField({ name: 'accessedAt', type: 'date' }),
    defineField({ name: 'notes', type: 'text', rows: 2 }),
  ],
  validation: (r) =>
    r.custom((doc) => {
      const d = doc as
        { url?: string; doi?: string; pmid?: string; sourceType?: string } | undefined;
      if (!d || d.sourceType === 'product_label' || d.sourceType === 'marketplace') return true;
      return d.url || d.doi || d.pmid
        ? true
        : 'Add a URL, DOI or PMID so readers can check this source.';
    }),
  preview: { select: { title: 'title', subtitle: 'publisher' } },
});

export const claim = defineType({
  name: 'claim',
  title: 'Claim',
  type: 'document',
  groups: editorialGroups,
  description:
    'A claim made on or about the product, quoted verbatim, and our neutral assessment of it.',
  fields: [
    defineField({
      name: 'product',
      type: 'reference',
      to: [{ type: 'product' }],
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'exactClaim',
      title: 'Exact claim (verbatim)',
      type: 'string',
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'claimSourceType',
      title: 'Claim source',
      type: 'string',
      group: 'content',
      options: { list: SOURCE_KIND },
      description:
        'CLAIM SOURCE: where the brand makes this claim. Evidence sources are listed separately below.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'claimSourceLocator',
      type: 'string',
      group: 'content',
      description: 'e.g. "Front of pack", "Product page → highlights".',
    }),
    defineField({
      name: 'claimType',
      type: 'string',
      group: 'content',
      options: { list: CLAIM_TYPE },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'locationOnProduct',
      type: 'string',
      group: 'content',
      description: 'e.g. Front label, Back label, Listing title',
    }),
    defineField({
      name: 'assessmentStatus',
      type: 'string',
      group: 'content',
      options: { list: ASSESSMENT_STATUS, layout: 'radio' },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'assessment',
      title: 'Assessment (one line)',
      type: 'string',
      group: 'content',
      description: 'Neutral, precise. Avoid words like "scam", "fake", "toxic".',
      validation: (r) => [r.required().max(220), r.custom(languageWarning).warning()],
    }),
    defineField({
      name: 'explanation',
      type: 'text',
      rows: 4,
      group: 'content',
      description:
        'Context for the reader. Never imply laboratory testing unless a linked test report exists.',
      validation: (r) => r.custom(languageWarning).warning(),
    }),
    defineField({
      name: 'evidence',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'evidence' })],
      validation: requiredAfterDraft('Add at least one piece of evidence before fact check.'),
    }),
    defineField({
      name: 'sources',
      title: 'Evidence sources',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'source' }] })],
      validation: requiredAfterDraft('Cite at least one source before fact check.'),
    }),
    defineField({
      name: 'researchStatus',
      title: 'Evidence research',
      type: 'string',
      group: 'content',
      options: { list: RESEARCH_STATUS, layout: 'radio' },
      initialValue: 'NEEDS_EVIDENCE',
      description:
        'A claim is not a label fact. It needs evidence research before any assessment is published.',
      validation: (r) =>
        r.required().custom((v, ctx) => {
          const status = (ctx.document as { workflowStatus?: string })?.workflowStatus;
          const late = ['APPROVED', 'PUBLISHED', 'NEEDS_REVIEW'].includes(status ?? '');
          return late &&
            !['EVIDENCE_IDENTIFIED', 'INSUFFICIENT_EVIDENCE_IDENTIFIED'].includes(String(v))
            ? 'Complete evidence research before approval.'
            : true;
        }),
    }),
    defineField({ name: 'order', type: 'number', group: 'content' }),
    defineField({
      name: 'observedAt',
      title: 'Claim observed on',
      type: 'datetime',
      group: 'content',
      description: 'When the claim was seen on the label/listing (the label capture date).',
    }),
    defineField({
      name: 'observation',
      title: 'Observation of this claim',
      type: 'reference',
      group: 'content',
      to: [{ type: 'observation' }],
      options: { filter: 'type == "front_label_claim" || type == "label_text"' },
      description:
        'The dated front-label/label-text observation recording where this claim appears.',
    }),
    defineField({
      name: 'status',
      title: 'Label version status',
      type: 'string',
      group: 'content',
      options: { list: ['current', 'superseded'], layout: 'radio' },
      initialValue: 'current',
      description:
        'When the label changes and this claim no longer appears (or is reworded), mark it superseded instead of editing or deleting it.',
    }),
    defineField({
      name: 'supersededAt',
      type: 'datetime',
      group: 'content',
      hidden: ({ document }) => document?.status !== 'superseded',
      validation: (r) =>
        r.custom((v, ctx) =>
          (ctx.document as { status?: string })?.status === 'superseded' && !v
            ? 'When was this claim superseded?'
            : true,
        ),
    }),
    defineField({
      name: 'reviewer',
      type: 'reference',
      to: [{ type: 'reviewer' }],
      group: 'workflow',
      validation: requiredWhenApproved('A reviewer is required before approval.'),
    }),
    defineField({
      name: 'reviewedAt',
      type: 'datetime',
      group: 'workflow',
      validation: requiredWhenApproved('Review date is required before approval.'),
    }),
    ...editorialFields,
  ],
  preview: {
    select: { title: 'exactClaim', product: 'product.name', status: 'assessmentStatus' },
    prepare: ({ title, product, status }) => ({
      title: `“${title}”`,
      subtitle: `${product ?? '—'} · ${status}`,
    }),
  },
});
