import type { MonthKey, WeeklyHours } from '@baseline/contracts';
import { workingDays } from './calendar';

/**
 * Four ways to read one number. Person-months is the only unit stored;
 * the other three are conversions made at the edge and never written back.
 */
export type Unit = 'personMonths' | 'hours' | 'percent' | 'cost';

export const UNITS: readonly Unit[] = ['personMonths', 'hours', 'percent', 'cost'];

/** Display precision is fixed by the brief. */
export const DECIMALS: Readonly<Record<Unit, number>> = { personMonths: 2, hours: 2, percent: 1, cost: 2 };

/** What a conversion needs to know about the cell it is converting. */
export interface CellContext {
  readonly weeklyHours: WeeklyHours;
  readonly month: MonthKey;
  /** EUR per hour for this person and month; null when no rate applies yet. */
  readonly blendedRate: number | null;
}

/** One person-month = weekly hours × (working days that month ÷ 5). Never a constant. */
export function personMonthHours(weeklyHours: WeeklyHours, month: MonthKey): number {
  return (weeklyHours * workingDays(month).length) / 5;
}

export function fromPersonMonths(unit: Unit, personMonths: number, cell: CellContext): number {
  switch (unit) {
    case 'personMonths':
      return personMonths;
    case 'hours':
      return personMonths * personMonthHours(cell.weeklyHours, cell.month);
    case 'percent':
      return personMonths * 100;
    case 'cost':
      return personMonths * personMonthHours(cell.weeklyHours, cell.month) * (cell.blendedRate ?? 0);
  }
}

export type ConversionError =
  | { readonly kind: 'not-a-number' }
  | { readonly kind: 'negative' }
  | { readonly kind: 'no-rate'; readonly month: MonthKey };

export type Converted =
  | { readonly ok: true; readonly personMonths: number }
  | { readonly ok: false; readonly error: ConversionError };

/**
 * Turns a value typed in any unit into person-months. A cost is divided by the
 * cell's blended rate to give hours, and hours become person-months.
 */
export function toPersonMonths(unit: Unit, value: number, cell: CellContext): Converted {
  if (!Number.isFinite(value)) return { ok: false, error: { kind: 'not-a-number' } };
  if (value < 0) return { ok: false, error: { kind: 'negative' } };
  const monthHours = personMonthHours(cell.weeklyHours, cell.month);
  switch (unit) {
    case 'personMonths':
      return { ok: true, personMonths: value };
    case 'hours':
      return { ok: true, personMonths: value / monthHours };
    case 'percent':
      return { ok: true, personMonths: value / 100 };
    case 'cost': {
      if (cell.blendedRate === null || cell.blendedRate === 0) {
        return value === 0
          ? { ok: true, personMonths: 0 }
          : { ok: false, error: { kind: 'no-rate', month: cell.month } };
      }
      return { ok: true, personMonths: value / cell.blendedRate / monthHours };
    }
  }
}
