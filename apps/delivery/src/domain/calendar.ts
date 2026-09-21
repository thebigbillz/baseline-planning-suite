import type { IsoDate, MonthKey } from '@baseline/contracts';

/** Working days are Monday to Friday. Public holidays are ignored entirely. */
const SATURDAY = 6;
const SUNDAY = 0;

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isMonthKey(value: string): value is MonthKey {
  return MONTH_KEY.test(value);
}

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return day <= daysInMonth(year, month);
}

export function monthKey(year: number, month: number): MonthKey {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}` as MonthKey;
}

export function monthOf(date: IsoDate): MonthKey {
  return date.slice(0, 7) as MonthKey;
}

export function firstDayOf(month: MonthKey): IsoDate {
  return `${month}-01` as IsoDate;
}

function parts(month: MonthKey): { year: number; month: number } {
  return { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Every Monday-to-Friday date in the month, in order. */
export function workingDays(month: MonthKey): IsoDate[] {
  const { year, month: m } = parts(month);
  const days: IsoDate[] = [];
  for (let day = 1; day <= daysInMonth(year, m); day += 1) {
    const weekday = new Date(Date.UTC(year, m - 1, day)).getUTCDay();
    if (weekday !== SATURDAY && weekday !== SUNDAY) {
      days.push(`${month}-${String(day).padStart(2, '0')}` as IsoDate);
    }
  }
  return days;
}

export function nextMonth(month: MonthKey): MonthKey {
  const { year, month: m } = parts(month);
  return m === 12 ? monthKey(year + 1, 1) : monthKey(year, m + 1);
}

/** Inclusive on both ends. Empty when `from` is after `to`. */
export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  for (let month = from; month <= to; month = nextMonth(month)) months.push(month);
  return months;
}
