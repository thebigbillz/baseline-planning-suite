import type { IsoDate, MonthKey, RateRecord } from '@baseline/contracts';
import { workingDays } from './calendar';

/**
 * A run of consecutive working days in one month priced at one rate.
 * `hourlyCost` is null for days before the person's first rate record:
 * those days cost nothing and the cell is marked.
 */
export interface RateSlice {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly workingDays: number;
  readonly hourlyCost: number | null;
}

/** ISO dates compare correctly as strings. `validFrom` is inclusive. */
function rateOn(sortedRates: readonly RateRecord[], day: IsoDate): RateRecord | null {
  let applicable: RateRecord | null = null;
  for (const rate of sortedRates) {
    if (rate.validFrom <= day) applicable = rate;
    else break;
  }
  return applicable;
}

/**
 * Splits a month's working days by the rate in force on each day. One
 * mid-month change gives two slices; more changes simply give more.
 * `rates` must all belong to one person.
 */
export function sliceMonth(rates: readonly RateRecord[], month: MonthKey): RateSlice[] {
  const sorted = [...rates].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  const slices: RateSlice[] = [];
  let open: { from: IsoDate; to: IsoDate; days: number; rate: RateRecord | null } | null = null;

  for (const day of workingDays(month)) {
    const rate = rateOn(sorted, day);
    if (open !== null && open.rate?.id === rate?.id) {
      open.to = day;
      open.days += 1;
    } else {
      if (open !== null) slices.push(close(open));
      open = { from: day, to: day, days: 1, rate };
    }
  }
  if (open !== null) slices.push(close(open));
  return slices;
}

function close(open: { from: IsoDate; to: IsoDate; days: number; rate: RateRecord | null }): RateSlice {
  return { from: open.from, to: open.to, workingDays: open.days, hourlyCost: open.rate?.hourlyCost ?? null };
}

/**
 * The month's rate weighted by working days, in EUR per hour. It does not
 * depend on the amount planned, so an empty cell can still be edited in cost.
 * Unpriced days count as zero. Null when no day in the month has a rate.
 */
export function blendedRate(slices: readonly RateSlice[]): number | null {
  const days = slices.reduce((sum, slice) => sum + slice.workingDays, 0);
  if (days === 0 || slices.every((slice) => slice.hourlyCost === null)) return null;
  const weighted = slices.reduce((sum, slice) => sum + slice.workingDays * (slice.hourlyCost ?? 0), 0);
  return weighted / days;
}

export function hasUnpricedDays(slices: readonly RateSlice[]): boolean {
  return slices.some((slice) => slice.hourlyCost === null);
}

export function startsMidMonth(rate: RateRecord): boolean {
  return !rate.validFrom.endsWith('-01');
}
