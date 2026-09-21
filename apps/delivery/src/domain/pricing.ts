import type { MonthKey, RateRecord, WeeklyHours } from '@baseline/contracts';
import { blendedRate, hasUnpricedDays, sliceMonth, type RateSlice } from './rates';
import { personMonthHours } from './units';

export interface PricedSlice extends RateSlice {
  readonly hours: number;
  /** EUR. Zero for days before the first rate record. */
  readonly cost: number;
}

export interface PricedAllocation {
  readonly hours: number;
  readonly hoursPerWorkingDay: number;
  /** EUR. */
  readonly cost: number;
  readonly blendedRate: number | null;
  readonly slices: readonly PricedSlice[];
  /** True when part or all of the month falls before the person's first rate. */
  readonly partlyUnpriced: boolean;
}

/**
 * An allocation is spread evenly over the working days of its month, so every
 * working day carries the same effort. Each slice is priced at its own rate.
 */
export function priceAllocation(input: {
  readonly personMonths: number;
  readonly weeklyHours: WeeklyHours;
  readonly month: MonthKey;
  /** Every rate record of this one person. */
  readonly rates: readonly RateRecord[];
}): PricedAllocation {
  const slices = sliceMonth(input.rates, input.month);
  const days = slices.reduce((sum, slice) => sum + slice.workingDays, 0);
  const hours = input.personMonths * personMonthHours(input.weeklyHours, input.month);
  const hoursPerWorkingDay = days === 0 ? 0 : hours / days;

  const priced = slices.map((slice): PricedSlice => {
    const sliceHours = slice.workingDays * hoursPerWorkingDay;
    return { ...slice, hours: sliceHours, cost: sliceHours * (slice.hourlyCost ?? 0) };
  });

  return {
    hours,
    hoursPerWorkingDay,
    cost: priced.reduce((sum, slice) => sum + slice.cost, 0),
    blendedRate: blendedRate(slices),
    slices: priced,
    partlyUnpriced: hasUnpricedDays(slices),
  };
}
