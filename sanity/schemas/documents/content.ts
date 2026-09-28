import { defineArrayMember, defineField, defineType } from 'sanity';
import { editorialFields, editorialGroups } from '../../lib/fields';
import { requireApprovedReview } from '../../lib/validation';

export const guide = defineType({
  name: 'guide',
  title: 'Guide',
  type: 'document',
  groups: editorialGroups,
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      group: 'content',
      options: { source: 'title' },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'dek', title: 'Standfirst', type: 'text', rows: 2, group: 'content' }),
    defineField({ name: 'publishedAt', type: 'datetime', group: 'content' }),
    defineField({
      name: 'body',
      type: 'blockContent',
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'sources',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'source' }] })],
    }),
    defineField({
      name: 'relatedIngredients',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'ingredient' }] })],
    }),
    defineField({
      name: 'relatedProducts',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'product' }] })],
    }),
    ...editorialFields,
  ],
  validation: (r) => r.custom(requireApprovedReview),
  preview: { select: { title: 'title', subtitle: 'workflowStatus' } },
});

export const comparison = defineType({
  name: 'comparison',
  title: 'Comparison',
  type: 'document',
  groups: editorialGroups,
  description: 'Tables are generated from product data. Never type numbers into the intro.',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      group: 'content',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      group: 'content',
      options: { source: 'title' },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'dek', type: 'text', rows: 2, group: 'content' }),
    defineField({
      name: 'category',
      type: 'reference',
      to: [{ type: 'category' }],
      group: 'content',
    }),
    defineField({
      name: 'products',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'product' }] })],
      validation: (r) => r.min(2).unique(),
    }),
    defineField({ name: 'doseBasis', type: 'doseBasis', group: 'content' }),
    defineField({ name: 'intro', type: 'blockContent', group: 'content' }),
    defineField({ name: 'methodology', type: 'blockContent', group: 'content' }),
    ...editorialFields,
  ],
  validation: (r) => r.custom(requireApprovedReview),
  preview: { select: { title: 'title', subtitle: 'workflowStatus' } },
});
