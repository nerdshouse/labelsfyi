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
 *   - 404 (no route matched, nothing served), EXCEPT for a route that must
 *     exist (the /internal entry point and the real internal routes): there a
 *     404 means the request fell through to the public 404 page, bypassing the
 *     middleware, so it FAILS
 *   - 301/308 trailing-slash canonicalisation to the same path without the
 *     slash, on the same host (e.g. /internal/ → /internal)
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

export interface InternalProbeOptions {
  production: boolean;
  accessTeamDomain: string | null;
  /** The route is expected to exist: a 404 means it was never protected. */
  mustExist?: boolean;
  /** Path that was requested and the origin it was requested from. */
  requestPath?: string;
  origin?: string;
}

/** Null when `location` only drops the trailing slash of `requestPath` on the same host. */
export function trailingSlashRedirectProblem(
  location: string | null,
  requestPath: string | undefined,
  origin: string | undefined,
): string | null {
  if (!location) return 'redirect without a Location header';
  if (!requestPath || !origin || requestPath === '/' || !requestPath.endsWith('/'))
    return 'not a trailing-slash request';
  let base: URL;
  let url: URL;
  try {
    base = new URL(requestPath, origin);
    url = new URL(location, base);
  } catch {
    return 'unparseable Location';
  }
  if (url.origin !== base.origin) return `redirect leaves the site (${url.origin})`;
  if (url.pathname !== base.pathname.replace(/\/+$/, '') || url.search)
    return `redirect to an unexpected path (${url.pathname})`;
  return null;
}

export function internalRouteVerdict(r: ProbeResponse, opts: InternalProbeOptions): Verdict {
  if (exposesInternalContent(r)) return { pass: false, reason: 'internal content is exposed' };
  if (r.status >= 200 && r.status < 300)
    return { pass: false, reason: `publicly accessible (${r.status})` };
  if (r.status === 302) {
    const problem = accessLoginRedirectProblem(r.location, opts.accessTeamDomain);
    return problem
      ? { pass: false, reason: problem }
      : { pass: true, reason: 'redirected to the Cloudflare Access login' };
  }
  if (r.status === 301 || r.status === 308) {
    const problem = trailingSlashRedirectProblem(r.location, opts.requestPath, opts.origin);
    return problem
      ? { pass: false, reason: `${r.status}: ${problem}` }
      : { pass: true, reason: 'trailing-slash redirect to the same protected path' };
  }
  if (r.status === 404)
    return opts.mustExist
      ? { pass: false, reason: 'public 404: the route is missing, so the middleware never ran' }
      : { pass: true, reason: 'no route matched (nothing served)' };
  const refusals = opts.production ? [401, 403, 503] : [401, 503];
  if (refusals.includes(r.status)) {
    const privateHeaders = r.cacheControl === 'no-store' && /noindex/.test(r.robotsTag ?? '');
    return privateHeaders
      ? { pass: true, reason: `refused by the Worker (${r.status})` }
      : { pass: false, reason: `${r.status} without the private no-store/noindex headers` };
  }
  return { pass: false, reason: `unexpected status ${r.status}` };
}
