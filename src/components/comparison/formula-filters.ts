/**
 * Client-side filters for the formula comparison. Filters hide rows; they
 * never reorder them (rows stay alphabetical: no ranking).
 */
export function initFormulaFilters(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-formula-comparison]').forEach((el) => {
    if (el.dataset.ready) return;
    el.dataset.ready = '1';
    const form = el.querySelector<HTMLSelectElement>('[data-filter="form"]');
    const veg = el.querySelector<HTMLSelectElement>('[data-filter="veg"]');
    const price = el.querySelector<HTMLInputElement>('[data-filter="price"]');
    const status = el.querySelector<HTMLElement>('[data-filter-status]');
    const rows = [...el.querySelectorAll<HTMLElement>('[data-row]')];
    const total = new Set(rows.map((r) => r.dataset.row)).size;

    const apply = () => {
      const max = price?.value ? Number(price.value) : null;
      const noPrice = new Set<string>();
      const shown = new Set<string>();
      for (const r of rows) {
        const pps = r.dataset.pps ? Number(r.dataset.pps) : null;
        let visible =
          (!form?.value || r.dataset.form === form.value) &&
          (!veg?.value || r.dataset.veg === veg.value);
        if (visible && max !== null) {
          if (pps === null) {
            visible = false;
            noPrice.add(r.dataset.row!);
          } else visible = pps <= max;
        }
        r.hidden = !visible;
        if (visible) shown.add(r.dataset.row!);
      }
      if (status) {
        // Each product appears twice (table + mobile list), so count unique ids.
        const hiddenNoPrice =
          max !== null && noPrice.size > 0
            ? ` · ${noPrice.size} without an observed price hidden`
            : '';
        status.textContent = `Showing ${shown.size} of ${total}${hiddenNoPrice}`;
      }
    };
    [form, veg, price].forEach((c) => c?.addEventListener('input', apply));
    el.querySelector('[data-filter-reset]')?.addEventListener('click', () => {
      if (form) form.value = '';
      if (veg) veg.value = '';
      if (price) price.value = '';
      apply();
    });
    apply();
  });
}
