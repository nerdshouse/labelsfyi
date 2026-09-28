import type { Quantity, Unit } from '@/lib/content/types';

const UNIT_LABEL: Record<Unit, string> = {
  mcg: 'mcg',
  mg: 'mg',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'L',
  IU: 'IU',
  kcal: 'kcal',
  kJ: 'kJ',
  CFU: 'CFU',
  count: '',
};

const NUMBER = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function formatNumber(n: number, maxFractionDigits = 2): string {
  return maxFractionDigits === 2
    ? NUMBER.format(n)
    : new Intl.NumberFormat('en-IN', { maximumFractionDigits: maxFractionDigits }).format(n);
}

export function unitLabel(unit: Unit | null | undefined): string {
  return unit ? UNIT_LABEL[unit] : '';
}

/** "5 g", "2,000 IU", "120" (count). */
export function formatQuantity(q: Quantity | null | undefined): string {
  if (!q) return '—';
  const label = unitLabel(q.unit);
  return label ? `${formatNumber(q.amount)} ${label}` : formatNumber(q.amount);
}

export function formatAmount(amount: number | null, unit: Unit | null): string {
  if (amount === null) return '—';
  return formatQuantity({ amount, unit: unit ?? 'count' });
}
