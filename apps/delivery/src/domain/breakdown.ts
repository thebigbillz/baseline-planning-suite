import {
  MAX_DEPTH,
  NO_CHANGES,
  type Allocation,
  type BreakdownItem,
  type ChangeSet,
  type ItemId,
  type Plan,
  type ProjectId,
} from './model';

export type BreakdownError =
  | { readonly kind: 'empty-name' }
  | { readonly kind: 'unknown-item'; readonly id: ItemId }
  | { readonly kind: 'too-deep'; readonly maxDepth: number }
  | { readonly kind: 'into-own-subtree' }
  | { readonly kind: 'already-there' }
  | { readonly kind: 'target-is-staffed'; readonly targetName: string; readonly allocations: number };

export type BreakdownResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: BreakdownError };

const ok = <T>(value: T): BreakdownResult<T> => ({ ok: true, value });
const fail = (error: BreakdownError): BreakdownResult<never> => ({ ok: false, error });

// ---------- reading the tree ----------

export function childrenOf(items: readonly BreakdownItem[], parentId: ItemId | null, projectId: ProjectId): BreakdownItem[] {
  return items.filter((item) => item.projectId === projectId && item.parentId === parentId);
}

export function isLeaf(items: readonly BreakdownItem[], id: ItemId): boolean {
  return !items.some((item) => item.parentId === id);
}

/** Root items are at depth 1. */
export function depthOf(items: readonly BreakdownItem[], id: ItemId): number {
  const byId = new Map(items.map((item) => [item.id, item]));
  let depth = 0;
  for (let current = byId.get(id); current !== undefined; current = current.parentId === null ? undefined : byId.get(current.parentId)) {
    depth += 1;
  }
  return depth;
}

export function subtreeIds(items: readonly BreakdownItem[], rootId: ItemId): ItemId[] {
  const ids: ItemId[] = [rootId];
  for (let index = 0; index < ids.length; index += 1) {
    const parent = ids[index];
    for (const item of items) if (item.parentId === parent) ids.push(item.id);
  }
  return ids;
}

/** Levels in the subtree, counting its root: a leaf has height 1. */
function subtreeHeight(items: readonly BreakdownItem[], rootId: ItemId): number {
  const children = items.filter((item) => item.parentId === rootId);
  return 1 + Math.max(0, ...children.map((child) => subtreeHeight(items, child.id)));
}

export function leafIdsUnder(items: readonly BreakdownItem[], rootId: ItemId): ItemId[] {
  return subtreeIds(items, rootId).filter((id) => isLeaf(items, id));
}

function allocationsOn(allocations: readonly Allocation[], itemId: ItemId): Allocation[] {
  return allocations.filter((allocation) => allocation.breakdownItemId === itemId);
}

// ---------- editing the tree ----------

export interface AddItemPlan {
  readonly changes: ChangeSet;
  /**
   * Parents are derived, so a leaf that gains a child cannot keep allocations
   * of its own. They move onto the new child, unchanged; nothing is dropped.
   * The UI confirms this before applying when `moved` is not empty.
   */
  readonly moved: readonly Allocation[];
}

export function addItem(
  plan: Plan,
  input: { readonly id: ItemId; readonly projectId: ProjectId; readonly parentId: ItemId | null; readonly name: string },
): BreakdownResult<AddItemPlan> {
  const name = input.name.trim();
  if (name === '') return fail({ kind: 'empty-name' });

  if (input.parentId !== null) {
    if (!plan.items.some((item) => item.id === input.parentId)) return fail({ kind: 'unknown-item', id: input.parentId });
    if (depthOf(plan.items, input.parentId) >= MAX_DEPTH) return fail({ kind: 'too-deep', maxDepth: MAX_DEPTH });
  }

  const moved = input.parentId === null ? [] : allocationsOn(plan.allocations, input.parentId);
  return ok({
    moved,
    changes: {
      ...NO_CHANGES,
      upsertItems: [{ id: input.id, projectId: input.projectId, parentId: input.parentId, name }],
      upsertAllocations: moved.map(({ updatedAt: _stamp, ...allocation }) => ({ ...allocation, breakdownItemId: input.id })),
    },
  });
}

export function renameItem(plan: Plan, id: ItemId, newName: string): BreakdownResult<ChangeSet> {
  const name = newName.trim();
  if (name === '') return fail({ kind: 'empty-name' });
  const item = plan.items.find((candidate) => candidate.id === id);
  if (item === undefined) return fail({ kind: 'unknown-item', id });
  return ok({ ...NO_CHANGES, upsertItems: [{ ...item, name }] });
}

/**
 * Moving under a leaf that already has allocations is refused with a message
 * rather than merging two people's plans silently. (Adding a fresh child moves
 * the allocations instead; both resolutions are allowed by R4.)
 */
export function moveItem(plan: Plan, id: ItemId, newParentId: ItemId | null): BreakdownResult<ChangeSet> {
  const item = plan.items.find((candidate) => candidate.id === id);
  if (item === undefined) return fail({ kind: 'unknown-item', id });
  if (item.parentId === newParentId) return fail({ kind: 'already-there' });

  if (newParentId !== null) {
    const target = plan.items.find((candidate) => candidate.id === newParentId && candidate.projectId === item.projectId);
    if (target === undefined) return fail({ kind: 'unknown-item', id: newParentId });
    if (subtreeIds(plan.items, id).includes(newParentId)) return fail({ kind: 'into-own-subtree' });
    if (depthOf(plan.items, newParentId) + subtreeHeight(plan.items, id) > MAX_DEPTH) {
      return fail({ kind: 'too-deep', maxDepth: MAX_DEPTH });
    }
    const staffed = allocationsOn(plan.allocations, newParentId).length;
    if (staffed > 0) return fail({ kind: 'target-is-staffed', targetName: target.name, allocations: staffed });
  } else if (subtreeHeight(plan.items, id) > MAX_DEPTH) {
    return fail({ kind: 'too-deep', maxDepth: MAX_DEPTH });
  }

  return ok({ ...NO_CHANGES, upsertItems: [{ ...item, parentId: newParentId }] });
}

export interface DeleteItemPlan {
  readonly changes: ChangeSet;
  readonly removedItems: number;
  readonly removedAllocations: number;
}

/** Deleting takes the whole subtree and its allocations; the UI states both counts first. */
export function deleteItem(plan: Plan, id: ItemId): BreakdownResult<DeleteItemPlan> {
  if (!plan.items.some((item) => item.id === id)) return fail({ kind: 'unknown-item', id });
  const itemIds = subtreeIds(plan.items, id);
  const doomed = plan.allocations.filter((allocation) => itemIds.includes(allocation.breakdownItemId));
  return ok({
    removedItems: itemIds.length,
    removedAllocations: doomed.length,
    changes: { ...NO_CHANGES, deleteItemIds: itemIds, deleteAllocationIds: doomed.map((allocation) => allocation.id) },
  });
}

export function describeBreakdownError(error: BreakdownError): string {
  switch (error.kind) {
    case 'empty-name':
      return 'A work item needs a name.';
    case 'unknown-item':
      return 'That work item no longer exists.';
    case 'too-deep':
      return `The breakdown is limited to ${error.maxDepth} levels.`;
    case 'into-own-subtree':
      return 'A work item cannot be moved inside itself.';
    case 'already-there':
      return 'It is already there.';
    case 'target-is-staffed':
      return `“${error.targetName}” has ${error.allocations} allocations of its own. Move or clear them first, so nothing is lost.`;
  }
}
