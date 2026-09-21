import { describe, expect, it } from 'vitest';
import { addItem, deleteItem, depthOf, moveItem, renameItem } from '../breakdown';
import type { ItemId, Plan, ProjectId } from '../model';
import { allocation, itemId, seedPlan } from './fixtures';

const project = 'prj-1' as ProjectId;
const newId = 'wbs-new' as ItemId;

describe('adding a work item', () => {
  it('moves a staffed leaf’s allocations onto the new child: nothing is lost (R4)', () => {
    // A second-level leaf with a plan of its own; the fixture's staffed leaves are all on level 3.
    const leaf = 'wbs-leaf' as ItemId;
    const plan: Plan = {
      ...seedPlan,
      items: [...seedPlan.items, { id: leaf, projectId: project, parentId: itemId('wbs-001'), name: 'Data cleansing' }],
      allocations: [
        ...seedPlan.allocations,
        allocation('alloc-a', leaf, 'emp-001', '2026-05', 0.3),
        allocation('alloc-b', leaf, 'emp-002', '2026-05', 0.45),
      ],
    };
    const result = addItem(plan, { id: newId, projectId: project, parentId: leaf, name: 'Schema mapping' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moved.map((entry) => entry.id)).toEqual(['alloc-a', 'alloc-b']);
    expect(result.value.changes.upsertAllocations).toEqual([
      { id: 'alloc-a', breakdownItemId: newId, employeeId: 'emp-001', month: '2026-05', personMonths: 0.3, updatedBy: null },
      { id: 'alloc-b', breakdownItemId: newId, employeeId: 'emp-002', month: '2026-05', personMonths: 0.45, updatedBy: null },
    ]);
    expect(result.value.changes.deleteAllocationIds).toEqual([]);
  });

  it('adds under a parent without touching any allocation', () => {
    const result = addItem(seedPlan, { id: newId, projectId: project, parentId: itemId('wbs-004'), name: 'Interviews' });
    expect(result.ok && result.value.moved).toEqual([]);
  });

  it('refuses a fourth level', () => {
    const result = addItem(seedPlan, { id: newId, projectId: project, parentId: itemId('wbs-012'), name: 'x' });
    expect(depthOf(seedPlan.items, itemId('wbs-012'))).toBe(3);
    expect(result).toEqual({ ok: false, error: { kind: 'too-deep', maxDepth: 3 } });
  });

  it('refuses an empty name', () => {
    expect(addItem(seedPlan, { id: newId, projectId: project, parentId: null, name: '   ' })).toEqual({ ok: false, error: { kind: 'empty-name' } });
  });
});

describe('renaming', () => {
  it('trims and keeps everything else', () => {
    const result = renameItem(seedPlan, itemId('wbs-004'), '  Discovery and scoping ');
    expect(result.ok && result.value.upsertItems[0]).toMatchObject({ id: 'wbs-004', name: 'Discovery and scoping', parentId: 'wbs-001' });
  });
});

describe('moving', () => {
  it('reparents within the project', () => {
    const result = moveItem(seedPlan, itemId('wbs-020'), itemId('wbs-007'));
    expect(result.ok && result.value.upsertItems[0]?.parentId).toBe('wbs-007');
  });

  it('refuses to move a node inside its own subtree', () => {
    expect(moveItem(seedPlan, itemId('wbs-001'), itemId('wbs-004'))).toEqual({ ok: false, error: { kind: 'into-own-subtree' } });
  });

  it('refuses a move that would create a fourth level', () => {
    // Discovery has children; under another second-level node they would land on level 4.
    expect(moveItem(seedPlan, itemId('wbs-004'), itemId('wbs-007'))).toEqual({ ok: false, error: { kind: 'too-deep', maxDepth: 3 } });
  });

  it('refuses, with the count, to move under a leaf that has allocations of its own', () => {
    const plan: Plan = {
      ...seedPlan,
      items: [...seedPlan.items, { id: newId, projectId: project, parentId: itemId('wbs-001'), name: 'Staffed second-level leaf' }],
      allocations: [...seedPlan.allocations, allocation('alloc-x', newId, 'emp-001', '2026-05', 0.3)],
    };
    expect(moveItem(plan, itemId('wbs-020'), newId)).toEqual({
      ok: false,
      error: { kind: 'target-is-staffed', targetName: 'Staffed second-level leaf', allocations: 1 },
    });
  });

  it('can promote a leaf to the root', () => {
    const result = moveItem(seedPlan, itemId('wbs-020'), null);
    expect(result.ok && result.value.upsertItems[0]?.parentId).toBeNull();
  });
});

describe('deleting', () => {
  it('takes the subtree and its allocations, and says how many', () => {
    const result = deleteItem(seedPlan, itemId('wbs-004'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.changes.deleteItemIds).toEqual(['wbs-004', 'wbs-012', 'wbs-020']);
    expect(result.value.removedItems).toBe(3);
    const expected = seedPlan.allocations.filter((entry) => ['wbs-012', 'wbs-020'].includes(entry.breakdownItemId)).length;
    expect(result.value.removedAllocations).toBe(expected);
  });
});
