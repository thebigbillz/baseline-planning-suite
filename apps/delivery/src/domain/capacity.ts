import type { EmployeeId, MonthKey } from '@baseline/contracts';
import type { Allocation } from './model';

/**
 * Capacity for a month is one person-month: 100% of that person's time.
 * Because allocations are stored in person-months, load across projects is a
 * plain sum. No hours, no rates, no data from People are needed.
 */
export const FULL_CAPACITY = 1;

/** Floating-point allowance: 0.59 + 0.41 must not read as over capacity. */
const EPSILON = 1e-9;

export interface PersonMonthLoad {
  readonly employeeId: EmployeeId;
  readonly month: MonthKey;
  readonly personMonths: number;
  /** Every allocation that counts, from every project, open or not. */
  readonly contributions: readonly Allocation[];
}

const keyOf = (employeeId: EmployeeId, month: MonthKey): string => `${employeeId}|${month}`;

export function isOverCapacity(personMonths: number): boolean {
  return personMonths > FULL_CAPACITY + EPSILON;
}

export class LoadIndex {
  private readonly loads = new Map<string, PersonMonthLoad>();

  /** `allocations` must span every project, not just the one on screen. */
  constructor(allocations: readonly Allocation[]) {
    for (const allocation of allocations) {
      if (allocation.personMonths === 0) continue;
      const key = keyOf(allocation.employeeId, allocation.month);
      const existing = this.loads.get(key);
      this.loads.set(key, {
        employeeId: allocation.employeeId,
        month: allocation.month,
        personMonths: (existing?.personMonths ?? 0) + allocation.personMonths,
        contributions: [...(existing?.contributions ?? []), allocation],
      });
    }
  }

  get(employeeId: EmployeeId, month: MonthKey): PersonMonthLoad | undefined {
    return this.loads.get(keyOf(employeeId, month));
  }

  isOver(employeeId: EmployeeId, month: MonthKey): boolean {
    return isOverCapacity(this.get(employeeId, month)?.personMonths ?? 0);
  }

  overloaded(): PersonMonthLoad[] {
    return [...this.loads.values()].filter((load) => isOverCapacity(load.personMonths));
  }
}

/**
 * The assignment that "caused" an overload is the most recently edited
 * allocation contributing to that person-month. Ties fall to the higher id so
 * the answer is stable.
 */
export function causeOf(load: PersonMonthLoad): Allocation | undefined {
  return [...load.contributions].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id),
  )[0];
}
