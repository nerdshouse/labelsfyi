import type { APIRoute } from 'astro';
import { runReviewAction } from '@/lib/submissions/actions';
import { simulatePublishStep } from '@/lib/submissions/steps';

export const prerender = false;

/** LOCAL DEVELOPMENT ONLY (see simulatePublishStep). 404 on any deployment. */
export const POST: APIRoute = async ({ params, url }) => {
  if (!import.meta.env.DEV) return new Response('Not found', { status: 404 });
  return runReviewAction(
    params.id,
    url,
    (d, store) => simulatePublishStep(d, store),
    'Simulated editorial publish (local development only). Run `pnpm local:pull`, then `pnpm build` and `pnpm preview` to see it.',
  );
};
