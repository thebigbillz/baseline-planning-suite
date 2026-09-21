import type { PeopleLookup } from './grid';
import { priceOf } from './grid';
import type { LoadIndex } from './capacity';
import type { Plan, Project } from './model';

export interface ProjectSummary {
  readonly project: Project;
  readonly workItems: number;
  readonly people: number;
  /** Person-months in this project where the person is over capacity across all projects. */
  readonly overCapacity: number;
  readonly personMonths: number;
  /** EUR, exact. */
  readonly cost: number;
}

export function summarise(plan: Plan, project: Project, people: PeopleLookup, load: LoadIndex): ProjectSummary {
  const itemIds = new Set(plan.items.filter((item) => item.projectId === project.id).map((item) => item.id));
  const allocations = plan.allocations.filter((allocation) => itemIds.has(allocation.breakdownItemId) && allocation.personMonths > 0);
  const flagged = new Set(allocations.filter((allocation) => load.isOver(allocation.employeeId, allocation.month)).map((allocation) => `${allocation.employeeId}|${allocation.month}`));
  return {
    project,
    workItems: itemIds.size,
    people: new Set(allocations.map((allocation) => allocation.employeeId)).size,
    overCapacity: flagged.size,
    personMonths: allocations.reduce((sum, allocation) => sum + allocation.personMonths, 0),
    cost: allocations.reduce((sum, allocation) => sum + (priceOf(allocation, people)?.cost ?? 0), 0),
  };
}
