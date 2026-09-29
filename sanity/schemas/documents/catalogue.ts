import { defineArrayMember, defineField, defineType } from 'sanity';
import { FORMATS, MARKET_STATUS, VEG_STATUS } from '../../lib/constants';
import { editorialFields, editorialGroups, requiredAfterDraft } from '../../lib/fields';
import {
  languageWarning,
  requireApprovedReview,
  requireLabelEvidence,
  requireVegEvidence,
} from '../../lib/validation';

export const brand = defineType({
  name: 'brand',
  title: 'Brand',
  type: 'document',
  groups: editorialGroups,
  fields: [
    defineField({
      name: 'name',
      type: 'string',
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      group: 'content',
      options: { source: 'name' },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'description', type: 'text', rows: 3, group: 'content' }),
    defineField({ name: 'websiteUrl', type: 'url', group: 'content' }),
    defineField({ name: 'countryOfOrigin', type: 'string', group: 'content' }),
    ...editorialFields,
  ],
  preview: { select: { title: 'name', subtitle: 'workflowStatus' } },
});

export const category = defineType({
  name: 'category',
  title: 'Category',
  type: 'document',
  fields: [
    defineField({ name: 'name', type: 'string', validation: (r) => r.required() }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: { source: 'name' },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'description', type: 'text', rows: 3 }),
    defineField({ name: 'parent', type: 'reference', to: [{ type: 'category' }] }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
});

export const product = defineType({
  name: 'product',
  title: 'Product',
  type: 'document',
  groups: [
    { name: 'content', title: 'Product', default: true },
    { name: 'label', title: 'Label & veg' },
    ...editorialGroups.slice(1),
  ],
  description:
    'Label panels, claims, observations and prices are separate documents that reference this product.',
  fields: [
    defineField({
      name: 'brand',
      type: 'reference',
      to: [{ type: 'brand' }],
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'name',
      type: 'string',
      group: 'content',
      description: 'Without the brand, e.g. "Whey Protein, Rich Chocolate".',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      group: 'content',
      options: {
        // "<brand> <name>" so slugs stay unique across brands.
        source: async (doc, { getClient }) => {
          const d = doc as { name?: string; brand?: { _ref?: string } };
          const brandName = d.brand?._ref
            ? await getClient({ apiVersion: '2025-02-19' }).fetch<string | null>(
                '*[_id == $id][0].name',
                { id: d.brand._ref },
              )
            : null;
          return [brandName, d.name].filter(Boolean).join(' ');
        },
        maxLength: 96,
      },
      description: 'Include the brand: e.g. "specimen-nutrition-whey-protein-rich-chocolate".',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'variant',
      type: 'string',
      group: 'content',
      description:
        'Flavour or strength, e.g. "Dark Chocolate", "5 mg". Different flavours are usually separate products.',
    }),
    defineField({
      name: 'category',
      type: 'reference',
      to: [{ type: 'category' }],
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'subcategory', type: 'string', group: 'content' }),
    defineField({
      name: 'format',
      type: 'string',
      group: 'content',
      options: { list: FORMATS },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'description',
      type: 'text',
      rows: 3,
      group: 'content',
      description: 'Factual, neutral summary. No health claims.',
      validation: (r) => r.custom(languageWarning).warning(),
    }),
    defineField({
      name: 'aliases',
      title: 'Other names',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'string' })],
      options: { layout: 'tags' },
      description:
        'Former or alternate names (renames, marketplace titles). Used for search and matching.',
    }),
    defineField({
      name: 'marketStatus',
      type: 'string',
      group: 'content',
      options: { list: MARKET_STATUS, layout: 'radio' },
      initialValue: 'available',
      description: 'Discontinued products stay published with a notice; never delete them.',
    }),
    defineField({
      name: 'discontinuedAt',
      type: 'date',
      group: 'content',
      hidden: ({ document }) => document?.marketStatus !== 'discontinued',
    }),
    defineField({
      name: 'featured',
      title: 'Feature on homepage',
      type: 'boolean',
      group: 'content',
      initialValue: false,
    }),
    defineField({
      name: 'serving',
      title: 'Serving (structured)',
      type: 'servingSpec',
      group: 'label',
      description: 'e.g. 1 × scoop (35.5 g), 2 × capsule.',
      validation: requiredAfterDraft('Structured serving is required before fact check.'),
    }),
    defineField({
      name: 'servingSize',
      type: 'quantity',
      group: 'label',
      validation: requiredAfterDraft('Serving size is required before fact check.'),
    }),
    defineField({
      name: 'servingSizeText',
      title: 'Serving size as printed',
      type: 'string',
      group: 'label',
    }),
    defineField({
      name: 'servingsPerContainer',
      type: 'number',
      group: 'label',
      description: 'Leave empty if not printed. The site will derive it from pack size and say so.',
    }),
    defineField({
      name: 'vegStatus',
      type: 'string',
      group: 'label',
      options: { list: VEG_STATUS, layout: 'radio' },
      initialValue: 'UNKNOWN',
      description:
        'Never infer from the absence of meat ingredients. Vegetarian/Non-vegetarian needs the label mark or an explicit ingredient (e.g. gelatin) recorded as an observation. Vegan needs an explicit vegan statement. Otherwise use Unknown.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'vegStatusReason',
      type: 'text',
      rows: 2,
      group: 'label',
      description:
        'e.g. "Contains gelatin." / "Could not be verified from available label information."',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'countryOfOrigin', type: 'string', group: 'label' }),
    defineField({ name: 'manufacturer', type: 'string', group: 'label' }),
    defineField({
      name: 'labelImages',
      type: 'array',
      group: 'label',
      of: [defineArrayMember({ type: 'imageWithAlt' })],
      description:
        'Dated photos of every panel. Required before fact check (not for demo content), unless the current label panel was transcribed from a confirmed submitted pack photo (kept private).',
      validation: (r) => r.custom(requireLabelEvidence),
    }),
    defineField({ name: 'firstPublishedAt', type: 'datetime', group: 'workflow' }),
    defineField({
      name: 'lastVerifiedAt',
      title: 'Label last verified',
      type: 'datetime',
      group: 'workflow',
      validation: requiredAfterDraft('Record when the label was last verified.'),
    }),
    ...editorialFields,
  ],
  validation: (r) => [r.custom(requireApprovedReview), r.custom(requireVegEvidence)],
  orderings: [
    {
      title: 'Recently updated',
      name: 'updatedDesc',
      by: [{ field: '_updatedAt', direction: 'desc' }],
    },
    { title: 'Name', name: 'nameAsc', by: [{ field: 'name', direction: 'asc' }] },
  ],
  preview: {
    select: {
      title: 'name',
      brand: 'brand.name',
      status: 'workflowStatus',
      media: 'labelImages.0',
    },
    prepare: ({ title, brand, status, media }) => ({
      title,
      subtitle: `${brand ?? '—'} · ${status ?? ''}`,
      media,
    }),
  },
});
