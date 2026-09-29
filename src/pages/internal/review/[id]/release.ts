import type { APIRoute } from 'astro';
import { runReviewAction } from '@/lib/submissions/actions';
import { releaseStep } from '@/lib/submissions/steps';

export const prerender = false;

/**
 * Marks a verified submission as published. Refused unless the product is
 * published in Studio and an approved editorial review postdates the fact
 * verification (the same rule the site uses to show submission records).
 */
export const POST: APIRoute = async ({ params, url }) =>
  runReviewAction(params.id, url, (d) => releaseStep(d), 'Marked as published.');
