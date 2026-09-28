import { defineArrayMember, defineField, defineType } from 'sanity';
import { editorialFields, editorialGroups, requiredAfterDraft } from '../../lib/fields';
import { requireApprovedReview } from '../../lib/validation';

export const ingredient = defineType({
  name: 'ingredient',
  title: 'Ingredient',
  type: 'document',
  groups: editorialGroups,
  description: 'Reference page. No disease-treatment claims; describe evidence, not promises.',
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
    defineField({
      name: 'summary',
      type: 'text',
      rows: 2,
      group: 'content',
      validation: (r) => r.required().max(240),
    }),
    defineField({
      name: 'commonLabelNames',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'string' })],
      options: { layout: 'tags' },
    }),
    defineField({
      name: 'featured',
      title: 'Feature on homepage',
      type: 'boolean',
      group: 'content',
      initialValue: false,
    }),
    defineField({ name: 'overview', type: 'blockContent', group: 'content' }),
    defineField({ name: 'whyInSupplements', type: 'blockContent', group: 'content' }),
    defineField({
      name: 'forms',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'ingredientForm' })],
    }),
    defineField({
      name: 'findings',
      title: 'Evidence findings',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'evidenceFinding' })],
    }),
    defineField({
      name: 'studiedDoses',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'studiedDose' })],
    }),
    defineField({
      name: 'safety',
      title: 'Safety & context',
      type: 'blockContent',
      group: 'content',
    }),
    defineField({
      name: 'buyingNotes',
      title: 'What to know before buying',
      type: 'blockContent',
      group: 'content',
    }),
    defineField({
      name: 'sources',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'source' }] })],
      validation: requiredAfterDraft('Cite at least one source before fact check.'),
    }),
    ...editorialFields,
  ],
  validation: (r) => r.custom(requireApprovedReview),
  preview: { select: { title: 'name', subtitle: 'workflowStatus' } },
});

export const reviewer = defineType({
  name: 'reviewer',
  title: 'Reviewer',
  type: 'document',
  description:
    'A real, qualified person. Never create a reviewer for someone who has not agreed to review.',
  fields: [
    defineField({ name: 'name', type: 'string', validation: (r) => r.required() }),
    defineField({
      name: 'credentials',
      type: 'string',
      description: 'e.g. "MSc, Registered Dietitian"',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'organization', type: 'string' }),
    defineField({ name: 'bio', type: 'text', rows: 4 }),
    defineField({ name: 'photo', type: 'imageWithAlt' }),
    defineField({
      name: 'profileSlug',
      type: 'slug',
      options: { source: 'name' },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'isPlaceholder',
      type: 'boolean',
      initialValue: false,
      description:
        'Development only. Placeholder reviewers are labelled and never emitted as a Person in structured data.',
    }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  preview: { select: { title: 'name', subtitle: 'credentials', media: 'photo' } },
});

export const editorialReview = defineType({
  name: 'editorialReview',
  title: 'Editorial review',
  type: 'document',
  description:
    'A dated review record. The site shows the latest approved review on the reviewed page.',
  fields: [
    defineField({
      name: 'content',
      title: 'Reviewed document',
      type: 'reference',
      weak: true,
      to: [{ type: 'product' }, { type: 'ingredient' }, { type: 'guide' }, { type: 'comparison' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'reviewer',
      type: 'reference',
      to: [{ type: 'reviewer' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'scope',
      type: 'string',
      options: { list: ['fact_check', 'dietitian_review', 'editorial'] },
      initialValue: 'dietitian_review',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'status',
      type: 'string',
      options: { list: ['approved', 'changes_requested', 'in_review'], layout: 'radio' },
      initialValue: 'in_review',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'reviewedAt',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'nextReviewAt',
      type: 'datetime',
      description: 'Every page is re-reviewed at least every 12 months.',
      initialValue: () => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 1);
        return d.toISOString();
      },
      validation: (r) =>
        r.required().custom((next, ctx) => {
          const reviewed = (ctx.document as { reviewedAt?: string })?.reviewedAt;
          if (!next || !reviewed) return true;
          const gapDays = (Date.parse(next as string) - Date.parse(reviewed)) / 86_400_000;
          if (gapDays <= 0) return 'Next review must be after the review date.';
          if (gapDays > 366) return 'Next review must be within 12 months of the review date.';
          return true;
        }),
    }),
    defineField({ name: 'notes', type: 'text', rows: 3 }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  preview: {
    select: {
      title: 'content.name',
      alt: 'content.title',
      reviewer: 'reviewer.name',
      status: 'status',
      date: 'reviewedAt',
    },
    prepare: ({ title, alt, reviewer, status, date }) => ({
      title: title ?? alt ?? 'Review',
      subtitle: `${status} · ${reviewer ?? '—'} · ${date?.slice(0, 10) ?? ''}`,
    }),
  },
});
