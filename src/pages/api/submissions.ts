import type { APIRoute } from 'astro';
import { serverEnv } from '@/lib/server/env';
import { receiveSubmission } from '@/lib/submissions/intake';
import { getDocStore, NotConfiguredError } from '@/lib/submissions/store-factory';
import { LIMITS } from '@/lib/submissions/validate';

export const prerender = false;

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...NO_STORE },
  });

export const POST: APIRoute = async ({ request, url, clientAddress }) => {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const fail = (status: number, errors: string[]) =>
    wantsJson
      ? json(status, { ok: false, errors })
      : Response.redirect(new URL(`/submit?error=${status}`, url), 303);

  // Same-origin only (blocks cross-site form posts).
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin)
    return fail(403, ['Cross-origin submissions are not accepted.']);
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > LIMITS.maxRequestBytes) return fail(413, ['Submission is too large.']);
  if (!(request.headers.get('content-type') ?? '').startsWith('multipart/form-data'))
    return fail(415, ['Unsupported submission format.']);

  const env = await serverEnv();
  if (env.SUBMIT_RATE_LIMITER) {
    const { success } = await env.SUBMIT_RATE_LIMITER.limit({ key: clientAddress ?? 'unknown' });
    if (!success) return fail(429, ['Too many submissions. Please try again later.']);
  }
  try {
    if (!env.SUBMISSIONS) throw new NotConfiguredError('No image storage bound.');
    const store = await getDocStore(env);
    const result = await receiveSubmission(await request.formData(), {
      store,
      objects: env.SUBMISSIONS,
    });
    if (!result.ok) return fail(result.status, result.errors);
    return wantsJson
      ? json(201, { ok: true })
      : Response.redirect(new URL('/submit/received', url), 303);
  } catch (e) {
    if (e instanceof NotConfiguredError) return fail(503, ['Submissions are not open yet.']);
    console.error('submission failed', e instanceof Error ? e.message : e);
    return fail(500, ['Something went wrong. Nothing was published. Please try again.']);
  }
};
