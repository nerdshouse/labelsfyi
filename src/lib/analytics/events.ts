/**
 * Client-side analytics. A thin wrapper over gtag so the rest of the code
 * never talks to a vendor directly. Everything no-ops when GA is not configured.
 *
 * Events: product_view, search, comparison_view, compare, affiliate_click, buy_click,
 * newsletter_signup, goal_view, ingredient_view, analyse_url, analyse_result,
 * submit_verification, receipt_view, receipt_share. Never personal data: no URLs
 * typed by visitors, no contact details, no form contents.
 */

type EventName =
  | 'product_view'
  | 'search'
  | 'comparison_view'
  | 'compare'
  | 'affiliate_click'
  | 'buy_click'
  | 'newsletter_signup'
  | 'goal_view'
  | 'ingredient_view'
  | 'analyse_url'
  | 'analyse_result'
  | 'submit_verification'
  | 'receipt_view'
  | 'receipt_share';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Only these parameters ever leave the page, and only if the value looks like
 * a public slug/enum/count (docs/security.md). Anything else — typed text,
 * URLs to other sites, e-mails, phone numbers, Sanity ids, keys — is dropped,
 * so a careless call site or data-* attribute cannot leak it.
 */
const ALLOWED_PARAMS = new Set([
  'slug',
  'goal',
  'ingredient',
  'pair',
  'product',
  'merchant',
  'relationship',
  'affiliate',
  'official',
  'from',
  'to',
  'selected',
  'results',
  'state',
  'action',
  'sort',
  'clicked_at',
]);
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,119}$/i;
export function sanitizeParams(
  params: Record<string, string | number | undefined>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (!ALLOWED_PARAMS.has(k) || v === undefined) continue;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) out[k] = v;
      continue;
    }
    const s = String(v);
    const ok =
      k === 'clicked_at'
        ? /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(s)
        : k === 'selected'
          ? // one of our own paths, never another site
            /^\/[a-z0-9][a-z0-9\-/]{0,119}$/.test(s) && !s.includes('//')
          : // a slug/enum: no dots (Sanity ids like "product.x"), no slashes, no "@"
            SAFE_SLUG.test(s) && !/\d{7,}/.test(s);
    if (ok) out[k] = s;
  }
  return out;
}

export function track(name: EventName, params: Record<string, string | number | undefined> = {}) {
  try {
    window.gtag?.('event', name, { ...sanitizeParams(params), page_path: location.pathname });
  } catch {
    /* analytics must never break the page */
  }
}

/**
 * Declarative tracking: any element with data-track="event" and data-*
 * attributes is tracked on click. Affiliate links also record a timestamp.
 */
export function bindDeclarativeTracking(root: Document = document) {
  root.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-track]');
    if (!el) return;
    const name = el.dataset.track as EventName;
    const { track: _t, ...rest } = el.dataset;
    track(name, { ...rest, clicked_at: new Date().toISOString() });
  });
}
