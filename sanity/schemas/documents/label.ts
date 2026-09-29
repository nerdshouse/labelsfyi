import { defineArrayMember, defineField, defineType } from 'sanity';
import {
  EXTRACTION_METHOD,
  OBSERVATION_TYPE,
  PANEL_SOURCE_KIND,
  PANEL_TYPE,
  SOURCE_KIND,
  VERIFICATION_STATUS,
} from '../../lib/constants';
import { lockedAfterWindow, validatePanelImage } from '../../lib/validation';

export const labelPanel = defineType({
  name: 'labelPanel',
  title: 'Label panel',
  type: 'document',
  description:
    'A transcription of one panel of a product label at a point in time. When the label changes or the product is reformulated, create new panels (Current), mark the old ones Superseded and record a “Label change” observation. Never edit old panels to match a new label.',
  fields: [
    defineField({
      name: 'product',
      type: 'reference',
      to: [{ type: 'product' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'panelType',
      type: 'string',
      options: { list: PANEL_TYPE },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'title',
      type: 'string',
      description: 'As printed, e.g. "Nutrition information".',
    }),
    defineField({
      name: 'sourceType',
      title: 'Label evidence basis',
      type: 'string',
      options: { list: PANEL_SOURCE_KIND, layout: 'radio' },
      description:
        'Physical pack or brand-supplied label file is strongest. Artwork must reference a classified image confirmed to depict this exact product. Website copy is never label evidence.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'sourceImage',
      title: 'Transcribed from image',
      type: 'object',
      fields: [
        defineField({ name: 'snapshot', type: 'reference', to: [{ type: 'sourceSnapshot' }] }),
        defineField({
          name: 'submission',
          title: 'Label submission',
          type: 'reference',
          to: [{ type: 'labelSubmission' }],
          description: 'For panels transcribed from photos submitted via /submit.',
        }),
        defineField({
          name: 'imageKey',
          title: 'Image key on snapshot/submission',
          type: 'string',
        }),
      ],
      validation: (r) => r.custom(validatePanelImage),
    }),
    defineField({
      name: 'status',
      type: 'string',
      options: { list: ['current', 'superseded'], layout: 'radio' },
      initialValue: 'current',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'supersedes',
      title: 'Supersedes panels',
      type: 'array',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'labelPanel' }] })],
      description:
        'Earlier panels this label replaces. The site treats them as superseded once this panel is approved (see docs/submissions.md), so old panels are never edited early.',
    }),
    defineField({
      name: 'verifiedAt',
      type: 'datetime',
      description:
        'When a person verified this transcription. Panels from label submissions render only after an approved review dated at or after this.',
    }),
    defineField({ name: 'serving', title: 'Serving (structured)', type: 'servingSpec' }),
    defineField({ name: 'servingSize', type: 'quantity' }),
    defineField({ name: 'servingSizeText', type: 'string' }),
    defineField({ name: 'servingsPerContainer', type: 'number' }),
    defineField({
      name: 'per100Basis',
      title: 'Per-100 column basis',
      type: 'string',
      options: { list: ['g', 'ml'] },
    }),
    defineField({
      name: 'nutrients',
      type: 'array',
      of: [defineArrayMember({ type: 'labelNutrient' })],
    }),
    defineField({
      name: 'ingredients',
      type: 'array',
      of: [defineArrayMember({ type: 'labelIngredient' })],
    }),
    defineField({
      name: 'ingredientsText',
      title: 'Ingredient list as printed',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'text',
      title: 'Panel text (directions, warnings…)',
      type: 'text',
      rows: 4,
    }),
    defineField({ name: 'capturedAt', type: 'datetime', validation: (r) => r.required() }),
    defineField({
      name: 'snapshot',
      title: 'Source snapshot',
      type: 'reference',
      to: [{ type: 'sourceSnapshot' }],
      description: 'If transcribed from a captured web page/image rather than a physical pack.',
    }),
    defineField({
      name: 'capturedBy',
      title: 'Captured / transcribed by',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'source',
      type: 'reference',
      to: [{ type: 'source' }],
      validation: (r) => r.required(),
    }),
    defineField({ name: 'image', title: 'Panel photo', type: 'imageWithAlt' }),
    defineField({ name: 'notes', type: 'text', rows: 2 }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  orderings: [
    {
      title: 'Captured, newest',
      name: 'capturedDesc',
      by: [{ field: 'capturedAt', direction: 'desc' }],
    },
  ],
  preview: {
    select: {
      title: 'title',
      type: 'panelType',
      product: 'product.name',
      status: 'status',
      date: 'capturedAt',
    },
    prepare: ({ title, type, product, status, date }) => ({
      title: `${product ?? '—'}: ${title ?? type}`,
      subtitle: `${status} · captured ${date?.slice(0, 10) ?? '—'}`,
    }),
  },
});

export const observation = defineType({
  name: 'observation',
  title: 'Observation',
  type: 'document',
  description:
    'An auditable factual record ("Front label states 30 g protein"). Append-only: factual fields lock 24 hours after creation. To correct one, create a new observation and set "Superseded by" on the old one. Delete is disabled.',
  fields: [
    defineField({
      readOnly: lockedAfterWindow,
      name: 'product',
      type: 'reference',
      to: [{ type: 'product' }],
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'type',
      type: 'string',
      options: { list: OBSERVATION_TYPE },
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'value',
      type: 'text',
      rows: 2,
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'source',
      type: 'reference',
      to: [{ type: 'source' }],
      validation: (r) => r.required(),
    }),
    defineField({ readOnly: lockedAfterWindow, name: 'sourceImage', type: 'imageWithAlt' }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'observedAt',
      type: 'datetime',
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'observedBy',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'snapshot',
      title: 'Source snapshot',
      type: 'reference',
      to: [{ type: 'sourceSnapshot' }],
      description: 'The captured page this was observed on, if it came from a website.',
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'submission',
      title: 'Label submission',
      type: 'reference',
      to: [{ type: 'labelSubmission' }],
      description:
        'The submitted photos this was read from. Internal provenance: submitter details are never rendered.',
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'extractedFrom',
      title: 'Extracted from candidate',
      type: 'reference',
      to: [{ type: 'ingestionCandidate' }],
      description:
        'Set when this observation confirms an ingested fact. Requires a named verifier.',
    }),
    defineField({
      name: 'verifiedBy',
      type: 'string',
      description: 'The person who independently checked this against the label or source.',
      validation: (r) =>
        r.custom((v, ctx) =>
          (ctx.document as { extractedFrom?: unknown })?.extractedFrom && !v
            ? 'Observations from ingested data must name the person who verified them.'
            : true,
        ),
    }),
    defineField({
      name: 'verifiedAt',
      type: 'datetime',
      validation: (r) =>
        r.custom((v, ctx) =>
          (ctx.document as { extractedFrom?: unknown })?.extractedFrom && !v
            ? 'When was this verified?'
            : true,
        ),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'sourceType',
      type: 'string',
      options: { list: SOURCE_KIND },
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'sourceLocator',
      type: 'string',
      description:
        'Short pointer, e.g. "gallery image 7 → supplement facts → magnesium". No page excerpts.',
      validation: (r) => r.max(200),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'extractionMethod',
      type: 'string',
      options: { list: EXTRACTION_METHOD },
      initialValue: 'manual',
    }),
    defineField({
      name: 'verificationStatus',
      type: 'string',
      options: { list: VERIFICATION_STATUS, layout: 'radio' },
      initialValue: 'unverified',
      description: 'Only verified observations are shown on the site.',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'notes', type: 'text', rows: 2 }),
    defineField({ name: 'supersededBy', type: 'reference', to: [{ type: 'observation' }] }),
    defineField({ name: 'supersededAt', type: 'datetime' }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  preview: {
    select: { title: 'value', type: 'type', date: 'observedAt', superseded: 'supersededAt' },
    prepare: ({ title, type, date, superseded }) => ({
      title,
      subtitle: `${type} · ${date?.slice(0, 10) ?? ''}${superseded ? ' · superseded' : ''}`,
    }),
  },
});
