import { defineArrayMember, defineField, defineType } from 'sanity';
import {
  ASSET_PERMISSION_STATUS,
  ASSET_TYPE,
  GOAL_INGREDIENT_RELATION,
  PRODUCT_GOAL_BASIS,
  PRODUCT_GOAL_STATUS,
  RESERVED_GOAL_SLUGS,
} from '../../lib/constants';
import { editorialFields, editorialGroups } from '../../lib/fields';
import { languageWarning, requireApprovedReview } from '../../lib/validation';

/**
 * Goal discovery (docs/goals.md). A goal is a consumer discovery category
 * ("products marketed for sleep support"), NOT a diagnosis and NOT a claim
 * that any supplement treats anything. Products join a goal only through an
 * explicit, sourced, editorially approved productGoal relationship.
 */

const MEDICAL_CLAIM =
  /\b(treat|treats|treating|cure|cures|curing|prevent|prevents|diagnos\w*|heal|heals)\b/i;
const noMedicalClaims = (v: unknown) =>
  typeof v === 'string' && MEDICAL_CLAIM.test(v)
    ? 'Goal copy must not claim that supplements treat, cure, prevent or diagnose anything.'
    : true;

export const goalIngredient = defineType({
  name: 'goalIngredient',
  title: 'Goal ingredient',
  type: 'object',
  fields: [
    defineField({
      name: 'name',
      type: 'string',
      description: 'As shown on the chip, e.g. "L-theanine".',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'ingredient',
      type: 'reference',
      to: [{ type: 'ingredient' }],
      description: 'Canonical ingredient, when one exists (links the chip).',
    }),
    defineField({
      name: 'matchNames',
      type: 'array',
      of: [defineArrayMember({ type: 'string' })],
      description:
        'Label names that count as this ingredient when no canonical ingredient is linked (e.g. "sodium").',
    }),
    defineField({
      name: 'relation',
      type: 'string',
      options: { list: GOAL_INGREDIENT_RELATION, layout: 'radio' },
      initialValue: 'COMMONLY_FOUND',
      validation: (r) =>
        r
          .required()
          .custom((v, ctx) =>
            v === 'EDITORIALLY_REVIEWED' && !(ctx.parent as { evidence?: unknown })?.evidence
              ? 'Link the approved evidence record (claim) before marking this editorially reviewed.'
              : true,
          ),
    }),
    defineField({
      name: 'evidence',
      title: 'Approved evidence record',
      type: 'reference',
      to: [{ type: 'claim' }],
      hidden: ({ parent }) =>
        (parent as { relation?: string })?.relation !== 'EDITORIALLY_REVIEWED',
    }),
  ],
  preview: { select: { title: 'name', subtitle: 'relation' } },
});

export const goal = defineType({
  name: 'goal',
  title: 'Goal',
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
      description: 'Top-level URL (/sleep). Must not collide with an existing route.',
      validation: (r) =>
        r.required().custom((v) => {
          const s = (v as { current?: string } | undefined)?.current ?? '';
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))
            return 'Lowercase letters, numbers and hyphens.';
          return RESERVED_GOAL_SLUGS.includes(s) ? `"${s}" is an existing route.` : true;
        }),
    }),
    defineField({
      name: 'shortDescription',
      type: 'string',
      group: 'content',
      description: 'e.g. "Supplements marketed for stress support." Never "treats…".',
      validation: (r) => r.required().max(140).custom(noMedicalClaims).custom(languageWarning),
    }),
    defineField({
      name: 'discoveryDescription',
      type: 'text',
      rows: 3,
      group: 'content',
      description: 'Neutral context for the goal page. Facts first; no efficacy claims.',
      validation: (r) => r.required().custom(noMedicalClaims).custom(languageWarning),
    }),
    defineField({
      name: 'ingredients',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'goalIngredient' })],
      description: 'Common ingredients found in products marketed for this goal. Not efficacy.',
    }),
    defineField({ name: 'order', type: 'number', group: 'content', initialValue: 100 }),
    ...editorialFields,
  ],
  validation: (r) => r.custom(requireApprovedReview),
  orderings: [{ title: 'Order', name: 'order', by: [{ field: 'order', direction: 'asc' }] }],
  preview: { select: { title: 'name', subtitle: 'workflowStatus' } },
});

export const productGoal = defineType({
  name: 'productGoal',
  title: 'Product ↔ goal',
  type: 'document',
  description:
    'Why a product appears on a goal page. Needs a basis and a source; only APPROVED relationships (named reviewer) are shown.',
  fields: [
    defineField({
      name: 'product',
      type: 'reference',
      to: [{ type: 'product' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'goal',
      type: 'reference',
      to: [{ type: 'goal' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'basis',
      type: 'string',
      options: { list: PRODUCT_GOAL_BASIS, layout: 'radio' },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'statement',
      title: 'What the source says',
      type: 'string',
      description:
        'Short, verbatim where marketing (e.g. "Sleep Support" product tag). Shown in "Why this appears".',
      validation: (r) => r.max(160),
    }),
    defineField({ name: 'source', type: 'reference', to: [{ type: 'source' }] }),
    defineField({ name: 'sourceUrl', type: 'url' }),
    defineField({
      name: 'sourceLocator',
      type: 'string',
      description: 'e.g. "product tags", "front label", "product title".',
    }),
    defineField({ name: 'observedAt', type: 'datetime' }),
    defineField({
      name: 'status',
      type: 'string',
      options: { list: PRODUCT_GOAL_STATUS, layout: 'radio' },
      initialValue: 'CANDIDATE',
      validation: (r) =>
        r.required().custom((v, ctx) => {
          const d = ctx.document as {
            reviewedBy?: string;
            reviewedAt?: string;
            source?: unknown;
            sourceUrl?: string;
            basis?: string;
          };
          if (v !== 'APPROVED') return true;
          if (!d?.reviewedBy || !d.reviewedAt) return 'Approval needs a named reviewer and date.';
          if (!d.source && !d.sourceUrl) return 'Approval needs a source.';
          return true;
        }),
    }),
    defineField({ name: 'reviewedBy', type: 'string' }),
    defineField({ name: 'reviewedAt', type: 'datetime' }),
    defineField({ name: 'notes', type: 'text', rows: 2 }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  preview: {
    select: { product: 'product.name', goal: 'goal.name', status: 'status', basis: 'basis' },
    prepare: ({ product, goal, status, basis }) => ({
      title: `${product ?? '—'} → ${goal ?? '—'}`,
      subtitle: `${status} · ${basis}`,
    }),
  },
});

export const assetPermission = defineType({
  name: 'assetPermission',
  title: 'Asset permission',
  type: 'document',
  description:
    'The basis for displaying a brand’s images or copy. Without an AUTHORIZED, unexpired record, third-party images are never displayed. Contact details are internal.',
  fields: [
    defineField({
      name: 'brand',
      type: 'reference',
      to: [{ type: 'brand' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'product',
      type: 'reference',
      to: [{ type: 'product' }],
      description: 'Leave empty for a brand-wide permission.',
    }),
    defineField({
      name: 'assetType',
      type: 'string',
      options: { list: ASSET_TYPE },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'status',
      type: 'string',
      options: { list: ASSET_PERMISSION_STATUS, layout: 'radio' },
      initialValue: 'NOT_REQUESTED',
      validation: (r) =>
        r.required().custom((v, ctx) => {
          if (v !== 'AUTHORIZED') return true;
          const d = (ctx.document ?? {}) as {
            grantedAt?: string;
            grantedBy?: string;
            evidence?: string;
            scope?: string[];
            verifiedBy?: { _ref?: string };
            verifiedAt?: string;
            expiresAt?: string;
          };
          const missing = [
            !d.grantedAt && 'when it was granted',
            !d.grantedBy && 'who granted it',
            !d.evidence && 'where the written permission is filed',
            !d.scope?.length && 'its scope',
            !d.verifiedBy?._ref && 'who verified it',
            !d.verifiedAt && 'when it was verified',
          ].filter(Boolean);
          if (missing.length) return `AUTHORIZED needs: ${missing.join(', ')}.`;
          if (d.expiresAt && d.grantedAt && Date.parse(d.expiresAt) <= Date.parse(d.grantedAt))
            return 'The expiry must be after the grant date.';
          return true;
        }),
    }),
    defineField({
      name: 'scope',
      title: 'What is permitted',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        list: [
          { value: 'FACTUAL_DATA', title: 'Factual product data (name, pack, price, amounts)' },
          {
            value: 'LABEL_INFORMATION',
            title: 'Label information (supplement facts, ingredients)',
          },
          { value: 'IMAGES', title: 'Images (display)' },
          { value: 'URLS', title: 'Automated reading of the listed URLs' },
        ],
        layout: 'grid',
      },
      validation: (r) =>
        r.custom((scope, ctx) => {
          const t = (ctx.document as { assetType?: string } | undefined)?.assetType;
          const list = (scope as string[] | undefined) ?? [];
          return t && /IMAGE|LOGO/.test(t) && list.length && !list.includes('IMAGES')
            ? 'An image permission must include the Images scope.'
            : true;
        }),
    }),
    defineField({
      name: 'permittedUrls',
      title: 'Permitted URLs / URL patterns',
      type: 'array',
      of: [{ type: 'string' }],
      description:
        'e.g. https://www.brand.com/products/* — only what the written permission names.',
      hidden: ({ document }) => !((document?.scope as string[] | undefined) ?? []).includes('URLS'),
    }),
    defineField({
      name: 'grantedBy',
      title: 'Granted by (internal)',
      type: 'string',
      description: 'Name and role of the person at the brand who granted it. Never published.',
    }),
    defineField({
      name: 'verifiedBy',
      title: 'Verified by (labels.fyi)',
      type: 'reference',
      to: [{ type: 'reviewer' }],
      description: 'The labels.fyi person who read the written permission.',
    }),
    defineField({ name: 'verifiedAt', type: 'datetime' }),
    defineField({
      name: 'evidence',
      title: 'Permission evidence (internal)',
      type: 'string',
      description: 'Where the written permission is filed (email/contract reference). Internal.',
    }),
    defineField({ name: 'grantedAt', type: 'datetime' }),
    defineField({ name: 'expiresAt', type: 'datetime' }),
    defineField({
      name: 'contact',
      title: 'Brand contact (internal)',
      type: 'string',
      description: 'Never published.',
    }),
    defineField({ name: 'notes', title: 'Notes (internal)', type: 'text', rows: 2 }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  preview: {
    select: { brand: 'brand.name', product: 'product.name', type: 'assetType', status: 'status' },
    prepare: ({ brand, product, type, status }) => ({
      title: `${brand ?? '—'}${product ? ` · ${product}` : ''}`,
      subtitle: `${type} · ${status}`,
    }),
  },
});

export const goalTypes = [goalIngredient, goal, productGoal, assetPermission];
