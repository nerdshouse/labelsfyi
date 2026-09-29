import { defineArrayMember, defineField, defineType } from 'sanity';
import { DEPICTS, IMAGE_KIND } from '../../lib/constants';

/**
 * Label submissions from labels.fyi/submit (docs/submissions.md).
 *
 * PRIVATE. Never queried by the site. Submitter name/contact are internal and
 * must never be copied into products, observations, sources or panels. Photos
 * live in a private R2 bucket under opaque keys; only the key is stored here.
 * Written by the submission API and the internal review screen, which is
 * where review happens. Studio shows the record read-only for reference.
 */

const SUBMISSION_STATUS = [
  { title: 'Received', value: 'RECEIVED' },
  { title: 'Needs review', value: 'NEEDS_REVIEW' },
  { title: 'In review', value: 'IN_REVIEW' },
  { title: 'Verified (sent to editorial)', value: 'VERIFIED' },
  { title: 'Published', value: 'PUBLISHED' },
  { title: 'Rejected', value: 'REJECTED' },
];

export const submissionImage = defineType({
  name: 'submissionImage',
  title: 'Submitted photo',
  type: 'object',
  readOnly: true,
  fields: [
    defineField({
      name: 'storageKey',
      type: 'string',
      description: 'Opaque key in the private submissions bucket. Not a public URL.',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'contentType', type: 'string' }),
    defineField({ name: 'bytes', type: 'number' }),
    defineField({ name: 'sha256', type: 'string' }),
    defineField({
      name: 'role',
      type: 'string',
      options: { list: ['front', 'facts', 'additional'] },
      description: 'What the submitter said the photo shows. Not proof.',
    }),
    defineField({ name: 'imageKind', type: 'string', options: { list: IMAGE_KIND } }),
    defineField({ name: 'depictsExactProduct', type: 'string', options: { list: DEPICTS } }),
    defineField({ name: 'depictsConfirmedBy', type: 'string' }),
    defineField({ name: 'depictsConfirmedAt', type: 'datetime' }),
  ],
  preview: {
    select: { role: 'role', kind: 'imageKind', depicts: 'depictsExactProduct' },
    prepare: ({ role, kind, depicts }) => ({
      title: `${role} photo`,
      subtitle: `${kind} · ${depicts}`,
    }),
  },
});

export const labelSubmission = defineType({
  name: 'labelSubmission',
  title: 'Label submission',
  type: 'document',
  readOnly: true,
  description:
    'A label someone submitted via /submit. Review it on the internal review screen (/internal/review). Nothing here is published.',
  fields: [
    defineField({ name: 'status', type: 'string', options: { list: SUBMISSION_STATUS } }),
    defineField({ name: 'submittedAt', type: 'datetime' }),
    defineField({ name: 'brand', title: 'Brand (as typed)', type: 'string' }),
    defineField({ name: 'productName', title: 'Product (as typed)', type: 'string' }),
    defineField({ name: 'variant', title: 'Variant (as typed)', type: 'string' }),
    defineField({ name: 'productUrl', title: 'Product URL (as typed)', type: 'url' }),
    defineField({
      name: 'images',
      type: 'array',
      of: [defineArrayMember({ type: 'submissionImage' })],
    }),
    defineField({
      name: 'ingestionCandidate',
      type: 'reference',
      to: [{ type: 'ingestionCandidate' }],
    }),
    defineField({ name: 'product', type: 'reference', to: [{ type: 'product' }] }),
    defineField({
      name: 'updateOfProduct',
      title: 'Submitted as an update of (slug)',
      type: 'string',
    }),
    defineField({ name: 'rejectionReason', type: 'string' }),
    defineField({ name: 'reviewedBy', type: 'string' }),
    defineField({ name: 'reviewedAt', type: 'datetime' }),
    defineField({
      name: 'submitterName',
      title: 'Submitter name (internal)',
      type: 'string',
      group: 'private',
    }),
    defineField({
      name: 'submitterContact',
      title: 'Submitter contact (internal)',
      type: 'string',
      group: 'private',
      description: 'Private. Never published or copied into any other document.',
    }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  groups: [{ name: 'private', title: 'Private (internal only)' }],
  orderings: [
    {
      title: 'Submitted, newest',
      name: 'submittedDesc',
      by: [{ field: 'submittedAt', direction: 'desc' }],
    },
  ],
  preview: {
    select: { brand: 'brand', name: 'productName', status: 'status', date: 'submittedAt' },
    prepare: ({ brand, name, status, date }) => ({
      title: `${brand ?? '—'} · ${name ?? '—'}`,
      subtitle: `${status} · ${date?.slice(0, 10) ?? ''}`,
    }),
  },
});

export const submissionTypes = [submissionImage, labelSubmission];
