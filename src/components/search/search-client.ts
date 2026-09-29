import type { SearchDocument } from '@/lib/content/types';
import { createLocalEngine, type SearchEngine } from '@/lib/search/engine';
import { track } from '@/lib/analytics/events';

/**
 * Client-side search runtime shared by the header/hero autocomplete and the
 * /search page. The index is fetched once and cached for the page lifetime.
 */

let enginePromise: Promise<SearchEngine> | undefined;

export function loadEngine(): Promise<SearchEngine> {
  enginePromise ??= fetch('/search-index.json')
    .then((r) => {
      if (!r.ok) throw new Error(`Search index ${r.status}`);
      return r.json() as Promise<SearchDocument[]>;
    })
    .then(createLocalEngine)
    .catch((err) => {
      enginePromise = undefined;
      throw err;
    });
  return enginePromise;
}

export const TYPE_LABEL: Record<SearchDocument['type'], string> = {
  goal: 'Goal',
  product: 'Product',
  ingredient: 'Ingredient',
  brand: 'Brand',
  comparison: 'Compare',
  guide: 'Guide',
};

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export function initSearchBoxes() {
  document.querySelectorAll<HTMLFormElement>('[data-search-box]').forEach((form) => {
    if (form.dataset.ready) return;
    form.dataset.ready = '1';
    const input = form.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    const list = form.querySelector<HTMLUListElement>('[role="listbox"]')!;
    let active = -1;
    let items: SearchDocument[] = [];

    const close = () => {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    };

    const render = () => {
      if (!items.length) return close();
      list.innerHTML = items
        .map(
          (d, i) => `<li id="${list.id}-${i}" role="option" aria-selected="${i === active}"
            class="flex cursor-pointer items-baseline justify-between gap-3 border-b border-line-2 px-3 py-2.5 last:border-b-0 aria-selected:bg-marker-soft hover:bg-paper-2"
            data-url="${escape(d.url)}">
            <span class="min-w-0"><span class="block truncate font-medium">${escape(d.title)}</span>
            <span class="block truncate text-xs text-ink-3">${escape(d.subtitle)}</span></span>
            <span class="caption shrink-0 text-ink-3">${TYPE_LABEL[d.type]}</span></li>`,
        )
        .join('');
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      if (active >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
      else input.removeAttribute('aria-activedescendant');
    };

    const update = async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        items = [];
        return close();
      }
      try {
        const engine = await loadEngine();
        if (input.value.trim() !== q) return; // stale
        items = engine.search(q, { limit: 6 }).map((h) => h.doc);
        active = -1;
        render();
      } catch {
        close(); // fall back to plain form submit
      }
    };

    input.addEventListener('focus', () => void loadEngine().catch(() => {}), { once: true });
    input.addEventListener('input', () => void update());
    input.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        // Cycle through -1 (the input itself) and 0…n-1 (the options).
        const states = items.length + 1;
        active = ((active + 1 + delta + states) % states) - 1;
        render();
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        go(items[active]!);
      } else if (e.key === 'Escape') {
        close();
      }
    });
    list.addEventListener('mousedown', (e) => {
      const li = (e.target as Element).closest<HTMLElement>('[data-url]');
      if (!li) return;
      e.preventDefault();
      const idx = Number(li.id.split('-').pop());
      go(items[idx]!);
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
    // Never the typed text (free text can contain anything): only that a search happened.
    form.addEventListener('submit', () => track('search', { from: 'box' }));

    function go(doc: SearchDocument) {
      track('search', { from: 'suggestion', selected: doc.url });
      location.href = doc.url;
    }
  });
}
