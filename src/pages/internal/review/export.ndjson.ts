import type { APIRoute } from 'astro';
import { serverEnv } from '@/lib/server/env';
import { R2DocStore, type Doc } from '@/lib/submissions/store';
import { getDocStore } from '@/lib/submissions/store-factory';

export const prerender = false;

/**
 * LOCAL DEVELOPMENT ONLY: exports documents written by the review pipeline so
 * the local static build can include them (`pnpm local:pull`). Candidates
 * are excluded, and submissions are reduced to the image classifications the
 * panel evidence gate reads: no submitter details, no storage keys.
 */
const redactSubmission = (d: Doc): Doc => ({
  _id: d._id,
  _type: d._type,
  images: ((d.images ?? []) as Array<Record<string, unknown>>).map((i) => ({
    _key: i._key,
    imageKind: i.imageKind,
    depictsExactProduct: i.depictsExactProduct,
  })),
});

export const GET: APIRoute = async () => {
  if (!import.meta.env.DEV) return new Response('Not found', { status: 404 });
  const store = await getDocStore(await serverEnv());
  if (!(store instanceof R2DocStore)) return new Response('Not found', { status: 404 });
  const docs = (await store.written())
    .filter((d) => d._type !== 'ingestionCandidate')
    .map((d) => (d._type === 'labelSubmission' ? redactSubmission(d) : d));
  return new Response(docs.map((d) => JSON.stringify(d)).join('\n') + '\n', {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
};
