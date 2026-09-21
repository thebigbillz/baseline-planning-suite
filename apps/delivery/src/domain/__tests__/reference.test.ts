import { describe, expect, it } from 'vitest';
import { workingDays } from '../calendar';
import { priceAllocation } from '../pricing';
import { sliceMonth } from '../rates';
import { fromPersonMonths, personMonthHours, toPersonMonths } from '../units';
import { month, rate } from './fixtures';

/**
 * The brief's reference calculation (Figure 4). A. Okafor, 40 h/week,
 * €80.00/h from 2025-01-01 and €95.00/h from 2026-03-12, one leaf cell of
 * 0.50 person-months in March 2026.
 */
const rates = [rate('rate-001', 'emp-001', '2025-01-01', 80), rate('rate-002', 'emp-001', '2026-03-12', 95)];
const march = month('2026-03');
const priced = priceAllocation({ personMonths: 0.5, weeklyHours: 40, month: march, rates });

describe('reference calculation', () => {
  it('counts 22 working days in March 2026', () => {
    expect(workingDays(march)).toHaveLength(22);
  });

  it('splits the month 8 / 14 because validFrom is inclusive', () => {
    expect(sliceMonth(rates, march).map((slice) => [slice.from, slice.to, slice.workingDays, slice.hourlyCost])).toEqual([
      ['2026-03-02', '2026-03-11', 8, 80],
      ['2026-03-12', '2026-03-31', 14, 95],
    ]);
  });

  it('makes one person-month 176.00 h', () => {
    expect(personMonthHours(40, march)).toBe(176);
  });

  it('turns 0.50 PM into 88.00 h at 4.00 h per working day', () => {
    expect(priced.hours).toBe(88);
    expect(priced.hoursPerWorkingDay).toBe(4);
  });

  it('costs €7,880.00: 8 × 4 × 80 + 14 × 4 × 95', () => {
    expect(priced.slices.map((slice) => slice.cost)).toEqual([2560, 5320]);
    expect(priced.cost).toBe(7880);
  });

  it('reads as 50.0% of capacity', () => {
    expect(fromPersonMonths('percent', 0.5, { weeklyHours: 40, month: march, blendedRate: priced.blendedRate })).toBe(50);
  });

  it('implies a blended rate of €89.5455/h', () => {
    expect(priced.blendedRate?.toFixed(4)).toBe('89.5455');
  });

  it('turns €7,880.00 typed into the cell back into 0.50 PM', () => {
    const converted = toPersonMonths('cost', 7880, { weeklyHours: 40, month: march, blendedRate: priced.blendedRate });
    expect(converted.ok && converted.personMonths).toBeCloseTo(0.5, 12);
  });
});
