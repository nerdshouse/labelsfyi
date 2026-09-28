import type { Money } from '@/lib/calculations';

const LOCALE: Record<Money['currency'], string> = { INR: 'en-IN', USD: 'en-US' };

/**
 * Format money for display. Whole pack prices drop decimals (₹1,499);
 * per-unit prices keep two (₹49.97) and sub-rupee values keep three.
 */
export function formatMoney(m: Money, opts: { precise?: boolean } = {}): string {
  const whole = Number.isInteger(m.amount) && !opts.precise;
  const digits = whole ? 0 : m.amount < 1 ? 3 : 2;
  return new Intl.NumberFormat(LOCALE[m.currency], {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(m.amount);
}
