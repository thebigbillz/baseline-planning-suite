import type { IsoDate, MonthKey, RateRecord } from '@baseline/contracts';

/**
 * People owns the facts about rates; what a plan costs is Delivery's business.
 * Nothing here knows about allocations.
 */

const DAY_MS = 86_400_000;

export function dayBefore(date: IsoDate): IsoDate {
  return new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10) as IsoDate;
}

export function isRealDate(value: string): value is IsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

/** One row of a person's history. A record has no end date: `until` is derived from the next record. */
export interface RatePeriod {
  readonly record: RateRecord;
  /** Last day this rate applies; null for the open-ended latest rate. */
  readonly until: IsoDate | null;
  readonly startsMidMonth: boolean;
  readonly isFirst: boolean;
}

/** Newest first, the way the history is read. */
export function periodsOf(records: readonly RateRecord[]): RatePeriod[] {
  const ascending = [...records].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  return ascending
    .map((record, index): RatePeriod => {
      const next = ascending[index + 1];
      return { record, until: next === undefined ? null : dayBefore(next.validFrom), startsMidMonth: !record.validFrom.endsWith('-01'), isFirst: index === 0 };
    })
    .reverse();
}

/** The rate in force on a day. `validFrom` is inclusive. Null before the first record. */
export function rateOn(records: readonly RateRecord[], day: IsoDate): RateRecord | null {
  return periodsOf(records).find((period) => period.record.validFrom <= day)?.record ?? null;
}

/** The rate a month ends on: what "effective rate" means for a month that contains a change. */
export function rateAtEndOf(records: readonly RateRecord[], month: MonthKey): RateRecord | null {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10) as IsoDate;
  return rateOn(records, lastDay);
}

export type RateDraftError = { readonly kind: 'bad-date' } | { readonly kind: 'bad-cost' } | { readonly kind: 'clash'; readonly with: RateRecord };

/** Checked here for an immediate answer; People's service checks the same rules again before it writes. */
export function validateDraft(records: readonly RateRecord[], draft: { validFrom: string; hourlyCost: string }, editing: RateRecord | null): RateDraftError | null {
  if (!isRealDate(draft.validFrom)) return { kind: 'bad-date' };
  const cost = Number(draft.hourlyCost);
  if (draft.hourlyCost.trim() === '' || !Number.isFinite(cost) || cost < 0) return { kind: 'bad-cost' };
  const clash = records.find((record) => record.validFrom === draft.validFrom && record.id !== editing?.id);
  return clash === undefined ? null : { kind: 'clash', with: clash };
}

/** What a saved change will reprice, so the form can say it before the user commits. */
export function reach(records: readonly RateRecord[], validFrom: IsoDate, editing: RateRecord | null, today: IsoDate): { from: IsoDate; until: IsoDate | null; retroactive: boolean } {
  const others = records.filter((record) => record.id !== editing?.id).map((record) => record.validFrom).sort();
  const next = others.find((date) => date > validFrom);
  return { from: validFrom, until: next === undefined ? null : dayBefore(next), retroactive: validFrom <= today };
}

/** What takes a deleted rate's place: the rate before it, or nothing at all. */
export function afterDeleting(records: readonly RateRecord[], doomed: RateRecord): { takesOver: RateRecord | null; until: IsoDate | null } {
  const remaining = records.filter((record) => record.id !== doomed.id);
  const takesOver = rateOn(remaining, doomed.validFrom);
  const next = remaining.map((record) => record.validFrom).sort().find((date) => date > doomed.validFrom);
  return { takesOver, until: next === undefined ? null : dayBefore(next) };
}
