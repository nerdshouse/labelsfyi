/** Copy link + native share for a label comparison. No image export (yet). */
import { track } from '@/lib/analytics/events';

export function initCompareShare(root: ParentNode = document) {
  const cmp = document.querySelector<HTMLElement>('[data-compare]');
  if (cmp) track('compare', { pair: cmp.dataset.compare?.split('/').pop() });
  root.querySelectorAll<HTMLElement>('[data-compare-share]').forEach((el) => {
    if (el.dataset.ready) return;
    el.dataset.ready = '1';
    const url = new URL(el.dataset.compareShare!, location.origin).toString();
    const status = el.querySelector<HTMLElement>('[data-share-status]');
    const say = (msg: string) => {
      if (status) status.textContent = msg;
    };
    el.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        say('Link copied');
      } catch {
        say(url);
      }
    });
    const share = el.querySelector<HTMLButtonElement>('[data-action="share"]');
    if (share && typeof navigator.share === 'function') {
      share.hidden = false;
      share.addEventListener('click', () => {
        navigator.share({ title: document.title, url }).catch(() => {});
      });
    }
  });
}
