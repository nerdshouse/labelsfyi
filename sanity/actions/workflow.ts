import {
  useDocumentOperation,
  type DocumentActionComponent,
  type DocumentActionsResolver,
} from 'sanity';
import { AUDIT_TYPES, PUBLISHABLE_STATUSES, WORKFLOW_TYPES } from '../lib/constants';

/**
 * Wraps the default Publish action: publishing is disabled until the
 * document's workflow status is Approved. Publishing an Approved document
 * moves it to Published in the same step.
 */
function gatePublish(original: DocumentActionComponent): DocumentActionComponent {
  const Gated: DocumentActionComponent = (props) => {
    const result = original(props);
    const { patch } = useDocumentOperation(props.id, props.type);
    if (!result) return result;
    const status = (props.draft ?? props.published)?.workflowStatus as string | undefined;
    if (!status || !PUBLISHABLE_STATUSES.includes(status)) {
      return {
        ...result,
        disabled: true,
        title: `Only Approved content can be published. Current status: ${status ?? 'none'}.`,
      };
    }
    return {
      ...result,
      onHandle: () => {
        if (status === 'APPROVED') patch.execute([{ set: { workflowStatus: 'PUBLISHED' } }]);
        result.onHandle?.();
      },
    };
  };
  Gated.action = 'publish';
  return Gated;
}

export const resolveDocumentActions: DocumentActionsResolver = (prev, context) => {
  if (WORKFLOW_TYPES.includes(context.schemaType)) {
    return prev.map((action) => (action.action === 'publish' ? gatePublish(action) : action));
  }
  if (AUDIT_TYPES.includes(context.schemaType)) {
    // Audit records are append-only once published.
    return prev.filter((action) => action.action !== 'delete' && action.action !== 'unpublish');
  }
  return prev;
};
