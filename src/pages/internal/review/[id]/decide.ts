import type { APIRoute } from 'astro';
import { runReviewAction } from '@/lib/submissions/actions';
import { decideStep } from '@/lib/submissions/steps';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, url }) => {
  const fd = await request.formData();
  const rejecting = fd.get('action') === 'reject';
  return runReviewAction(
    params.id,
    url,
    (d) => decideStep(d, fd),
    rejecting ? 'Submission rejected.' : 'Product identity recorded. Review the label facts next.',
  );
};
