import type { APIRoute } from 'astro';
import { runReviewAction } from '@/lib/submissions/actions';
import { factsStep } from '@/lib/submissions/steps';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, url }) => {
  const fd = await request.formData();
  return runReviewAction(
    params.id,
    url,
    (d) => factsStep(d, fd),
    'Label facts recorded as verified observations.',
  );
};
