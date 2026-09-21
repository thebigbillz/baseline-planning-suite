import type { IsoDate, MonthKey } from '@baseline/contracts';
import type { DisplayCurrency } from '@baseline/contracts/host';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const dateLabel = (date: IsoDate): string => `${date.slice(8, 10)} ${MONTHS[Number(date.slice(5, 7)) - 1] ?? ''} ${date.slice(0, 4)}`;
export const monthLabel = (month: MonthKey): string => `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;
export const monthInitial = (month: MonthKey): string => (MONTHS[Number(month.slice(5, 7)) - 1] ?? '').slice(0, 1);
export const percent = (personMonths: number): string => `${(personMonths * 100).toFixed(1)}%`;
export const euros = (value: number): string => `€${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Rates are stored and entered in EUR. In another display currency the converted figure is shown beside it, for reading only. */
export const inDisplayCurrency = (eur: number, currency: DisplayCurrency): string | null =>
  currency.code === 'EUR' ? null : `≈ ${currency.symbol}${(eur * currency.perEuro).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const today = (): IsoDate => new Date().toISOString().slice(0, 10) as IsoDate;
export const thisMonth = (): MonthKey => new Date().toISOString().slice(0, 7) as MonthKey;

export function monthsFrom(first: MonthKey, count: number): MonthKey[] {
  const months: MonthKey[] = [];
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7));
  for (let index = 0; index < count; index += 1) {
    months.push(`${year}-${String(month).padStart(2, '0')}` as MonthKey);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
