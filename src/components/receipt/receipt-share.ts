/**
 * Share controls for a receipt: copy link, native share, PNG download.
 * The PNG is rendered in the browser from the receipt's own HTML at exactly
 * 1080×1080 (html-to-image is loaded only when the button is used).
 */
import { track } from '@/lib/analytics/events';

export function initReceiptShare(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-receipt-share]').forEach((el) => {
    if (el.dataset.ready) return;
    el.dataset.ready = '1';
    track('receipt_view', { slug: el.dataset.slug });
    el.addEventListener('click', (e) => {
      const action = (e.target as Element | null)?.closest<HTMLElement>('[data-action]')?.dataset
        .action;
      if (action) track('receipt_share', { slug: el.dataset.slug, action });
    });
    const status = el.querySelector<HTMLElement>('[data-share-status]');
    const url = new URL(el.dataset.receiptShare!, location.origin).toString();
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

    el.querySelector('[data-action="png"]')?.addEventListener('click', async () => {
      const node = document.querySelector<HTMLElement>(`[data-receipt="${el.dataset.slug}"]`);
      if (!node) return;
      say('Preparing image…');
      try {
        const { toPng } = await import('html-to-image');
        await document.fonts.ready;
        node.classList.add('is-exporting');
        const dataUrl = await toPng(node, {
          width: 1080,
          height: 1080,
          pixelRatio: 1,
          cacheBust: true,
        });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `labels-fyi-receipt-${el.dataset.slug}.png`;
        a.click();
        say('Image downloaded (1080×1080)');
      } catch {
        say('Could not create the image in this browser. Use the link instead.');
      } finally {
        node.classList.remove('is-exporting');
      }
    });
  });
}
