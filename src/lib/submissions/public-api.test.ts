import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerEnv } from '@/lib/server/env';

/**
 * The public submission API with production's configuration (closed +
 * private): 503 "Submissions are not open yet." before anything is read or
 * stored, even though the private internal store is available.
 */
let current: ServerEnv = {};
vi.mock('@/lib/server/env', () => ({ serverEnv: async () => current }));
const { POST } = await import('@/pages/api/submissions');

const put = vi.fn();
const bucket = { get: vi.fn(), put, list: vi.fn(), delete: vi.fn() };
const production = (pub: string | undefined): ServerEnv => ({
  SANITY_PROJECT_ID: 'r1eiikj7',
  SANITY_DATASET: 'production',
  SANITY_WRITE_TOKEN: 'placeholder-not-a-real-token', // never used: refused first
  SUBMISSIONS_PRIVATE_DATASET: 'true',
  ...(pub === undefined ? {} : { PUBLIC_SUBMISSIONS: pub }),
  SUBMISSIONS: bucket as never,
});
const call = async () => {
  const fd = new FormData();
  fd.set('productName', 'x');
  const request = new Request('https://labels.fyi/api/submissions', {
    method: 'POST',
    headers: { origin: 'https://labels.fyi', accept: 'application/json' },
    body: fd,
  });
  const res = await (POST as (ctx: unknown) => Promise<Response>)({
    request,
    url: new URL(request.url),
    clientAddress: '203.0.113.1',
  });
  return { status: res.status, body: (await res.json()) as { errors?: string[] } };
};

describe('public submissions API', () => {
  beforeEach(() => put.mockReset());

  it.each([['closed'], [undefined], ['OPEN'], ['true'], ['']])(
    'PUBLIC_SUBMISSIONS=%s → 503 "Submissions are not open yet." and nothing stored',
    async (pub) => {
      current = production(pub);
      const r = await call();
      expect(r.status).toBe(503);
      expect(r.body.errors).toEqual(['Submissions are not open yet.']);
      expect(put).not.toHaveBeenCalled();
    },
  );
});
