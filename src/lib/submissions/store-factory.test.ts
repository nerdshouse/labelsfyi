import { describe, expect, it } from 'vitest';
import type { ServerEnv } from '@/lib/server/env';
import { getDocStore, NotConfiguredError, submissionsUnavailableMessage } from './store-factory';

/**
 * The reviewer banner on /internal/* shows the NotConfiguredError message.
 * It must say "closed" when submissions are deliberately off, and only talk
 * about the private dataset when that prerequisite is genuinely unconfirmed.
 * The public API is unaffected: it always answers 503 "not open yet".
 */
const env = (flag: string | undefined): ServerEnv => ({
  SANITY_PROJECT_ID: 'r1eiikj7',
  SANITY_DATASET: 'production',
  SANITY_WRITE_TOKEN: 'placeholder-not-a-real-token', // never used: the flag check comes first
  ...(flag === undefined ? {} : { SUBMISSIONS_PRIVATE_DATASET: flag }),
});
const reason = async (e: ServerEnv) => {
  try {
    await getDocStore(e);
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(NotConfiguredError);
    return (err as Error).message;
  }
};

describe('reviewer banner: why the submission store is unavailable', () => {
  it('SUBMISSIONS_PRIVATE_DATASET=false → "Submissions are currently closed."', async () => {
    expect(await reason(env('false'))).toBe('Submissions are currently closed.');
  });

  it('unset or anything other than true/false → private-dataset prerequisite', async () => {
    for (const flag of [undefined, '', 'TRUE', 'yes', '1'])
      expect(await reason(env(flag)), String(flag)).toBe(
        'Submissions require a private Sanity dataset.',
      );
  });

  it('never shows the old misleading message or leaks the variable name', async () => {
    for (const flag of ['false', undefined, 'yes']) {
      const msg = await reason(env(flag));
      expect(msg).not.toMatch(/SUBMISSIONS_PRIVATE_DATASET|=true/);
    }
  });

  it('SUBMISSIONS_PRIVATE_DATASET=true → store is available (no banner)', async () => {
    const store = await getDocStore(env('true'));
    expect(store.kind).toBe('sanity');
  });

  it('pure helper matches', () => {
    expect(submissionsUnavailableMessage('false')).toBe('Submissions are currently closed.');
    expect(submissionsUnavailableMessage(undefined)).toBe(
      'Submissions require a private Sanity dataset.',
    );
  });
});
