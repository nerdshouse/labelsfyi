import { describe, expect, it } from 'vitest';
import type { ServerEnv } from '@/lib/server/env';
import {
  getDocStore,
  getPublicSubmissionStore,
  NotConfiguredError,
  publicSubmissionsOpen,
  submissionsUnavailableMessage,
} from './store-factory';

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

/**
 * PUBLIC_SUBMISSIONS gates public intake only; SUBMISSIONS_PRIVATE_DATASET
 * gates the private store used by /internal review. Production is
 * closed + private: internal review works, public intake answers 503.
 */
describe('public submissions vs private internal review', () => {
  const both = (pub: string | undefined, priv: string | undefined): ServerEnv => ({
    ...env(priv),
    ...(pub === undefined ? {} : { PUBLIC_SUBMISSIONS: pub }),
  });
  const available = async (p: Promise<unknown>) =>
    p.then(
      () => true,
      (e: unknown) => {
        expect(e).toBeInstanceOf(NotConfiguredError);
        return false;
      },
    );

  it('closed + private: internal store available, public intake closed', async () => {
    const e = both('closed', 'true');
    expect(publicSubmissionsOpen(e)).toBe(false);
    expect(await available(getDocStore(e))).toBe(true);
    expect(await available(getPublicSubmissionStore(e))).toBe(false);
  });

  it('open + private: both available (normal operation)', async () => {
    const e = both('open', 'true');
    expect(publicSubmissionsOpen(e)).toBe(true);
    expect(await available(getDocStore(e))).toBe(true);
    expect(await available(getPublicSubmissionStore(e))).toBe(true);
  });

  it('open but dataset not confirmed private: nothing available', async () => {
    for (const priv of ['false', undefined, 'yes']) {
      const e = both('open', priv);
      expect(await available(getDocStore(e))).toBe(false);
      expect(await available(getPublicSubmissionStore(e))).toBe(false);
    }
  });

  it('malformed or missing PUBLIC_SUBMISSIONS fails closed', async () => {
    for (const pub of [
      undefined,
      '',
      'OPEN',
      'Open',
      ' open',
      'open ',
      'true',
      '1',
      'yes',
      'opened',
    ]) {
      const e = both(pub, 'true');
      expect(publicSubmissionsOpen(e), String(pub)).toBe(false);
      expect(await available(getPublicSubmissionStore(e)), String(pub)).toBe(false);
      expect(await available(getDocStore(e)), String(pub)).toBe(true); // internal unaffected
    }
  });
});
