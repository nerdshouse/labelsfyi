import type { APIRoute } from 'astro';
import { runReviewAction } from '@/lib/submissions/actions';
import { workflowStep } from '@/lib/submissions/steps';

export const prerender = false;

/** Moves the product into the existing editorial workflow (FACT_CHECK). Not publication. */
export const POST: APIRoute = async ({ params, url }) =>
  runReviewAction(
    params.id,
    url,
    (d) => workflowStep(d),
    'Sent to editorial review (Fact check). Publishing happens in Sanity Studio after review.',
  );
