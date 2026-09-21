import type { EmployeeId, IsoDate, MonthKey } from '@baseline/contracts';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ProjectId = Brand<string, 'ProjectId'>;
export type ItemId = Brand<string, 'ItemId'>;
export type AllocationId = Brand<string, 'AllocationId'>;

export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
}

/** A node of the work breakdown. `parentId` is null at the root; three levels at most. */
export interface BreakdownItem {
  readonly id: ItemId;
  readonly projectId: ProjectId;
  readonly parentId: ItemId | null;
  readonly name: string;
}

/**
 * Effort planned for one person on one leaf in one month, in person-months:
 * the single canonical unit. Hours, % and cost are never stored.
 */
export interface Allocation {
  readonly id: AllocationId;
  readonly breakdownItemId: ItemId;
  readonly employeeId: EmployeeId;
  readonly month: MonthKey;
  readonly personMonths: number;
  /** Set by Delivery's service on every write; decides which edit "caused" an overload. */
  readonly updatedAt: string;
  /** The shell's active user at the time of the edit; null for fixture data. */
  readonly updatedBy: string | null;
}

export interface Plan {
  readonly projects: readonly Project[];
  readonly items: readonly BreakdownItem[];
  readonly allocations: readonly Allocation[];
}

export const MAX_DEPTH = 3;

/** What a plan edit asks Delivery's service to apply, atomically. */
export interface ChangeSet {
  readonly upsertItems: readonly BreakdownItem[];
  readonly deleteItemIds: readonly ItemId[];
  readonly upsertAllocations: readonly AllocationWrite[];
  readonly deleteAllocationIds: readonly AllocationId[];
}

/** `updatedAt` is the service's to set, so a write never carries one. */
export type AllocationWrite = Omit<Allocation, 'updatedAt'>;

export const NO_CHANGES: ChangeSet = {
  upsertItems: [],
  deleteItemIds: [],
  upsertAllocations: [],
  deleteAllocationIds: [],
};
