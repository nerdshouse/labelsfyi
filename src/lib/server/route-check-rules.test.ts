import { describe, expect, it } from 'vitest';
import {
  accessLoginRedirectProblem,
  internalRouteVerdict,
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
