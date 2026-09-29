/**
 * Structured serving descriptions: "2 capsules", "1 scoop (35.5 g)".
 * Stored as fields, displayed from fields; never a single flattened string.
 */

export const SERVING_UNITS = [
  'serving',
  'capsule',
  'tablet',
  'softgel',
  'strip',
  'scoop',
  'sachet',
  'gummy',
  'ml',
  'g',
] as const;
export type ServingUnit = (typeof SERVING_UNITS)[number];

export interface ServingSpec {
  count: number;
  unit: ServingUnit;
  /** Weight/volume of one serving when printed, e.g. 35.5 g for a scoop. */
  mass: number | null;
  massUnit: 'g' | 'mg' | 'ml' | null;
}

const UNIT_ALIASES: Record<string, ServingUnit> = {
  serving: 'serving',
  servings: 'serving',
  capsule: 'capsule',
  capsules: 'capsule',
  cap: 'capsule',
  caps: 'capsule',
  vcap: 'capsule',
  vcaps: 'capsule',
  tablet: 'tablet',
  tablets: 'tablet',
  tab: 'tablet',
  tabs: 'tablet',
  softgel: 'softgel',
  softgels: 'softgel',
  strip: 'strip',
  strips: 'strip',
  scoop: 'scoop',
  scoops: 'scoop',
  sachet: 'sachet',
  sachets: 'sachet',
  stick: 'sachet',
  sticks: 'sachet',
  gummy: 'gummy',
  gummies: 'gummy',
  ml: 'ml',
  g: 'g',
  gm: 'g',
  gram: 'g',
  grams: 'g',
};

/**
 * Parse a printed serving description. Returns null rather than guessing
 * when the text doesn't follow "<count> <unit> [(<mass> <unit>)]".
 * Qualifiers such as "oral", "level", "approx." are ignored.
 */
export function parseServing(text: string | null | undefined): ServingSpec | null {
  if (!text) return null;
  const t = text
    .toLowerCase()
    .replace(/[,]/g, '')
    .replace(/\b(oral|thin|level|heaped|approx\.?|approximately)\b/g, ' ');
  const main = /(\d+(?:\.\d+)?)\s*([a-z]+)/.exec(t);
  if (!main) return null;
  const unit = UNIT_ALIASES[main[2]!];
  if (!unit) return null;
  const count = Number(main[1]);
  const massMatch = /\(\s*(\d+(?:\.\d+)?)\s*(g|gm|mg|ml)\b/.exec(t);
  const massUnit = massMatch
    ? massMatch[2] === 'gm'
      ? 'g'
      : (massMatch[2] as 'g' | 'mg' | 'ml')
    : null;
  // "1 scoop 35.5 g" without brackets: second quantity with a mass unit.
  const bare = massMatch ? null : /\d+(?:\.\d+)?\s*[a-z]+\s+(\d+(?:\.\d+)?)\s*(g|mg|ml)\b/.exec(t);
  if (unit === 'g' || unit === 'ml') {
    return { count: 1, unit: 'serving', mass: count, massUnit: unit };
  }
  return {
    count,
    unit,
    mass: massMatch ? Number(massMatch[1]) : bare ? Number(bare[1]) : null,
    massUnit: massMatch ? massUnit : bare ? (bare[2] as 'g' | 'mg' | 'ml') : null,
  };
}

const PLURAL: Record<ServingUnit, string> = {
  serving: 'servings',
  capsule: 'capsules',
  tablet: 'tablets',
  softgel: 'softgels',
  strip: 'strips',
  scoop: 'scoops',
  sachet: 'sachets',
  gummy: 'gummies',
  ml: 'ml',
  g: 'g',
};

/** "2 capsules", "1 scoop (35.5 g)", "30 g". */
export function formatServing(s: ServingSpec | null | undefined): string | null {
  if (!s) return null;
  const n = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
  if (s.unit === 'serving' && s.mass !== null) return `${n.format(s.mass)} ${s.massUnit}`;
  const unit = s.count === 1 ? s.unit : PLURAL[s.unit];
  const mass = s.mass !== null && s.massUnit ? ` (${n.format(s.mass)} ${s.massUnit})` : '';
  return `${n.format(s.count)} ${unit}${mass}`;
}
