import { useEffect, useRef, useState } from 'react';
import { depthOf, moveItem, describeBreakdownError } from '../domain/breakdown';
import type { Allocation, BreakdownItem, ItemId, Plan } from '../domain/model';
import { fixed } from './format';
import { usePopover } from './usePopover';
import styles from './delivery.module.css';

// ---------- the ⋯ menu ----------

interface ItemMenuProps {
  readonly canAddInside: boolean;
  readonly onAddInside: () => void;
  readonly onRename: () => void;
  readonly onMove: () => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}

export function ItemMenu({ canAddInside, onAddInside, onRename, onMove, onDelete, onClose }: ItemMenuProps) {
  const menu = usePopover<HTMLDivElement>(onClose);
  return (
    <div className={`${styles['popover']} ${styles['menu']}`} ref={menu} role="menu">
      <button type="button" role="menuitem" disabled={!canAddInside} title={canAddInside ? undefined : 'The breakdown is limited to three levels'} onClick={onAddInside}>
        Add work item inside
      </button>
      <button type="button" role="menuitem" onClick={onRename}>
        Rename <kbd>F2</kbd>
      </button>
      <button type="button" role="menuitem" onClick={onMove}>
        Move to…
      </button>
      <hr />
      <button type="button" role="menuitem" data-danger="true" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

// ---------- move picker ----------

interface MovePickerProps {
  readonly plan: Plan;
  readonly item: BreakdownItem;
  readonly onMove: (parentId: ItemId | null) => void;
  readonly onClose: () => void;
}

/**
 * A picker, not drag and drop: complete by keyboard and buildable by hand.
 * Every target is listed; the ones the domain refuses are disabled and say why.
 */
export function MovePicker({ plan, item, onMove, onClose }: MovePickerProps) {
  const picker = usePopover<HTMLDivElement>(onClose);
  const items = plan.items.filter((candidate) => candidate.projectId === item.projectId);

  const ordered: BreakdownItem[] = [];
  const walk = (parentId: ItemId | null): void => {
    for (const child of items.filter((candidate) => candidate.parentId === parentId)) {
      ordered.push(child);
      walk(child.id);
    }
  };
  walk(null);

  const targets: { id: ItemId | null; name: string; depth: number; refusal: string | null }[] = [
    { id: null, name: 'Top level of the project', depth: 0, refusal: refusalFor(plan, item.id, null) },
    ...ordered.filter((candidate) => candidate.id !== item.id).map((candidate) => ({ id: candidate.id, name: candidate.name, depth: depthOf(items, candidate.id), refusal: refusalFor(plan, item.id, candidate.id) })),
  ];

  return (
    <div className={`${styles['popover']} ${styles['movePicker']}`} ref={picker} role="dialog" aria-label={`Move ${item.name}`}>
      <p className={styles['popoverTitle']}>Move “{item.name}” under</p>
      <div className={styles['moveList']}>
        {targets.map((target) => (
          <button key={target.id ?? 'root'} type="button" disabled={target.refusal !== null} style={{ paddingLeft: 12 + target.depth * 16 }} onClick={() => onMove(target.id)}>
            <span>{target.name}</span>
            {target.refusal !== null && <small>{target.refusal}</small>}
          </button>
        ))}
      </div>
      <p className={styles['popoverFoot']}>Totals of the old and new parent update. The project total does not change.</p>
    </div>
  );
}

function refusalFor(plan: Plan, id: ItemId, parentId: ItemId | null): string | null {
  const result = moveItem(plan, id, parentId);
  if (result.ok) return null;
  switch (result.error.kind) {
    case 'already-there':
      return 'already here';
    case 'into-own-subtree':
      return 'inside itself';
    case 'too-deep':
      return 'would be level 4';
    case 'target-is-staffed':
      return 'has its own allocations';
    default:
      return describeBreakdownError(result.error);
  }
}

// ---------- add dialog (also R4) ----------

interface AddItemDialogProps {
  readonly parent: BreakdownItem | null;
  /** Allocations on the parent that will move onto the new child. Empty for an ordinary add. */
  readonly moving: readonly Allocation[];
  readonly error: string | null;
  readonly onConfirm: (name: string) => void;
  readonly onClose: () => void;
}

export function AddItemDialog({ parent, moving, error, onConfirm, onClose }: AddItemDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const movingPm = moving.reduce((sum, allocation) => sum + allocation.personMonths, 0);
  const people = new Set(moving.map((allocation) => allocation.employeeId)).size;

  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
  }, []);

  return (
    <dialog ref={dialog} className={styles['dialog']} onClose={onClose} aria-labelledby="add-item-title">
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(name);
        }}
      >
        <p className={styles['eyebrow']}>{parent === null ? 'Add work item' : 'Add work item inside'}</p>
        {moving.length > 0 && parent !== null ? (
          <>
            <h2 id="add-item-title">“{parent.name}” is staffed. Its plan moves to the new item.</h2>
            <p>
              A parent’s effort is always derived from its children, so “{parent.name}” can’t keep allocations of its own once it has a child. Nothing is dropped: they move as
              they are.
            </p>
          </>
        ) : (
          <h2 id="add-item-title">{parent === null ? 'New top-level work item' : `New work item inside “${parent.name}”`}</h2>
        )}
        <label>
          Name of the new item
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} aria-invalid={error !== null} />
        </label>
        {error !== null && <p className={styles['formError']}>{error}</p>}
        {moving.length > 0 && parent !== null && (
          <div className={styles['moveSummary']}>
            <div>
              <strong>{parent.name}</strong>
              <small>becomes derived</small>
            </div>
            <span aria-hidden="true">→</span>
            <div>
              <strong>{name.trim() === '' ? 'New item' : name.trim()}</strong>
              <small>receives the allocations</small>
            </div>
            <div className={styles['moveFigure']}>
              <code>{fixed(movingPm, 2)} PM</code>
              <small>
                {moving.length} cells · {people} {people === 1 ? 'person' : 'people'}
              </small>
            </div>
          </div>
        )}
        <footer>
          {moving.length > 0 && <small>Totals for “{parent?.name}” and everything above it stay the same.</small>}
          <button type="button" className={styles['secondary']} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles['primary']}>
            {moving.length > 0 ? 'Add and move plan' : 'Add work item'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
