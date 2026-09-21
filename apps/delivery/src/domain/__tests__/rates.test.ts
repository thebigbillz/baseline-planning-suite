import { describe, expect, it } from 'vitest';
import { monthsBetween, workingDays } from '../calendar';
import { priceAllocation } from '../pricing';
import { blendedRate, sliceMonth } from '../rates';
import { month, rate } from './fixtures';

describe('working days', () => {
  it('are Monday to Friday and ignore public holidays', () => {
    // December 2026 has 23 weekdays; the 25th is a Friday and still counts.
    expect(workingDays(month('2026-12'))).toHaveLength(23);
    expect(workingDays(month('2026-12'))).toContain('2026-12-25');
  });

  it('handles February in a leap year', () => {
    expect(workingDays(month('2028-02'))).toHaveLength(21);
  });

  it('lists months across a year boundary, inclusive', () => {
    expect(monthsBetween(month('2026-11'), month('2027-02'))).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});

describe('rate slicing', () => {
  it('gives one slice when the rate does not change in the month', () => {
    const slices = sliceMonth([rate('r1', 'e1', '2025-01-01', 80)], month('2026-04'));
    expect(slices).toHaveLength(1);
    expect(slices[0]?.workingDays).toBe(22);
  });

  it('does not care about the order rates arrive in', () => {
    const rates = [rate('r2', 'e1', '2026-03-12', 95), rate('r1', 'e1', '2025-01-01', 80)];
    expect(sliceMonth(rates, month('2026-03')).map((slice) => slice.hourlyCost)).toEqual([80, 95]);
  });

  it('gives more than two slices when a month has more than one change', () => {
    const rates = [rate('r1', 'e1', '2025-01-01', 80), rate('r2', 'e1', '2026-03-10', 90), rate('r3', 'e1', '2026-03-20', 100)];
    const slices = sliceMonth(rates, month('2026-03'));
    expect(slices.map((slice) => [slice.workingDays, slice.hourlyCost])).toEqual([[6, 80], [8, 90], [8, 100]]);
    expect(slices.reduce((days, slice) => days + slice.workingDays, 0)).toBe(22);
  });

  it('treats a change that lands on a weekend as starting on the next working day', () => {
    // 14 March 2026 is a Saturday.
    const rates = [rate('r1', 'e1', '2025-01-01', 80), rate('r2', 'e1', '2026-03-14', 95)];
    expect(sliceMonth(rates, month('2026-03')).map((slice) => [slice.from, slice.workingDays])).toEqual([
      ['2026-03-02', 10],
      ['2026-03-16', 12],
    ]);
  });

  it('a rate that starts on the 1st replaces the old one for the whole month', () => {
    const rates = [rate('r1', 'e1', '2025-01-01', 80), rate('r2', 'e1', '2026-04-01', 95)];
    expect(sliceMonth(rates, month('2026-04')).map((slice) => slice.hourlyCost)).toEqual([95]);
  });
});

describe('before the first rate record', () => {
  const rates = [rate('r1', 'e1', '2026-06-01', 100)];

  it('costs zero and is marked', () => {
    const priced = priceAllocation({ personMonths: 1, weeklyHours: 40, month: month('2026-05'), rates });
    expect(priced.cost).toBe(0);
    expect(priced.partlyUnpriced).toBe(true);
    expect(priced.blendedRate).toBeNull();
    expect(priced.hours).toBe(168);
  });

  it('prices only the days from the first rate when it starts mid-month', () => {
    const lateStart = [rate('r1', 'e1', '2026-03-12', 95)];
    const priced = priceAllocation({ personMonths: 0.5, weeklyHours: 40, month: month('2026-03'), rates: lateStart });
    expect(priced.cost).toBe(14 * 4 * 95);
    expect(priced.partlyUnpriced).toBe(true);
    expect(blendedRate(priced.slices)).toBeCloseTo((14 * 95) / 22, 10);
  });

  it('has no rate at all for a person without records', () => {
    const priced = priceAllocation({ personMonths: 1, weeklyHours: 32, month: month('2026-05'), rates: [] });
    expect(priced.cost).toBe(0);
    expect(priced.blendedRate).toBeNull();
  });
});
