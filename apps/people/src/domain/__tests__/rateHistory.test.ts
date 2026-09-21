import { describe, expect, it } from 'vitest';
import type { EmployeeId, IsoDate, MonthKey, RateRecord, RateRecordId } from '@baseline/contracts';
import { afterDeleting, periodsOf, rateAtEndOf, rateOn, reach, validateDraft } from '../rateHistory';

const rate = (id: string, validFrom: string, hourlyCost: number): RateRecord => ({ id: id as RateRecordId, employeeId: 'emp-023' as EmployeeId, validFrom: validFrom as IsoDate, hourlyCost });
const day = (value: string): IsoDate => value as IsoDate;

// Henrik Bauer in the fixture.
const history = [rate('r2', '2026-01-01', 88), rate('r1', '2025-01-01', 76), rate('r3', '2026-09-10', 81)];

describe('rate periods', () => {
  it('derive each end date from the next record; the latest is open-ended', () => {
    expect(periodsOf(history).map((period) => [period.record.validFrom, period.until, period.startsMidMonth, period.isFirst])).toEqual([
      ['2026-09-10', null, true, false],
      ['2026-01-01', '2026-09-09', false, false],
      ['2025-01-01', '2025-12-31', false, true],
    ]);
  });

  it('treat validFrom as inclusive', () => {
    expect(rateOn(history, day('2026-09-09'))?.hourlyCost).toBe(88);
    expect(rateOn(history, day('2026-09-10'))?.hourlyCost).toBe(81);
    expect(rateOn(history, day('2024-12-31'))).toBeNull();
  });

  it('report the rate a month ends on', () => {
    expect(rateAtEndOf(history, '2026-09' as MonthKey)?.hourlyCost).toBe(81);
    expect(rateAtEndOf(history, '2026-06' as MonthKey)?.hourlyCost).toBe(88);
  });
});

describe('validating a draft', () => {
  it('refuses two rates starting on the same day, and says which', () => {
    expect(validateDraft(history, { validFrom: '2026-09-10', hourlyCost: '84' }, null)).toEqual({ kind: 'clash', with: history[2] });
  });

  it('lets a record keep its own date when it is corrected', () => {
    expect(validateDraft(history, { validFrom: '2026-01-01', hourlyCost: '90' }, history[0] ?? null)).toBeNull();
  });

  it('refuses impossible dates and costs', () => {
    expect(validateDraft(history, { validFrom: '2026-02-30', hourlyCost: '90' }, null)).toEqual({ kind: 'bad-date' });
    expect(validateDraft(history, { validFrom: '2026-02-01', hourlyCost: '-1' }, null)).toEqual({ kind: 'bad-cost' });
    expect(validateDraft(history, { validFrom: '2026-02-01', hourlyCost: '' }, null)).toEqual({ kind: 'bad-cost' });
  });
});

describe('saying what a change reaches', () => {
  it('a corrected past rate reprices up to the day before the next one', () => {
    expect(reach(history, day('2026-01-01'), history[0] ?? null, day('2026-09-21'))).toEqual({ from: '2026-01-01', until: '2026-09-09', retroactive: true });
  });

  it('a future rate is open-ended and not retroactive', () => {
    expect(reach(history, day('2027-01-01'), null, day('2026-09-21'))).toEqual({ from: '2027-01-01', until: null, retroactive: false });
  });
});

describe('deleting', () => {
  it('lets the previous rate take over until the next one', () => {
    expect(afterDeleting(history, history[0] as RateRecord)).toEqual({ takesOver: history[1], until: '2026-09-09' });
  });

  it('leaves nothing in force when the first rate goes', () => {
    expect(afterDeleting(history, history[1] as RateRecord)).toEqual({ takesOver: null, until: '2025-12-31' });
  });
});
