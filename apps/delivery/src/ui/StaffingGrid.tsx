import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { EmployeeId, MonthKey } from '@baseline/contracts';
import type { Grid, GridRow, PersonCell } from '../domain/grid';
import type { ItemId } from '../domain/model';
import { displayed, monthLabel } from './format';
import styles from './delivery.module.css';

export interface CellRef {
  readonly itemId: ItemId;
  readonly employeeId: EmployeeId;
  readonly month: MonthKey;
}

export const sameCell = (a: CellRef | null, b: CellRef | null): boolean =>
  a !== null && b !== null && a.itemId === b.itemId && a.employeeId === b.employeeId && a.month === b.month;

export interface Editing {
  readonly cell: CellRef;
  readonly text: string;
  /** What the cell showed when editing began: committing it unchanged writes nothing. */
  readonly initial: string;
  readonly error: string | null;
}

interface StaffingGridProps {
  readonly grid: Grid;
  readonly currentMonth: MonthKey;
  readonly selected: CellRef | null;
  readonly editing: Editing | null;
  readonly onSelect: (cell: CellRef) => void;
  readonly onEditStart: (cell: CellRef, firstKey: string | null) => void;
  readonly onEditChange: (text: string) => void;
  readonly onEditCommit: (then: 'stay' | 'right' | 'down') => void;
  readonly onEditCancel: () => void;
  readonly onClear: (cell: CellRef) => void;
  /** Name, meta and actions for a work-item row: the tree half of the surface. */
  readonly renderItem: (row: Extract<GridRow, { kind: 'item' }>) => ReactNode;
}

type PersonRow = Extract<GridRow, { kind: 'person' }>;

const cellClass = (cell: PersonCell, isSelected: boolean, isEditing: boolean): string =>
  [
    styles['cell'],
    cell.displayed === null ? styles['empty'] : '',
    cell.outsideProject ? styles['outside'] : '',
    cell.overCapacity ? styles['over'] : '',
    cell.splitRate ? styles['split'] : '',
    isSelected ? styles['selected'] : '',
    isEditing ? styles['editing'] : '',
  ].join(' ');

/**
 * The work breakdown and the staffing grid as one hand-built surface: no
 * table, grid or tree package. Work-item rows are derived and read-only;
 * person rows under a leaf are the only editable cells.
 */
export function StaffingGrid(props: StaffingGridProps) {
  const { grid, selected, editing } = props;
  const selectedElement = useRef<HTMLDivElement>(null);
  const personRows = grid.rows.filter((row): row is PersonRow => row.kind === 'person');

  useEffect(() => {
    if (editing === null) selectedElement.current?.focus({ preventScroll: false });
  }, [selected, editing]);

  const move = (rowDelta: number, monthDelta: number): void => {
    if (selected === null) return;
    const rowIndex = personRows.findIndex((row) => row.itemId === selected.itemId && row.employeeId === selected.employeeId);
    const target = personRows[Math.min(personRows.length - 1, Math.max(0, rowIndex + rowDelta))];
    if (target === undefined) return;
    // Months outside the project's dates are skipped, not landed on.
    let monthIndex = grid.months.indexOf(selected.month);
    do monthIndex += monthDelta;
    while (monthDelta !== 0 && target.cells[monthIndex]?.outsideProject === true);
    const month = target.cells[monthIndex]?.month;
    if (month !== undefined) props.onSelect({ itemId: target.itemId, employeeId: target.employeeId, month });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (selected === null || editing !== null || event.metaKey || event.ctrlKey || event.altKey) return;
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const arrow = arrows[event.key];
    if (arrow !== undefined) {
      event.preventDefault();
      move(arrow[0], arrow[1]);
    } else if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      props.onEditStart(selected, null);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      props.onClear(selected);
    } else if (/^[\d.]$/.test(event.key)) {
      event.preventDefault();
      props.onEditStart(selected, event.key);
    }
  };

  return (
    <div className={styles['grid']} role="grid" aria-label="Staffing by work item, person and month" onKeyDown={onKeyDown}>
      <div className={`${styles['row']} ${styles['head']}`} role="row">
        <div className={styles['nameHead']} role="columnheader">
          Work item / person
        </div>
        {grid.months.map((month) => (
          <div key={month} className={`${styles['monthHead']} ${month === props.currentMonth ? styles['now'] : ''}`} role="columnheader">
            {monthLabel(month)}
          </div>
        ))}
        <div className={`${styles['monthHead']} ${styles['totalHead']}`} role="columnheader">
          Period total
        </div>
      </div>

      {grid.rows.map((row) =>
        row.kind === 'item' ? (
          <div key={row.key} className={`${styles['row']} ${row.leaf ? styles['leafRow'] : styles['derivedRow']}`} role="row">
            <div className={styles['name']} style={{ paddingLeft: 12 + (row.depth - 1) * 20 }} role="rowheader">
              {props.renderItem(row)}
            </div>
            {row.cells.map((cell) => (
              <div key={cell.month} role="gridcell" aria-readonly="true" className={`${styles['cell']} ${styles['derived']} ${cell.displayed === null ? styles['empty'] : ''} ${cell.outsideProject ? styles['outside'] : ''}`}>
                {cell.overCapacityBelow && <span className={styles['below']} title="Someone beneath this work item is over capacity this month" />}
                {cell.outsideProject ? '' : displayed(cell.displayed, grid.unit)}
              </div>
            ))}
            <div role="gridcell" aria-readonly="true" className={`${styles['cell']} ${styles['derived']} ${styles['total']}`}>
              {displayed(row.total, grid.unit)}
            </div>
          </div>
        ) : (
          <div key={row.key} className={`${styles['row']} ${styles['personRow']}`} role="row">
            <div className={styles['name']} style={{ paddingLeft: 12 + (row.depth - 1) * 20 + 30 }} role="rowheader">
              <span>{row.employee?.name ?? row.employeeId}</span>
              <span className={styles['meta']}>{row.employee === undefined ? 'not in the register' : `${row.employee.weeklyHours} h`}</span>
            </div>
            {row.cells.map((cell) => {
              const ref: CellRef = { itemId: row.itemId, employeeId: row.employeeId, month: cell.month };
              const isSelected = sameCell(selected, ref);
              const isEditing = editing !== null && sameCell(editing.cell, ref);
              if (cell.outsideProject) {
                return <div key={cell.month} role="gridcell" aria-disabled="true" title="Outside the project’s dates" className={cellClass(cell, false, false)} />;
              }
              return (
                <div
                  key={cell.month}
                  ref={isSelected ? selectedElement : undefined}
                  role="gridcell"
                  tabIndex={isSelected ? 0 : -1}
                  aria-selected={isSelected}
                  aria-invalid={isEditing && editing.error !== null}
                  className={cellClass(cell, isSelected, isEditing)}
                  onClick={() => {
                    // A click inside the open editor places the caret; it must not re-select the cell and cancel the edit.
                    if (isEditing) return;
                    if (isSelected) props.onEditStart(ref, null);
                    else props.onSelect(ref);
                  }}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      className={styles['cellInput']}
                      value={editing.text}
                      inputMode="decimal"
                      aria-label={`${row.employee?.name ?? row.employeeId}, ${monthLabel(cell.month)}`}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => props.onEditChange(event.target.value)}
                      onBlur={() => props.onEditCommit('stay')}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === 'Enter') props.onEditCommit('down');
                        else if (event.key === 'Tab') {
                          event.preventDefault();
                          props.onEditCommit('right');
                        } else if (event.key === 'Escape') props.onEditCancel();
                      }}
                    />
                  ) : (
                    <>
                      {cell.unpriced && <span className={styles['noRate']}>no rate</span>}
                      {displayed(cell.displayed, grid.unit)}
                      {cell.overCapacity && <span className={styles['overMark']} aria-label="over capacity">!</span>}
                    </>
                  )}
                </div>
              );
            })}
            <div role="gridcell" aria-readonly="true" className={`${styles['cell']} ${styles['total']}`}>
              {displayed(row.total, grid.unit)}
            </div>
          </div>
        ),
      )}

      <div className={`${styles['row']} ${styles['sumRow']}`} role="row">
        <div className={styles['name']} style={{ paddingLeft: 12 }} role="rowheader">
          Project total
        </div>
        {grid.totals.map((total, index) => (
          <div key={grid.months[index]} role="gridcell" className={styles['cell']}>
            {total === null ? '' : displayed(total, grid.unit)}
          </div>
        ))}
        <div role="gridcell" className={`${styles['cell']} ${styles['total']}`}>
          {displayed(grid.grandTotal, grid.unit)}
        </div>
      </div>
    </div>
  );
}
