import type { Employee, EmployeeId, MonthKey, RateRecord } from '@baseline/contracts';
import { monthOf } from './calendar';
import { childrenOf, isLeaf } from './breakdown';
import type { LoadIndex } from './capacity';
import type { Allocation, AllocationId, BreakdownItem, ItemId, Plan, Project } from './model';
import { priceAllocation, type PricedAllocation } from './pricing';
import { apportion } from './rounding';
import { DECIMALS, fromPersonMonths, type Unit } from './units';

/** What Delivery needs from People's published API to label and price rows. */
export interface PeopleLookup {
  employee(id: EmployeeId): Employee | undefined;
  ratesOf(id: EmployeeId): readonly RateRecord[];
}

interface CellBase {
  readonly month: MonthKey;
  /** Integer in display units (cents for 2 dp); null when nothing is planned. */
  readonly displayed: number | null;
  /** The month lies outside the project's start and end dates. */
  readonly outsideProject: boolean;
}

/** A leaf cell: one person, one work item, one month. The only kind that is editable. */
export interface PersonCell extends CellBase {
  readonly kind: 'person';
  readonly allocation: Allocation | null;
  readonly overCapacity: boolean;
  /** The month is priced at more than one rate. */
  readonly splitRate: boolean;
  /** Effort is planned on days before the person's first rate: those days cost zero. */
  readonly unpriced: boolean;
}

/** A derived cell: read-only, the sum of what is displayed beneath it. */
export interface DerivedCell extends CellBase {
  readonly kind: 'derived';
  /** Someone beneath this node is over capacity in this month. */
  readonly overCapacityBelow: boolean;
}

export type GridRow =
  | {
      readonly kind: 'item';
      readonly key: string;
      readonly item: BreakdownItem;
      readonly depth: number;
      readonly leaf: boolean;
      readonly expanded: boolean;
      readonly people: number;
      readonly cells: readonly DerivedCell[];
      readonly total: number | null;
    }
  | {
      readonly kind: 'person';
      readonly key: string;
      readonly itemId: ItemId;
      readonly employeeId: EmployeeId;
      /** Undefined while People's directory is unavailable. */
      readonly employee: Employee | undefined;
      readonly depth: number;
      readonly cells: readonly PersonCell[];
      readonly total: number | null;
    };

export interface Grid {
  readonly unit: Unit;
  readonly months: readonly MonthKey[];
  readonly rows: readonly GridRow[];
  readonly totals: readonly (number | null)[];
  readonly grandTotal: number | null;
  readonly overCapacityCells: number;
}

export interface GridInput {
  readonly plan: Plan;
  readonly project: Project;
  /** The months on screen. Rounding is done over the whole project so paging never changes a figure. */
  readonly months: readonly MonthKey[];
  readonly unit: Unit;
  readonly people: PeopleLookup;
  readonly load: LoadIndex;
  readonly expanded: ReadonlySet<ItemId>;
  /** People added to a leaf in this session who have no allocation there yet. */
  readonly pendingAssignments?: ReadonlyMap<ItemId, readonly EmployeeId[]>;
  /** Display-currency units per euro, owned by the shell. */
  readonly perEuro: number;
}

export function priceOf(allocation: Allocation, people: PeopleLookup): PricedAllocation | null {
  const employee = people.employee(allocation.employeeId);
  if (employee === undefined) return null;
  return priceAllocation({
    personMonths: allocation.personMonths,
    weeklyHours: employee.weeklyHours,
    month: allocation.month,
    rates: people.ratesOf(allocation.employeeId),
  });
}

function exactValue(allocation: Allocation, unit: Unit, people: PeopleLookup, perEuro: number): number {
  const employee = people.employee(allocation.employeeId);
  if (unit === 'personMonths' || unit === 'percent') {
    return fromPersonMonths(unit, allocation.personMonths, { weeklyHours: 40, month: allocation.month, blendedRate: null });
  }
  if (employee === undefined) return 0;
  const priced = priceOf(allocation, people);
  return unit === 'hours' ? (priced?.hours ?? 0) : (priced?.cost ?? 0) * perEuro;
}

/**
 * Every leaf cell of the project is an atom. Atoms are apportioned once
 * against the rounded project total (largest remainder); every other figure on
 * screen — row totals, month totals, parents — is a sum of displayed atoms.
 * So whatever you add up on screen, in either direction, reconciles exactly.
 */
export function displayedAtoms(
  allocations: readonly Allocation[],
  unit: Unit,
  people: PeopleLookup,
  perEuro: number,
): Map<AllocationId, number> {
  const exact = allocations.map((allocation) => exactValue(allocation, unit, people, perEuro));
  const displayed = apportion(exact, DECIMALS[unit]);
  return new Map(allocations.map((allocation, index) => [allocation.id, displayed[index] ?? 0]));
}

const sum = (values: readonly (number | null)[]): number | null => {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((total, value) => total + value, 0);
};

export function buildGrid(input: GridInput): Grid {
  const { plan, project, months, unit, people, load } = input;
  const items = plan.items.filter((item) => item.projectId === project.id);
  const itemIds = new Set(items.map((item) => item.id));
  const allocations = plan.allocations.filter((allocation) => itemIds.has(allocation.breakdownItemId));
  const atoms = displayedAtoms(allocations, unit, people, input.perEuro);

  const firstMonth = monthOf(project.startDate);
  const lastMonth = monthOf(project.endDate);
  const outside = (month: MonthKey): boolean => month < firstMonth || month > lastMonth;

  const byLeaf = new Map<ItemId, Allocation[]>();
  for (const allocation of allocations) {
    byLeaf.set(allocation.breakdownItemId, [...(byLeaf.get(allocation.breakdownItemId) ?? []), allocation]);
  }

  let overCapacityCells = 0;

  /** A node's own cells, plus the rows it contributes when visible: itself, then whatever is open beneath it. */
  interface Visited {
    readonly cells: DerivedCell[];
    readonly rows: GridRow[];
  }

  const derive = (below: readonly (readonly CellBase[])[], flagged: (index: number) => boolean): DerivedCell[] =>
    months.map((month, index) => ({
      kind: 'derived',
      month,
      displayed: sum(below.map((cells) => cells[index]?.displayed ?? null)),
      outsideProject: outside(month),
      overCapacityBelow: flagged(index),
    }));

  const visit = (item: BreakdownItem, depth: number): Visited => {
    const leaf = isLeaf(items, item.id);
    const expanded = input.expanded.has(item.id);
    let cells: DerivedCell[];
    let beneath: GridRow[];
    let peopleCount = 0;

    if (leaf) {
      const own = byLeaf.get(item.id) ?? [];
      const pending = input.pendingAssignments?.get(item.id) ?? [];
      const employeeIds = [...new Set([...own.map((allocation) => allocation.employeeId), ...pending])];
      const personRows = employeeIds.map((employeeId) => personRow(item.id, employeeId, depth + 1, own));
      peopleCount = personRows.length;
      cells = derive(personRows.map((row) => row.cells), (index) => personRows.some((row) => row.cells[index]?.overCapacity === true));
      beneath = personRows;
    } else {
      const children = childrenOf(items, item.id, project.id).map((child) => visit(child, depth + 1));
      cells = derive(children.map((child) => child.cells), (index) => children.some((child) => child.cells[index]?.overCapacityBelow === true));
      beneath = children.flatMap((child) => child.rows);
    }

    const self: GridRow = {
      kind: 'item',
      key: item.id,
      item,
      depth,
      leaf,
      expanded,
      people: peopleCount,
      cells,
      total: sum(cells.map((cell) => cell.displayed)),
    };
    return { cells, rows: expanded ? [self, ...beneath] : [self] };
  };

  const personRow = (itemId: ItemId, employeeId: EmployeeId, depth: number, own: readonly Allocation[]): Extract<GridRow, { kind: 'person' }> => {
    const rates = people.ratesOf(employeeId);
    const employee = people.employee(employeeId);
    const cells = months.map((month): PersonCell => {
      const allocation = own.find((candidate) => candidate.employeeId === employeeId && candidate.month === month) ?? null;
      const planned = allocation !== null && allocation.personMonths > 0;
      const priced = planned && employee !== undefined ? priceOf(allocation, people) : null;
      const overCapacity = planned && load.isOver(employeeId, month);
      if (overCapacity) overCapacityCells += 1;
      return {
        kind: 'person',
        month,
        allocation,
        displayed: planned ? (atoms.get(allocation.id) ?? 0) : null,
        outsideProject: outside(month),
        overCapacity,
        splitRate: planned && (priced?.slices.filter((slice) => slice.hourlyCost !== null).length ?? 0) > 1,
        unpriced: planned && (priced?.partlyUnpriced ?? rates.length === 0),
      };
    });
    return { kind: 'person', key: `${itemId}|${employeeId}`, itemId, employeeId, employee, depth, cells, total: sum(cells.map((cell) => cell.displayed)) };
  };

  const roots = childrenOf(items, null, project.id).map((root) => visit(root, 1));
  const totals = months.map((_, index) => sum(roots.map((root) => root.cells[index]?.displayed ?? null)));
  return { unit, months, rows: roots.flatMap((root) => root.rows), totals, grandTotal: sum(totals), overCapacityCells };
}
