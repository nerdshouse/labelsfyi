import { describe, expect, it } from 'vitest';
import {
  accessLoginRedirectProblem,
  internalRouteVerdict,
  trailingSlashRedirectProblem,
  type ProbeResponse,
} from './route-check-rules';

const TEAM = 'gentle-glitter-5a69.cloudflareaccess.com';
const AUD = 'f462a8558f5b9b748028c56bf2c36e3e0ac22e73a70da65b390a425ba41d3129';
const LOGIN = `https://${TEAM}/cdn-cgi/access/login/labels.fyi?kid=${AUD}&redirect_url=%2Finternal`;
const prod = { production: true, accessTeamDomain: TEAM };

const res = (o: Partial<ProbeResponse>): ProbeResponse => ({
  status: 200,
  location: null,
  contentType: 'text/html',
  cacheControl: null,
  robotsTag: null,
  body: '',
  ...o,
});
const redirect = (location: string | null, body = '') => res({ status: 302, location, body });
const refusal = (status: number) =>
  res({ status, cacheControl: 'no-store', robotsTag: 'noindex, nofollow', body: 'Forbidden.' });

describe('live route check: /internal without credentials', () => {
  it('PASS: 302 to our Cloudflare Access login (the live behaviour)', () => {
    expect(internalRouteVerdict(redirect(LOGIN), prod)).toEqual({
      pass: true,
      reason: 'redirected to the Cloudflare Access login',
    });
  });

  it.each([
    ['another domain', `https://evil.example.com/cdn-cgi/access/login/labels.fyi`],
    ['another Access team', `https://other-team.cloudflareaccess.com/cdn-cgi/access/login/x`],
    ['look-alike host', `https://${TEAM}.evil.com/cdn-cgi/access/login/labels.fyi`],
    ['http', `http://${TEAM}/cdn-cgi/access/login/labels.fyi`],
    ['unexpected path', `https://${TEAM}/somewhere-else`],
    ['Access path that is not login', `https://${TEAM}/cdn-cgi/access/certs`],
    ['bare login path', `https://${TEAM}/cdn-cgi/access/login/`],
    ['relative Location', `/cdn-cgi/access/login/labels.fyi`],
    ['credentials in Location', `https://user:pw@${TEAM}/cdn-cgi/access/login/labels.fyi`],
    ['port in Location', `https://${TEAM}:8443/cdn-cgi/access/login/labels.fyi`],
  ])('FAIL: 302 to %s', (_label, location) => {
    expect(internalRouteVerdict(redirect(location), prod).pass).toBe(false);
  });

  it('FAIL: 302 without a Location header', () => {
    expect(internalRouteVerdict(redirect(null), prod)).toMatchObject({ pass: false });
  });

  it('FAIL: a valid-looking redirect whose body carries internal content', () => {
    const body = '<title>Submissions · labels.fyi internal</title>';
    expect(internalRouteVerdict(redirect(LOGIN, body), prod)).toMatchObject({
      pass: false,
      reason: 'internal content is exposed',
    });
  });

  it('FAIL: 302 when no valid team domain is configured to compare with', () => {
    for (const accessTeamDomain of [null, '', 'evil.example.com', `https://${TEAM}`])
      expect(
        internalRouteVerdict(redirect(LOGIN), { production: true, accessTeamDomain }).pass,
      ).toBe(false);
  });

  it('FAIL: the protected page is served (200), with or without markers', () => {
    expect(
      internalRouteVerdict(res({ body: '<title>Submissions · labels.fyi internal</title>' }), prod),
    ).toMatchObject({ pass: false, reason: 'internal content is exposed' });
    expect(internalRouteVerdict(res({ body: '<p>anything</p>' }), prod)).toMatchObject({
      pass: false,
      reason: 'publicly accessible (200)',
    });
    expect(
      internalRouteVerdict(res({ contentType: 'application/x-ndjson', body: '{}' }), prod).pass,
    ).toBe(false);
    expect(internalRouteVerdict(res({ contentType: 'image/jpeg', body: 'x' }), prod).pass).toBe(
      false,
    );
  });

  it('PASS (unchanged): Worker refusals with private headers, and 404', () => {
    for (const status of [401, 403, 503])
      expect(internalRouteVerdict(refusal(status), prod).pass, String(status)).toBe(true);
    expect(internalRouteVerdict(res({ status: 404, body: 'Not found' }), prod).pass).toBe(true);
    // Outside production, 403 was never an accepted refusal (unchanged).
    expect(
      internalRouteVerdict(refusal(403), { production: false, accessTeamDomain: TEAM }).pass,
    ).toBe(false);
  });

  it('FAIL (unchanged): refusals without the private headers, other statuses', () => {
    expect(internalRouteVerdict(res({ status: 403, body: 'Forbidden' }), prod).pass).toBe(false);
    expect(internalRouteVerdict(res({ status: 500 }), prod).pass).toBe(false);
    expect(internalRouteVerdict(res({ status: 301, location: LOGIN }), prod).pass).toBe(false);
    expect(internalRouteVerdict(res({ status: 404, body: 'Internal · review' }), prod).pass).toBe(
      false,
    );
  });

  it('accessLoginRedirectProblem accepts only the exact team login', () => {
    expect(accessLoginRedirectProblem(LOGIN, TEAM)).toBeNull();
    expect(accessLoginRedirectProblem(LOGIN.replace(TEAM, TEAM.toUpperCase()), TEAM)).toBeNull(); // URL host is case-insensitive
    expect(accessLoginRedirectProblem(LOGIN, 'other.cloudflareaccess.com')).not.toBeNull();
  });
});

describe('live route check: /internal entry point (must exist)', () => {
  const entry = {
    ...prod,
    mustExist: true,
    requestPath: '/internal',
    origin: 'https://labels.fyi',
  };
  it('FAIL: a public 404 for /internal (route missing, middleware never ran)', () => {
    expect(
      internalRouteVerdict(res({ status: 404, body: "We couldn't find that page." }), entry),
    ).toMatchObject({ pass: false, reason: expect.stringMatching(/public 404/) });
  });
  it('PASS: unauthenticated /internal redirected to the Access login (live)', () => {
    expect(internalRouteVerdict(redirect(LOGIN), entry).pass).toBe(true);
  });
  it('PASS: unauthenticated /internal refused by the Worker (403/503)', () => {
    for (const status of [403, 503])
      expect(internalRouteVerdict(refusal(status), entry).pass).toBe(true);
  });
  it('FAIL: /internal serving the reviewer UI or its own redirect to an unauthenticated client', () => {
    expect(
      internalRouteVerdict(res({ body: '<title>Submissions · labels.fyi internal</title>' }), entry)
        .pass,
    ).toBe(false);
    // The app's own post-auth redirect must never reach an unauthenticated probe.
    expect(internalRouteVerdict(redirect('/internal/review'), entry).pass).toBe(false);
    expect(internalRouteVerdict(redirect('https://labels.fyi/internal/review'), entry).pass).toBe(
      false,
    );
  });
  it('PASS (unchanged): 404 on a variant that need not exist (e.g. /INTERNAL)', () => {
    expect(
      internalRouteVerdict(res({ status: 404, body: 'Not found' }), {
        ...prod,
        requestPath: '/INTERNAL',
      }).pass,
    ).toBe(true);
  });
});

describe('live route check: /internal/ trailing slash', () => {
  const slash = { ...prod, requestPath: '/internal/', origin: 'https://labels.fyi' };
  const moved = (status: number, location: string | null) => res({ status, location });
  it('PASS: 301/308 to the same path without the slash, same host', () => {
    expect(internalRouteVerdict(moved(301, 'https://labels.fyi/internal'), slash).pass).toBe(true);
    expect(internalRouteVerdict(moved(308, '/internal'), slash).pass).toBe(true);
  });
  it('PASS: Access redirect for /internal/ (live)', () => {
    expect(internalRouteVerdict(redirect(LOGIN), slash).pass).toBe(true);
  });
  it.each([
    ['another host', 'https://evil.example.com/internal'],
    ['another path', 'https://labels.fyi/internal/review'],
    ['a query', '/internal?x=1'],
    ['no Location', null],
  ])('FAIL: 301 to %s', (_label, location) => {
    expect(internalRouteVerdict(moved(301, location), slash).pass).toBe(false);
  });
  it('FAIL: 301 on a request without a trailing slash', () => {
    expect(
      trailingSlashRedirectProblem('/internal', '/internal', 'https://labels.fyi'),
    ).not.toBeNull();
  });
  it('FAIL: trailing-slash redirect whose body leaks internal content', () => {
    expect(
      internalRouteVerdict(
        res({ status: 301, location: '/internal', body: 'Internal · review' }),
        slash,
      ).pass,
    ).toBe(false);
  });
});
