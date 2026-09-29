/**
 * How the live route checker (scripts/route-check.ts) judges a request for a
 * protected /internal/* route made WITHOUT credentials. Pure, so it is
 * regression-tested; it only interprets responses and never relaxes the
 * middleware or Cloudflare Access itself.
 *
 * PASS when the route is not served:
 *   - 302 to the Cloudflare Access login of OUR team: https, hostname exactly
 *     the configured team domain, path /cdn-cgi/access/login/…
 *   - 401 / 503 (and 403 in production) with the private no-store/noindex
 *     headers the Worker adds to its own refusals
 *   - 404 (no route matched, nothing served)
 * FAIL on anything else, and always when internal content is in the response.
 */
import { ACCESS_TEAM_DOMAIN_RE } from './deploy-config.ts';

export interface ProbeResponse {
  status: number;
  location: string | null;
  contentType: string | null;
  cacheControl: string | null;
  robotsTag: string | null;
  body: string;
}

export type Verdict = { pass: boolean; reason: string };

/** Present in every internal page (InternalLayout) and internal payload type. */
const INTERNAL_MARKERS = ['labels.fyi internal', 'Internal · review'];
const INTERNAL_CONTENT_TYPES = /^(application\/x-ndjson|image\/)/i;
export const ACCESS_LOGIN_PATH = '/cdn-cgi/access/login/';

export function exposesInternalContent(r: ProbeResponse): boolean {
  return (
    INTERNAL_MARKERS.some((m) => r.body.includes(m)) ||
    (r.status >= 200 && r.status < 300 && INTERNAL_CONTENT_TYPES.test(r.contentType ?? ''))
  );
}

/** Null when `location` is our team's Access login; otherwise why it is not. */
export function accessLoginRedirectProblem(
  location: string | null,
  accessTeamDomain: string | null,
): string | null {
  if (!accessTeamDomain || !ACCESS_TEAM_DOMAIN_RE.test(accessTeamDomain))
    return 'no valid Access team domain configured to compare the redirect with';
  if (!location) return 'redirect without a Location header';
  let url: URL;
  try {
    url = new URL(location); // absolute only: a relative Location stays on our host
  } catch {
    return `Location is not an absolute URL (${location.slice(0, 80)})`;
  }
  if (url.protocol !== 'https:') return `Location is not https (${url.protocol})`;
  if (url.username || url.password || url.port) return 'Location has credentials or a port';
  if (url.hostname !== accessTeamDomain)
    return `Location points to ${url.hostname}, not ${accessTeamDomain}`;
  if (!url.pathname.startsWith(ACCESS_LOGIN_PATH) || url.pathname === ACCESS_LOGIN_PATH)
    return `Location path ${url.pathname} is not a Cloudflare Access login path`;
  return null;
}

export function internalRouteVerdict(
  r: ProbeResponse,
  opts: { production: boolean; accessTeamDomain: string | null },
): Verdict {
  if (exposesInternalContent(r)) return { pass: false, reason: 'internal content is exposed' };
  if (r.status >= 200 && r.status < 300)
    return { pass: false, reason: `publicly accessible (${r.status})` };
  if (r.status === 302) {
    const problem = accessLoginRedirectProblem(r.location, opts.accessTeamDomain);
    return problem
      ? { pass: false, reason: problem }
      : { pass: true, reason: 'redirected to the Cloudflare Access login' };
  }
  if (r.status === 404) return { pass: true, reason: 'no route matched (nothing served)' };
  const refusals = opts.production ? [401, 403, 503] : [401, 503];
  if (refusals.includes(r.status)) {
    const privateHeaders = r.cacheControl === 'no-store' && /noindex/.test(r.robotsTag ?? '');
    return privateHeaders
      ? { pass: true, reason: `refused by the Worker (${r.status})` }
      : { pass: false, reason: `${r.status} without the private no-store/noindex headers` };
  }
  return { pass: false, reason: `unexpected status ${r.status}` };
}
