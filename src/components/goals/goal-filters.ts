/**
 * Goal page filters. Pure filtering over data attributes rendered at build
 * time; without JS every product is listed. Filters map 1:1 to structured
 * data (ingredient on label, veg status, label verification, checked claims,
 * observed price per serving). Default order is alphabetical; sorting by
 * price only when the user chooses it.
 */
export interface FilterState {
  ingredient: string;
  veg: boolean;
  verified: boolean;
  evidence: boolean;
  max: number | null;
  sort: 'az' | 'price';
}

export interface CardData {
  slug: string;
  brand: string;
  name: string;
  ingredients: string[];
  veg: boolean;
  verified: boolean;
  evidence: boolean;
  perServing: number | null;
}

/** Visible slugs in display order. A card without a price never passes a price cap. */
export function applyFilters(cards: CardData[], s: FilterState): string[] {
  const shown = cards.filter(
    (c) =>
      (!s.ingredient || c.ingredients.includes(s.ingredient)) &&
      (!s.veg || c.veg) &&
      (!s.verified || c.verified) &&
      (!s.evidence || c.evidence) &&
      (s.max === null || (c.perServing !== null && c.perServing <= s.max)),
  );
  const az = (a: CardData, b: CardData) =>
    a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
  return shown
    .sort(
      s.sort === 'price'
        ? (a, b) => (a.perServing ?? Infinity) - (b.perServing ?? Infinity) || az(a, b)
        : az,
    )
    .map((c) => c.slug);
}

export function initGoalFilters(root: ParentNode = document) {
  const form = root.querySelector<HTMLFormElement>('[data-goal-filters]');
  const grid = root.querySelector<HTMLElement>('[data-goal-cards]');
  if (!form || !grid) return;
  const els = [...grid.querySelectorAll<HTMLElement>('[data-goal-card]')];
  const cards: CardData[] = els.map((el) => ({
    slug: el.dataset.slug!,
    brand: el.dataset.brand!,
    name: el.dataset.name!,
    ingredients: (el.dataset.ingredients ?? '').split(' ').filter(Boolean),
    veg: el.dataset.veg === '1',
    verified: el.dataset.verified === '1',
    evidence: el.dataset.evidence === '1',
    perServing: el.dataset.perServing ? Number(el.dataset.perServing) : null,
  }));
  const bySlug = new Map(els.map((el) => [el.dataset.slug!, el]));
  const chips = [...root.querySelectorAll<HTMLButtonElement>('[data-chip]')];
  const count = root.querySelector('[data-visible-count]');
  const none = root.querySelector<HTMLElement>('[data-no-match]');
  let ingredient = new URL(location.href).searchParams.get('ingredient') ?? '';

  const update = () => {
    const fd = new FormData(form);
    const maxRaw = String(fd.get('max') ?? '').trim();
    const visible = applyFilters(cards, {
      ingredient,
      veg: fd.get('veg') === 'on',
      verified: fd.get('verified') === 'on',
      evidence: fd.get('evidence') === 'on',
      max: maxRaw && Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : null,
      sort: fd.get('sort') === 'price' ? 'price' : 'az',
    });
    for (const el of els) el.hidden = true;
    for (const slug of visible) {
      const el = bySlug.get(slug)!;
      el.hidden = false;
      grid.append(el); // reorder
    }
    for (const chip of chips)
      chip.setAttribute('aria-pressed', String(chip.dataset.chip === ingredient));
    if (count) count.textContent = String(visible.length);
    none?.classList.toggle('hidden', visible.length > 0);
  };

  for (const chip of chips)
    chip.addEventListener('click', () => {
      ingredient = chip.dataset.chip ?? '';
      const url = new URL(location.href);
      if (ingredient) url.searchParams.set('ingredient', ingredient);
      else url.searchParams.delete('ingredient');
      history.replaceState(null, '', url);
      update();
    });
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
}
