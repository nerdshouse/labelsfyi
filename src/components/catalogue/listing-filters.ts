/**
 * Consumer listing filters and sorts (docs/comparison.md). Pure logic over
 * data attributes rendered at build time; without JS every product shows.
 * Sorts are transparent single criteria; "Match" orders by the match level,
 * whose factors are printed on every card. There is no hidden score.
 *
 * Elemental and compound amounts are separate dimensions and are never mixed.
 * Products without a value always sort LAST, whatever the direction.
 */
export interface ListingState {
  form: string;
  minElemental: number | null;
  maxElemental: number | null;
  minCompound: number | null;
  maxCompound: number | null;
  veg: boolean;
  verified: boolean;
  evidence: boolean;
  single: boolean;
  brand: string;
  maxPrice: number | null;
  sort: SortKey;
}

export const SORT_KEYS = [
  'match',
  'name',
  'elemental',
  'compound',
  'price',
  'verified',
  'evidence',
  'newest',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface ListingCard {
  slug: string;
  brand: string;
  name: string;
  forms: string[];
  elemental: number | null;
  compound: number | null;
  veg: boolean;
  verified: boolean;
  evidence: boolean;
  single: boolean;
  perServing: number | null;
  matchRank: number;
  verifiedAt: string | null;
}

export const SORT_LABEL: Record<SortKey, string> = {
  match: 'Match (amount disclosed, label verified, price observed)',
  name: 'Name (A–Z)',
  elemental: 'Elemental amount (highest first)',
  compound: 'Compound amount (highest first)',
  price: 'Price / serving (lowest first)',
  verified: 'Label verified first',
  evidence: 'Claims checked first',
  newest: 'Newest verified',
};

export function applyListing(cards: ListingCard[], s: ListingState): string[] {
  const shown = cards.filter(
    (c) =>
      (!s.form || c.forms.includes(s.form)) &&
      (s.minElemental === null || (c.elemental !== null && c.elemental >= s.minElemental)) &&
      (s.maxElemental === null || (c.elemental !== null && c.elemental <= s.maxElemental)) &&
      (s.minCompound === null || (c.compound !== null && c.compound >= s.minCompound)) &&
      (s.maxCompound === null || (c.compound !== null && c.compound <= s.maxCompound)) &&
      (!s.veg || c.veg) &&
      (!s.verified || c.verified) &&
      (!s.evidence || c.evidence) &&
      (!s.single || c.single) &&
      (!s.brand || c.brand === s.brand) &&
      (s.maxPrice === null || (c.perServing !== null && c.perServing <= s.maxPrice)),
  );
  const az = (a: ListingCard, b: ListingCard) =>
    a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
  const nullsLast = (a: number | null, b: number | null, dir: 1 | -1) =>
    a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : dir * (a - b);
  const byName = (a: ListingCard, b: ListingCard) =>
    a.name.localeCompare(b.name) || a.brand.localeCompare(b.brand) || a.slug.localeCompare(b.slug);
  const by: Record<SortKey, (a: ListingCard, b: ListingCard) => number> = {
    match: (a, b) => a.matchRank - b.matchRank || az(a, b),
    name: byName,
    elemental: (a, b) => nullsLast(a.elemental, b.elemental, -1) || az(a, b),
    compound: (a, b) => nullsLast(a.compound, b.compound, -1) || az(a, b),
    price: (a, b) => nullsLast(a.perServing, b.perServing, 1) || az(a, b),
    verified: (a, b) => Number(b.verified) - Number(a.verified) || az(a, b),
    evidence: (a, b) => Number(b.evidence) - Number(a.evidence) || az(a, b),
    newest: (a, b) => (b.verifiedAt ?? '').localeCompare(a.verifiedAt ?? '') || az(a, b),
  };
  return shown.sort(by[s.sort]).map((c) => c.slug);
}

export function initListingFilters(root: ParentNode = document) {
  const form = root.querySelector<HTMLFormElement>('[data-listing-filters]');
  const grid = root.querySelector<HTMLElement>('[data-listing-cards]');
  if (!form || !grid) return;
  const els = [...grid.querySelectorAll<HTMLElement>('[data-consumer-card]')];
  const num = (v: string | undefined) => (v ? Number(v) : null);
  const cards: ListingCard[] = els.map((el) => ({
    slug: el.dataset.slug!,
    brand: el.dataset.brand!,
    name: el.dataset.name!,
    forms: (el.dataset.forms ?? '').split('|').filter(Boolean),
    elemental: num(el.dataset.elemental),
    compound: num(el.dataset.compound),
    veg: el.dataset.veg === '1',
    verified: el.dataset.verified === '1',
    evidence: el.dataset.evidence === '1',
    single: el.dataset.single === '1',
    perServing: num(el.dataset.perServing),
    matchRank: Number(el.dataset.matchRank ?? 2),
    verifiedAt: el.dataset.verifiedAt || null,
  }));
  const bySlug = new Map(els.map((el) => [el.dataset.slug!, el]));
  const count = root.querySelector('[data-visible-count]');
  const none = root.querySelector<HTMLElement>('[data-no-match]');
  const update = () => {
    const fd = new FormData(form);
    const n = (k: string) => {
      const v = String(fd.get(k) ?? '').trim();
      return v && Number.isFinite(Number(v)) ? Number(v) : null;
    };
    const sort = String(fd.get('sort') ?? 'match') as SortKey;
    const visible = applyListing(cards, {
      form: String(fd.get('form') ?? ''),
      minElemental: n('minElemental'),
      maxElemental: n('maxElemental'),
      minCompound: n('minCompound'),
      maxCompound: n('maxCompound'),
      veg: fd.get('veg') === 'on',
      verified: fd.get('verified') === 'on',
      evidence: fd.get('evidence') === 'on',
      single: fd.get('single') === 'on',
      brand: String(fd.get('brand') ?? ''),
      maxPrice: n('maxPrice'),
      sort: (SORT_KEYS as readonly string[]).includes(sort) ? sort : 'match',
    });
    for (const el of els) el.hidden = true;
    for (const slug of visible) {
      const el = bySlug.get(slug)!;
      el.hidden = false;
      grid.append(el);
    }
    if (count) count.textContent = String(visible.length);
    none?.classList.toggle('hidden', visible.length > 0);
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
}
