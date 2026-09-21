import type { Employee, EmployeeId, IsoDate, MonthKey, RateRecord, RateRecordId, WeeklyHours } from '@baseline/contracts';
import seed from '../../../../../seed/baseline-seed.json';
import type { PeopleLookup } from '../grid';
import type { Allocation, AllocationId, BreakdownItem, ItemId, Plan, Project, ProjectId } from '../model';

export const month = (value: string): MonthKey => value as MonthKey;
export const day = (value: string): IsoDate => value as IsoDate;
export const employeeId = (value: string): EmployeeId => value as EmployeeId;
export const itemId = (value: string): ItemId => value as ItemId;

export function rate(id: string, employee: string, validFrom: string, hourlyCost: number): RateRecord {
  return { id: id as RateRecordId, employeeId: employeeId(employee), validFrom: day(validFrom), hourlyCost };
}

export function allocation(id: string, item: string, employee: string, monthKey: string, personMonths: number, updatedAt = '2026-01-01T00:00:00.000Z'): Allocation {
  return { id: id as AllocationId, breakdownItemId: itemId(item), employeeId: employeeId(employee), month: month(monthKey), personMonths, updatedAt };
}

/** The shipped fixture, mapped into Delivery's model and People's contract. */
export const seedEmployees: Employee[] = seed.employees.map((employee) => ({
  id: employeeId(employee.id),
  name: employee.name,
  role: employee.role,
  weeklyHours: employee.weeklyHours as WeeklyHours,
}));

export const seedRates: RateRecord[] = seed.rateRecords.map((record) => rate(record.id, record.employeeId, record.validFrom, record.hourlyCost));

export const seedPlan: Plan = {
  projects: seed.projects.map((project): Project => ({
    id: project.id as ProjectId,
    name: project.name,
    startDate: day(project.startDate),
    endDate: day(project.endDate),
  })),
  items: seed.breakdownItems.map((item): BreakdownItem => ({
    id: itemId(item.id),
    projectId: item.projectId as ProjectId,
    parentId: item.parentId === null ? null : itemId(item.parentId),
    name: item.name,
  })),
  allocations: seed.allocations.map((entry) => allocation(entry.id, entry.breakdownItemId, entry.employeeId, entry.month, entry.amount)),
};

export const seedPeople: PeopleLookup = {
  employee: (id) => seedEmployees.find((employee) => employee.id === id),
  ratesOf: (id) => seedRates.filter((record) => record.employeeId === id),
};
