import { describe, expect, it } from 'vitest';
import { LoadIndex, causeOf, isOverCapacity } from '../capacity';
import { allocation, employeeId, month, seedPlan } from './fixtures';

describe('capacity', () => {
  it('counts every project together, including ones that are not open', () => {
    const load = new LoadIndex(seedPlan.allocations);
    const milan = load.get(employeeId('emp-003'), month('2026-06'));
    expect(milan?.personMonths).toBeCloseTo(1.18, 12);
    // 0.59 in Ledger Consolidation, 0.59 in Client Portal Rebuild.
    expect(milan?.contributions.map((entry) => entry.breakdownItemId).sort()).toEqual(['wbs-012', 'wbs-061']);
    expect(load.isOver(employeeId('emp-003'), month('2026-06'))).toBe(true);
  });

  it('finds the six oversubscribed person-months in the fixture', () => {
    const over = new LoadIndex(seedPlan.allocations).overloaded().map((entry) => `${entry.employeeId} ${entry.month}`).sort();
    expect(over).toEqual(['emp-002 2026-09', 'emp-003 2026-06', 'emp-012 2026-05', 'emp-023 2026-06', 'emp-043 2026-10', 'emp-031 2026-12'].sort());
  });

  it('treats exactly 100% as fine, whatever floating point says', () => {
    expect(isOverCapacity(0.59 + 0.41)).toBe(false);
    expect(isOverCapacity(0.1 + 0.2 + 0.7)).toBe(false);
    expect(isOverCapacity(1.0001)).toBe(true);
  });

  it('names the most recently edited allocation as the cause', () => {
    const load = new LoadIndex([
      allocation('a1', 'wbs-012', 'emp-003', '2026-06', 0.59, '2026-09-01T10:00:00.000Z'),
      allocation('a2', 'wbs-061', 'emp-003', '2026-06', 0.59, '2026-09-02T08:30:00.000Z'),
    ]).get(employeeId('emp-003'), month('2026-06'));
    expect(load && causeOf(load)?.id).toBe('a2');
  });

  it('ignores zero allocations', () => {
    const load = new LoadIndex([allocation('a1', 'wbs-012', 'emp-003', '2026-06', 0)]);
    expect(load.get(employeeId('emp-003'), month('2026-06'))).toBeUndefined();
  });
});
