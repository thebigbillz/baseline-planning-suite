import { describe, expect, it } from 'vitest';
import { DECIMALS, UNITS, fromPersonMonths, personMonthHours, toPersonMonths, type CellContext } from '../units';
import { month } from './fixtures';

const cell: CellContext = { weeklyHours: 32, month: month('2026-09'), blendedRate: 83.22727272727273 };

describe('person-month', () => {
  it('varies by person and by month; it is never a constant', () => {
    expect(personMonthHours(40, month('2026-03'))).toBe(176);
    expect(personMonthHours(40, month('2026-02'))).toBe(160);
    expect(personMonthHours(32, month('2026-03'))).toBe(140.8);
    expect(personMonthHours(20, month('2026-03'))).toBe(88);
  });

  it('is exactly 100% of capacity', () => {
    expect(fromPersonMonths('percent', 1, cell)).toBe(100);
  });
});

describe('unit conversion', () => {
  it('fixes display precision: hours 2, person-months 2, % 1, cost 2', () => {
    expect(DECIMALS).toEqual({ personMonths: 2, hours: 2, percent: 1, cost: 2 });
  });

  it('round-trips every unit without changing the stored value', () => {
    for (const stored of [0.2, 0.333333, 0.59, 1, 1.18]) {
      for (const unit of UNITS) {
        const shown = fromPersonMonths(unit, stored, cell);
        const back = toPersonMonths(unit, shown, cell);
        expect(back.ok && back.personMonths).toBeCloseTo(stored, 12);
      }
    }
  });

  it('divides a typed cost by the blended rate to get hours, then person-months', () => {
    const converted = toPersonMonths('cost', 1464.8, { weeklyHours: 20, month: month('2026-09'), blendedRate: 1464.8 / 17.6 });
    expect(converted.ok && converted.personMonths).toBeCloseTo(0.2, 12);
  });

  it('refuses a cost where no rate applies, instead of storing nonsense', () => {
    expect(toPersonMonths('cost', 500, { ...cell, blendedRate: null })).toEqual({
      ok: false,
      error: { kind: 'no-rate', month: '2026-09' },
    });
    expect(toPersonMonths('cost', 0, { ...cell, blendedRate: null })).toEqual({ ok: true, personMonths: 0 });
  });

  it('rejects negatives and non-numbers', () => {
    expect(toPersonMonths('hours', -1, cell)).toEqual({ ok: false, error: { kind: 'negative' } });
    expect(toPersonMonths('hours', Number.NaN, cell)).toEqual({ ok: false, error: { kind: 'not-a-number' } });
  });
});
