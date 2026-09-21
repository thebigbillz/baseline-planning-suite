import { describe, expect, it } from 'vitest';
import { monthsBetween } from '../calendar';
import { LoadIndex } from '../capacity';
import { buildGrid, displayedAtoms, priceOf, type Grid, type GridRow } from '../grid';
import type { ItemId, Project } from '../model';
import { UNITS } from '../units';
import { itemId, month, seedPeople, seedPlan } from './fixtures';

const project = seedPlan.projects[0] as Project;
const months = monthsBetween(month('2026-03'), month('2027-02'));
const everyItem = new Set<ItemId>(seedPlan.items.map((item) => item.id));
const load = new LoadIndex(seedPlan.allocations);

const grid = (unit: Grid['unit'], expanded: ReadonlySet<ItemId> = everyItem, perEuro = 1): Grid =>
  buildGrid({ plan: seedPlan, project, months, unit, people: seedPeople, load, expanded, perEuro });

const itemRow = (rows: readonly GridRow[], id: string): Extract<GridRow, { kind: 'item' }> => {
  const row = rows.find((candidate) => candidate.kind === 'item' && candidate.item.id === id);
  if (row?.kind !== 'item') throw new Error(`no row for ${id}`);
  return row;
};

describe('totals reconcile (R3)', () => {
  it.each(UNITS)('in %s, every displayed parent equals the sum of its displayed children, month by month', (unit) => {
    const { rows } = grid(unit);
    for (const row of rows) {
      if (row.kind !== 'item') continue;
      const children = rows.filter((candidate) =>
        candidate.kind === 'item' ? candidate.item.parentId === row.item.id : candidate.itemId === row.item.id,
      );
      if (children.length === 0) continue;
      row.cells.forEach((cell, index) => {
        const below = children.reduce((sum, child) => sum + (child.cells[index]?.displayed ?? 0), 0);
        expect(cell.displayed ?? 0).toBe(below);
      });
    }
  });

  it.each(UNITS)('in %s, row totals and month totals both add up to the same grand total', (unit) => {
    const { rows, totals, grandTotal } = grid(unit);
    const roots = rows.filter((row) => row.kind === 'item' && row.item.parentId === null);
    expect(roots.reduce((sum, row) => sum + (row.total ?? 0), 0)).toBe(grandTotal);
    expect(totals.reduce<number>((sum, value) => sum + (value ?? 0), 0)).toBe(grandTotal);
  });

  it('the displayed grand total is the exact total, rounded once', () => {
    const allocations = seedPlan.allocations.filter((entry) => seedPlan.items.find((item) => item.id === entry.breakdownItemId)?.projectId === project.id);
    const exact = allocations.reduce((sum, entry) => sum + (priceOf(entry, seedPeople)?.cost ?? 0), 0);
    const atoms = displayedAtoms(allocations, 'cost', seedPeople, 1);
    const displayed = [...atoms.values()].reduce((sum, value) => sum + value, 0);
    expect(displayed).toBe(Math.round(exact * 100));
    expect(grid('cost').grandTotal).toBe(displayed);
  });

  it('collapsing a branch never changes a figure', () => {
    const open = grid('cost');
    const closed = grid('cost', new Set());
    expect(closed.rows.map((row) => row.key)).toEqual(['wbs-001', 'wbs-002', 'wbs-003']);
    expect(itemRow(closed.rows, 'wbs-001').cells).toEqual(itemRow(open.rows, 'wbs-001').cells);
    expect(closed.grandTotal).toBe(open.grandTotal);
  });
});

describe('grid rows', () => {
  it('shows the reference cell as €7,880.00 and marks March as a split-rate month', () => {
    const row = grid('cost').rows.find((candidate) => candidate.kind === 'person' && candidate.itemId === itemId('wbs-012') && candidate.employeeId === 'emp-001');
    const march = row?.kind === 'person' ? row.cells[0] : undefined;
    expect(march?.displayed).toBe(788000);
    expect(march?.splitRate).toBe(true);
    expect(march?.unpriced).toBe(false);
  });

  it('flags the over-capacity cell and bubbles it up to collapsed parents', () => {
    const { rows } = grid('personMonths');
    const milan = rows.find((row) => row.kind === 'person' && row.itemId === itemId('wbs-012') && row.employeeId === 'emp-003');
    const june = months.indexOf(month('2026-06'));
    expect(milan?.kind === 'person' && milan.cells[june]?.overCapacity).toBe(true);
    expect(itemRow(rows, 'wbs-012').cells[june]?.overCapacityBelow).toBe(true);
    expect(itemRow(grid('personMonths', new Set()).rows, 'wbs-001').cells[june]?.overCapacityBelow).toBe(true);
  });

  it('marks months outside the project’s dates', () => {
    const wide = buildGrid({ plan: seedPlan, project, months: [month('2026-02'), month('2026-03'), month('2027-03')], unit: 'hours', people: seedPeople, load, expanded: everyItem, perEuro: 1 });
    expect(itemRow(wide.rows, 'wbs-001').cells.map((cell) => cell.outsideProject)).toEqual([true, false, true]);
  });

  it('converts cost into the shell’s display currency before rounding', () => {
    const eur = grid('cost').grandTotal ?? 0;
    const usd = grid('cost', everyItem, 1.1).grandTotal ?? 0;
    expect(usd).toBe(Math.round(eur * 1.1));
  });
});
