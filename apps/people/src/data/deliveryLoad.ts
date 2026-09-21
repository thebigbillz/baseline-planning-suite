import type { EmployeeId, LoadEntry, MonthKey } from '@baseline/contracts';
import { requestJson } from './http';

/**
 * People's only view of Delivery: load per person per month, summed over
 * every project. People never sees an allocation, a project or a work item.
 */
export type LoadByPerson = ReadonlyMap<EmployeeId, ReadonlyMap<MonthKey, number>>;

export async function fetchLoad(): Promise<LoadByPerson> {
  const entries = (await requestJson('/api/delivery/load')) as readonly LoadEntry[];
  const byPerson = new Map<EmployeeId, Map<MonthKey, number>>();
  for (const entry of entries) {
    const months = byPerson.get(entry.employeeId) ?? new Map<MonthKey, number>();
    months.set(entry.month, entry.personMonths);
    byPerson.set(entry.employeeId, months);
  }
  return byPerson;
}

/** Capacity is one person-month. The allowance is for floating point, not for rounding. */
export const isOversubscribed = (personMonths: number): boolean => personMonths > 1 + 1e-9;
