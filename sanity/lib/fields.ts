import { defineField, type RuleDef } from 'sanity';
import { WORKFLOW_STATUS } from './constants';

type Doc = { workflowStatus?: string; isDemo?: boolean } | undefined;

/** Stages after which evidence-bearing fields become mandatory. */
const beyondDraft = (doc: Doc) => !!doc?.workflowStatus && doc.workflowStatus !== 'DRAFT';
const approvedOrLater = (doc: Doc) =>
  ['APPROVED', 'PUBLISHED', 'NEEDS_REVIEW'].includes(doc?.workflowStatus ?? '');

/** Required once the document leaves Draft. */
export const requiredAfterDraft =
  (message: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <R extends RuleDef<R, any>>(rule: R): R =>
    rule.custom((value: unknown, ctx) => {
      const empty =
        value === undefined || value === null || (Array.isArray(value) && value.length === 0);
      return empty && beyondDraft(ctx.document as Doc) ? message : true;
    });

/** Required once the document is Approved (i.e. before it can publish). */
export const requiredWhenApproved =
  (message: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <R extends RuleDef<R, any>>(rule: R): R =>
    rule.custom((value: unknown, ctx) => {
      const empty =
        value === undefined || value === null || (Array.isArray(value) && value.length === 0);
      return empty && approvedOrLater(ctx.document as Doc) ? message : true;
    });

export const editorialGroups = [
  { name: 'content', title: 'Content', default: true },
  { name: 'workflow', title: 'Workflow' },
  { name: 'seo', title: 'SEO' },
];

/** Fields every workflow-gated document carries. */
export const editorialFields = [
  defineField({
    name: 'workflowStatus',
    title: 'Workflow status',
    type: 'string',
    group: 'workflow',
    options: { list: WORKFLOW_STATUS, layout: 'radio' },
    initialValue: 'DRAFT',
    validation: (r) => r.required(),
    description:
      'Draft → Fact check → Dietitian review → Approved → Published. Only Approved content can be published.',
  }),
  defineField({
    name: 'isDemo',
    title: 'Demo / fixture content',
    type: 'boolean',
    group: 'workflow',
    initialValue: false,
    description: 'Fictional data used for development. The site labels it as demo everywhere.',
  }),
  defineField({
    name: 'noindex',
    title: 'Hide from search engines',
    type: 'boolean',
    group: 'seo',
    initialValue: false,
  }),
  defineField({ name: 'seo', title: 'SEO overrides', type: 'seo', group: 'seo' }),
];
