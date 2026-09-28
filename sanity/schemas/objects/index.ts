import { defineArrayMember, defineField, defineType } from 'sanity';
import { ASSESSMENT_STATUS, NUTRIENT_KEYS, UNITS } from '../../lib/constants';

export const quantity = defineType({
  name: 'quantity',
  title: 'Quantity',
  type: 'object',
  options: { columns: 2 },
  fields: [
    defineField({ name: 'amount', type: 'number', validation: (r) => r.required().min(0) }),
    defineField({
      name: 'unit',
      type: 'string',
      options: { list: UNITS },
      validation: (r) => r.required(),
    }),
  ],
});

export const imageWithAlt = defineType({
  name: 'imageWithAlt',
  title: 'Image',
  type: 'image',
  options: { hotspot: true },
  fields: [
    defineField({
      name: 'alt',
      title: 'Alt text',
      type: 'string',
      description: 'Describe what the image shows, e.g. "Back label showing the nutrition panel".',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'caption', type: 'string' }),
  ],
});

export const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  fields: [
    defineField({ name: 'title', type: 'string', validation: (r) => r.max(65) }),
    defineField({ name: 'description', type: 'text', rows: 2, validation: (r) => r.max(160) }),
  ],
});

export const blockContent = defineType({
  name: 'blockContent',
  title: 'Rich text',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        { title: 'Normal', value: 'normal' },
        { title: 'Heading', value: 'h2' },
        { title: 'Subheading', value: 'h3' },
        { title: 'Quote', value: 'blockquote' },
      ],
      marks: {
        decorators: [
          { title: 'Strong', value: 'strong' },
          { title: 'Emphasis', value: 'em' },
        ],
        annotations: [
          defineArrayMember({
            name: 'link',
            type: 'object',
            fields: [
              defineField({
                name: 'href',
                type: 'url',
                validation: (r) =>
                  r.uri({ allowRelative: true, scheme: ['http', 'https', 'mailto'] }),
              }),
            ],
          }),
        ],
      },
    }),
  ],
});

export const labelNutrient = defineType({
  name: 'labelNutrient',
  title: 'Nutrient row',
  type: 'object',
  fields: [
    defineField({
      name: 'name',
      type: 'string',
      description: 'As printed, e.g. "Protein".',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'nutrientKey',
      type: 'string',
      options: { list: NUTRIENT_KEYS },
      description: 'Used for calculations (e.g. cost per 25 g protein).',
    }),
    defineField({
      name: 'unit',
      type: 'string',
      options: { list: UNITS },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'perServing', type: 'number', description: 'Leave empty if not printed.' }),
    defineField({ name: 'per100', title: 'Per 100 g / ml', type: 'number' }),
    defineField({ name: 'dailyValuePercent', title: '% daily value / RDA', type: 'number' }),
    defineField({
      name: 'indent',
      type: 'number',
      initialValue: 0,
      description: '1 for sub-rows like "of which sugars".',
    }),
  ],
  preview: {
    select: { name: 'name', amount: 'perServing', unit: 'unit' },
    prepare: ({ name, amount, unit }) => ({
      title: name,
      subtitle: amount != null ? `${amount} ${unit} per serving` : 'not printed per serving',
    }),
  },
});

export const labelIngredient = defineType({
  name: 'labelIngredient',
  title: 'Ingredient row',
  type: 'object',
  description:
    'One ingredient as it appears on the label. Many rows have no amount: leave amounts empty rather than guessing.',
  fields: [
    defineField({
      name: 'displayName',
      title: 'Name as printed',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'ingredient',
      title: 'Linked ingredient',
      type: 'reference',
      to: [{ type: 'ingredient' }],
    }),
    defineField({ name: 'amount', title: 'Amount as printed', type: 'number' }),
    defineField({
      name: 'unit',
      type: 'string',
      options: { list: UNITS },
      validation: (r) =>
        r.custom((unit, ctx) => {
          const row = ctx.parent as { amount?: number; amountPerServing?: number } | undefined;
          const hasAmount = row?.amount != null || row?.amountPerServing != null;
          return hasAmount && !unit ? 'A unit is required when an amount is entered.' : true;
        }),
    }),
    defineField({
      name: 'amountPerServing',
      title: 'Amount per serving',
      type: 'number',
      description:
        'Normalised per-serving amount in the unit above. Empty if the label does not disclose it.',
    }),
    defineField({ name: 'dailyValue', type: 'number' }),
    defineField({ name: 'dailyValuePercent', type: 'number' }),
    defineField({ name: 'proprietaryBlend', type: 'boolean', initialValue: false }),
    defineField({
      name: 'blendName',
      type: 'string',
      hidden: ({ parent }) =>
        !(parent as { proprietaryBlend?: boolean } | undefined)?.proprietaryBlend,
      description:
        'Blend name exactly as printed, including any total amount, e.g. "Amino Boost Blend (5 g)".',
      validation: (r) =>
        r.custom((v, ctx) =>
          (ctx.parent as { proprietaryBlend?: boolean } | undefined)?.proprietaryBlend && !v
            ? 'Name the blend as printed.'
            : true,
        ),
    }),
    defineField({ name: 'orderOnLabel', type: 'number', validation: (r) => r.integer().min(1) }),
    defineField({
      name: 'isKeyActive',
      title: 'Key active',
      type: 'boolean',
      initialValue: false,
      description: 'Shown in summaries and used for cost-per-dose comparisons.',
    }),
    defineField({
      name: 'observation',
      title: 'Transcription note',
      description: 'Layer B: how the label prints it, e.g. "Printed as 750 mg per capsule".',
      type: 'string',
    }),
    defineField({
      name: 'editorialNote',
      title: 'Our interpretation',
      type: 'text',
      rows: 2,
      description:
        'Layer C: what the printed amount means, e.g. "This is the weight of magnesium glycinate, not elemental magnesium." Shown to readers as a labels.fyi note. Needs review like any editorial text.',
    }),
  ],
  preview: {
    select: {
      title: 'displayName',
      amount: 'amountPerServing',
      unit: 'unit',
      order: 'orderOnLabel',
    },
    prepare: ({ title, amount, unit, order }) => ({
      title: `${order ?? '·'}. ${title}`,
      subtitle: amount != null ? `${amount} ${unit ?? ''} per serving` : 'amount not disclosed',
    }),
  },
});

export const evidence = defineType({
  name: 'evidence',
  title: 'Evidence',
  type: 'object',
  fields: [
    defineField({ name: 'summary', type: 'text', rows: 3, validation: (r) => r.required() }),
    defineField({
      name: 'source',
      type: 'reference',
      to: [{ type: 'source' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'relevance',
      type: 'string',
      options: { list: ['direct', 'indirect', 'background'], layout: 'radio' },
      initialValue: 'direct',
      description:
        'Direct: about this product/label. Indirect: about the ingredient. Background: general context.',
    }),
    defineField({ name: 'population', type: 'string' }),
  ],
  preview: { select: { title: 'summary', subtitle: 'source.title' } },
});

export const evidenceFinding = defineType({
  name: 'evidenceFinding',
  title: 'Evidence finding',
  type: 'object',
  fields: [
    defineField({ name: 'outcome', type: 'string', validation: (r) => r.required() }),
    defineField({
      name: 'status',
      type: 'string',
      options: { list: ASSESSMENT_STATUS },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'summary', type: 'text', rows: 3, validation: (r) => r.required() }),
    defineField({
      name: 'sources',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'source' }] }],
      validation: (r) => r.min(1),
    }),
  ],
  preview: { select: { title: 'outcome', subtitle: 'status' } },
});

export const studiedDose = defineType({
  name: 'studiedDose',
  title: 'Studied dose',
  type: 'object',
  fields: [
    defineField({ name: 'context', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'min', type: 'number' }),
    defineField({ name: 'max', type: 'number' }),
    defineField({
      name: 'unit',
      type: 'string',
      options: { list: UNITS },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'frequency', type: 'string' }),
    defineField({ name: 'duration', type: 'string' }),
    defineField({ name: 'population', type: 'string' }),
    defineField({
      name: 'source',
      type: 'reference',
      to: [{ type: 'source' }],
      validation: (r) => r.required(),
    }),
  ],
  preview: {
    select: { title: 'context', min: 'min', max: 'max', unit: 'unit' },
    prepare: ({ title, min, max, unit }) => ({
      title,
      subtitle: `${min ?? ''}–${max ?? ''} ${unit}`,
    }),
  },
});

export const ingredientForm = defineType({
  name: 'ingredientForm',
  title: 'Form',
  type: 'object',
  fields: [
    defineField({ name: 'name', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'description', type: 'text', rows: 2 }),
  ],
});

export const doseBasis = defineType({
  name: 'doseBasis',
  title: 'Effective dose basis',
  type: 'object',
  description: 'What the comparison normalises to, e.g. 5 g creatine or 25 g protein.',
  fields: [
    defineField({
      name: 'kind',
      type: 'string',
      options: { list: ['ingredient', 'nutrient'], layout: 'radio' },
      initialValue: 'ingredient',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'ingredient',
      type: 'reference',
      to: [{ type: 'ingredient' }],
      hidden: ({ parent }) => (parent as { kind?: string })?.kind !== 'ingredient',
    }),
    defineField({
      name: 'nutrientKey',
      type: 'string',
      options: { list: NUTRIENT_KEYS },
      hidden: ({ parent }) => (parent as { kind?: string })?.kind !== 'nutrient',
    }),
    defineField({ name: 'amount', type: 'number', validation: (r) => r.required().positive() }),
    defineField({
      name: 'unit',
      type: 'string',
      options: { list: UNITS },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'label',
      type: 'string',
      description: 'e.g. "per 5 g creatine"',
      validation: (r) => r.required(),
    }),
  ],
});

export const objectTypes = [
  quantity,
  imageWithAlt,
  seo,
  blockContent,
  labelNutrient,
  labelIngredient,
  evidence,
  evidenceFinding,
  studiedDose,
  ingredientForm,
  doseBasis,
];
