/**
 * Client-side analytics. A thin wrapper over gtag so the rest of the code
 * never talks to a vendor directly. Everything no-ops when GA is not configured.
 *
 * Events: product_view, search, comparison_view, affiliate_click, newsletter_signup.
 */

type EventName =
  'product_view' | 'search' | 'comparison_view' | 'affiliate_click' | 'newsletter_signup';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(name: EventName, params: Record<string, string | number | undefined> = {}) {
  try {
    window.gtag?.('event', name, { ...params, page_path: location.pathname });
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
