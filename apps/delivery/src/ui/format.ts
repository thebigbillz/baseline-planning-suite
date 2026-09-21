import type { IsoDate, MonthKey } from '@baseline/contracts';
import { formatUnits } from '../domain/rounding';
import { DECIMALS, type Unit } from '../domain/units';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "2026-03" → "Mar 26" */
export const monthLabel = (month: MonthKey): string => `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(2, 4)}`;

/** "2026-03" → "March 2026" */
export const monthName = (month: MonthKey): string =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "2026-03-12" → "12 Mar 2026" */
export const dateLabel = (date: IsoDate): string => `${date.slice(8, 10)} ${MONTHS[Number(date.slice(5, 7)) - 1] ?? ''} ${date.slice(0, 4)}`;

export const dayOfMonth = (date: IsoDate): string => date.slice(8, 10);

export const displayed = (units: number | null, unit: Unit): string => (units === null ? '–' : formatUnits(units, DECIMALS[unit]));

export const fixed = (value: number, decimals: number): string =>
  value.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const UNIT_LABEL: Readonly<Record<Unit, string>> = { personMonths: 'Person-months', hours: 'Hours', percent: 'Capacity %', cost: 'Cost' };

/** Accepts "1,234.5", "1 234.5" and "0,5"-free input; anything else is not a number. */
export function parseTyped(text: string): number {
  const cleaned = text.replace(/[\s,]/g, '');
  return /^\d*\.?\d+$|^\d+\.?$/.test(cleaned) || /^-\d*\.?\d+$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}
