import { defineArrayMember, defineField, defineType } from 'sanity';
import {
  BRAND_RESPONSE_RESOLUTION,
  CONTACT_METHOD,
  DISCREPANCY_STATUS,
  SEVERITY,
} from '../../lib/constants';
import { editorialFields, editorialGroups, requiredWhenApproved } from '../../lib/fields';
import { languageWarning, lockedAfterWindow } from '../../lib/validation';

/**
 * Discrepancy: two or more sources state different values for the same fact.
 * Every original value is preserved; nothing is overwritten. Severity is an
 * attention level, never a finding of wrongdoing. Publishing goes through the
 * normal workflow and needs a named reviewer.
 */
export const discrepancy = defineType({
  name: 'discrepancy',
  title: 'Discrepancy',
  type: 'document',
  groups: editorialGroups,
  fields: [
    defineField({
      name: 'product',
      type: 'reference',
      to: [{ type: 'product' }],
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'field',
      type: 'string',
      group: 'content',
      description: 'The fact in question, e.g. "Vitamin C %RDA", "Manufacturer licence".',
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'values',
      title: 'Values by source',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'discrepancyValue' })],
      description:
        'Record each source’s value exactly. Values lock 24 h after creation; add a new discrepancy rather than editing.',
      validation: (r) => r.required().min(2),
    }),
    defineField({
      name: 'status',
      type: 'string',
      group: 'content',
      options: { list: DISCREPANCY_STATUS },
      initialValue: 'OPEN',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'severity',
      type: 'string',
      group: 'content',
      options: { list: SEVERITY, layout: 'radio' },
      initialValue: 'INFORMATIONAL',
      description:
        'How much the difference matters to a reader, not a judgement of intent. Avoid words like "misleading" or "fake".',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'detectedAt',
      type: 'datetime',
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'detectedBy',
      type: 'string',
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'notes',
      type: 'text',
      rows: 3,
      group: 'content',
      validation: (r) => r.custom(languageWarning).warning(),
    }),
    defineField({
      name: 'resolvedAt',
      type: 'datetime',
      group: 'content',
      hidden: ({ document }) => document?.status !== 'RESOLVED',
    }),
    defineField({
      name: 'resolvedBy',
      type: 'string',
      group: 'content',
      hidden: ({ document }) => document?.status !== 'RESOLVED',
      description:
        'The editor who decided the resolution. A brand response alone never resolves a discrepancy.',
    }),
    defineField({
      name: 'resolutionNote',
      type: 'text',
      rows: 2,
      group: 'content',
      hidden: ({ document }) => document?.status !== 'RESOLVED',
    }),
    defineField({
      name: 'supersededBy',
      type: 'reference',
      to: [{ type: 'discrepancy' }],
      group: 'content',
      hidden: ({ document }) => document?.status !== 'SUPERSEDED',
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
  validation: (r) =>
    r.custom((doc) => {
      const d = doc as
        | { status?: string; resolvedAt?: string; resolvedBy?: string; resolutionNote?: string }
        | undefined;
      if (d?.status === 'RESOLVED' && (!d.resolvedAt || !d.resolvedBy || !d.resolutionNote))
        return 'A resolved discrepancy needs a date, the editor who resolved it, and a note.';
      return true;
    }),
  orderings: [
    {
      title: 'Detected, newest',
      name: 'detectedDesc',
      by: [{ field: 'detectedAt', direction: 'desc' }],
    },
  ],
  preview: {
    select: { field: 'field', product: 'product.name', status: 'status', severity: 'severity' },
    prepare: ({ field, product, status, severity }) => ({
      title: `${product ?? '—'}: ${field}`,
      subtitle: `${status} · ${severity}`,
    }),
  },
});

/**
 * BrandResponse: provenance and clarification from a brand. It is evidence,
 * not approval: a response never edits facts or resolves a discrepancy by
 * itself. Brand response → human verification → editorial workflow.
 */
export const brandResponse = defineType({
  name: 'brandResponse',
  title: 'Brand response',
  type: 'document',
  groups: editorialGroups,
  fields: [
    defineField({
      name: 'product',
      type: 'reference',
      to: [{ type: 'product' }],
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'discrepancy',
      type: 'reference',
      to: [{ type: 'discrepancy' }],
      group: 'content',
    }),
    defineField({
      name: 'contactedAt',
      type: 'datetime',
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'contactMethod',
      type: 'string',
      group: 'content',
      options: { list: CONTACT_METHOD },
    }),
    defineField({
      name: 'contactAddress',
      type: 'string',
      group: 'content',
      description:
        'The brand’s official contact used (e.g. care@…). Internal only; never shown on the site.',
    }),
    defineField({
      name: 'question',
      type: 'text',
      rows: 3,
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'response',
      title: 'Response (as received)',
      type: 'text',
      rows: 5,
      group: 'content',
    }),
    defineField({ name: 'respondedAt', type: 'datetime', group: 'content' }),
    defineField({
      name: 'respondentName',
      type: 'string',
      group: 'content',
      description: 'Internal only.',
    }),
    defineField({ name: 'respondentRole', type: 'string', group: 'content' }),
    defineField({
      name: 'supportingSources',
      type: 'array',
      group: 'content',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{ type: 'source' }, { type: 'sourceSnapshot' }],
        }),
      ],
      description: 'e.g. a label file or certificate the brand supplied, recorded as a source.',
    }),
    defineField({
      name: 'resolution',
      title: 'Brand’s stated resolution',
      type: 'string',
      group: 'content',
      options: { list: BRAND_RESPONSE_RESOLUTION },
      description:
        'What the brand says. It does not change the discrepancy status. An editor decides that separately.',
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
    select: { product: 'product.name', resolution: 'resolution', date: 'respondedAt' },
    prepare: ({ product, resolution, date }) => ({
      title: `${product ?? '—'}: brand response`,
      subtitle: `${resolution ?? 'no response yet'} · ${date?.slice(0, 10) ?? ''}`,
    }),
  },
});
