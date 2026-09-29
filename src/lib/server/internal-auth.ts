/**
 * Access control for /internal/* (label review). Pure so it can be tested
 * without a Worker. HTTP Basic auth against Worker secrets; fails closed when
 * credentials are not configured. In production, also put Cloudflare Access
 * in front of /internal.
 */

export const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'same-origin', // not no-referrer: that makes browsers send Origin: null on form POSTs
};

function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/**
 * True for anything that is, or could be routed to, an internal page. Checks
 * the matched route pattern as well as the decoded path, so encoded variants
 * (/%69nternal/…) can't slip past.
 */
export function isInternalRequest(pathname: string, routePattern: string | undefined): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true; // malformed encoding: treat as protected
  }
  const p = decoded.toLowerCase().replace(/\/{2,}/g, '/');
  return p.startsWith('/internal') || (routePattern ?? '').startsWith('/internal');
}

/** Null when the request may proceed; otherwise the response to send. */
export function checkInternalAccess(
  request: Request,
  url: URL,
  env: { REVIEW_USER?: string | undefined; REVIEW_PASSWORD?: string | undefined },
): Response | null {
  if (!env.REVIEW_USER || !env.REVIEW_PASSWORD)
    return new Response('Internal review is not configured.', {
      status: 503,
      headers: PRIVATE_HEADERS,
    });
  const [scheme, encoded] = (request.headers.get('authorization') ?? '').split(' ');
  let ok = false;
  if (scheme === 'Basic' && encoded) {
    try {
      const [user, ...rest] = atob(encoded).split(':');
      // Evaluate both comparisons (no short-circuit on the user name).
      const userOk = safeEqual(user ?? '', env.REVIEW_USER);
      const passOk = safeEqual(rest.join(':'), env.REVIEW_PASSWORD);
      ok = userOk && passOk;
    } catch {
      ok = false;
    }
  }
  if (!ok)
    return new Response('Authentication required.', {
      status: 401,
      headers: {
        ...PRIVATE_HEADERS,
        'WWW-Authenticate': 'Basic realm="labels.fyi review", charset="UTF-8"',
      },
    });
  // CSRF: state-changing requests must come from this origin.
  if (
    request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    request.headers.get('origin') !== url.origin
  )
    return new Response('Cross-origin request blocked.', { status: 403, headers: PRIVATE_HEADERS });
  return null;
}
