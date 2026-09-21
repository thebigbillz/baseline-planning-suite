import type { Employee, EmployeeId, PeopleDirectory, RateRecord } from '@baseline/contracts';
import type { PeopleLookup } from '../domain/grid';
import { requestJson } from './http';

/**
 * Delivery's only view of People: the published directory. Delivery reads
 * rate records and prices the plan itself; it never edits a person and never
 * loads People's code.
 */
export async function fetchPeople(): Promise<PeopleDirectory> {
  return (await requestJson('/api/people/directory')) as PeopleDirectory;
}

export function lookupFrom(directory: PeopleDirectory): PeopleLookup & { readonly employees: readonly Employee[] } {
  const employees = new Map(directory.employees.map((employee) => [employee.id, employee]));
  const rates = new Map<EmployeeId, RateRecord[]>();
  for (const record of directory.rateRecords) rates.set(record.employeeId, [...(rates.get(record.employeeId) ?? []), record]);
  return {
    employees: directory.employees,
    employee: (id) => employees.get(id),
    ratesOf: (id) => rates.get(id) ?? [],
  };
}

export const NOBODY = lookupFrom({ employees: [], rateRecords: [] });
