import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EmployeeId, MonthKey } from '@baseline/contracts';
import type { HostContext } from '@baseline/contracts/host';
import { usePlanning } from './data/usePlanning';
import { addItem, deleteItem, depthOf, describeBreakdownError, moveItem, renameItem, subtreeIds } from './domain/breakdown';
import { monthOf, monthsBetween, nextMonth } from './domain/calendar';
import { buildGrid, type GridRow } from './domain/grid';
import { MAX_DEPTH, NO_CHANGES, type Allocation, type AllocationId, type ChangeSet, type ItemId, type ProjectId } from './domain/model';
import { priceAllocation } from './domain/pricing';
import { blendedRate, sliceMonth } from './domain/rates';
import { summarise } from './domain/summary';
import { DECIMALS, UNITS, toPersonMonths, type CellContext, type ConversionError, type Unit } from './domain/units';
import { AssignPerson } from './ui/AssignPerson';
import { Inspector, type Preview } from './ui/Inspector';
import { AddItemDialog, ItemMenu, MovePicker } from './ui/ItemActions';
import { ProjectsPage } from './ui/ProjectsPage';
import { SidebarBlock } from './ui/SidebarBlock';
import { StaffingGrid, sameCell, type CellRef, type Editing } from './ui/StaffingGrid';
import { filterRows } from './ui/filterRows';
import { UNIT_LABEL, dateLabel, monthLabel, parseTyped } from './ui/format';
import { projectFromUrl, pushRecent, readRecent, writeProjectToUrl } from './ui/recentProjects';
import styles from './ui/delivery.module.css';

const WINDOW = 7;
const newId = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const thisMonth = (): MonthKey => new Date().toISOString().slice(0, 7) as MonthKey;

const describeConversion = (error: ConversionError): string => {
  switch (error.kind) {
    case 'not-a-number':
      return 'That is not a number. Nothing was stored.';
    case 'negative':
      return 'Effort cannot be negative. Nothing was stored.';
    case 'no-rate':
      return `No rate applies in ${monthLabel(error.month)}, so a cost cannot be turned into effort. Enter hours or person-months instead.`;
  }
};

type ItemMode =
  | { readonly kind: 'menu'; readonly id: ItemId }
  | { readonly kind: 'rename'; readonly id: ItemId; readonly text: string; readonly error: string | null }
  | { readonly kind: 'move'; readonly id: ItemId }
  | { readonly kind: 'delete'; readonly id: ItemId }
  | { readonly kind: 'assign'; readonly id: ItemId }
  | { readonly kind: 'add'; readonly parentId: ItemId | null; readonly error: string | null };

export function App({ host, sidebarSlot }: { readonly host: HostContext; readonly sidebarSlot: HTMLElement | null }) {
  const planning = usePlanning();
  const { plan, people, load } = planning;
  const [recent, setRecent] = useState(readRecent);
  const [projectId, setProjectId] = useState<ProjectId | null>(() => projectFromUrl() ?? readRecent()[0] ?? null);
  const [unit, setUnit] = useState<Unit>('personMonths');
  const [windowStart, setWindowStart] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<ItemId>>(new Set());
  const [selected, setSelected] = useState<CellRef | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pending, setPending] = useState<ReadonlyMap<ItemId, readonly EmployeeId[]>>(new Map());
  const [mode, setMode] = useState<ItemMode | null>(null);
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const project = plan?.projects.find((candidate) => candidate.id === projectId) ?? null;
  const closeMode = useCallback(() => setMode(null), []);

  const openProject = useCallback((id: ProjectId | null) => {
    setProjectId(id);
    writeProjectToUrl(id);
    if (id !== null) setRecent(pushRecent(id));
    setSelected(null);
    setEditing(null);
    setMode(null);
    setWindowStart(0);
    setFilter('');
  }, []);

  // A project reached by link counts as opened, so it is there to reopen next time.
  useEffect(() => {
    if (project !== null) setRecent(pushRecent(project.id));
  }, [project?.id]);

  // First sight of a project: open its top level so the grid is not a wall of collapsed rows.
  useEffect(() => {
    if (plan === null || project === null) return;
    setExpanded((current) => (current.size > 0 ? current : new Set(plan.items.filter((item) => item.projectId === project.id && item.parentId === null).map((item) => item.id))));
  }, [plan, project]);

  // A rate saved in People arrives as a notice; say so, since the figures just moved under the user.
  useEffect(() => {
    if (planning.peopleState.status !== 'ready' || !planning.peopleState.byNotice) return undefined;
    setNotice('Rates changed in People. Costs here were repriced, no reload.');
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [planning.peopleState]);

  const projectMonths = useMemo(() => (project === null ? [] : monthsBetween(monthOf(project.startDate), monthOf(project.endDate))), [project]);
  const months = useMemo(() => projectMonths.slice(windowStart, windowStart + WINDOW), [projectMonths, windowStart]);

  const summaries = useMemo(() => (plan === null ? [] : plan.projects.map((candidate) => summarise(plan, candidate, people, load))), [plan, people, load]);

  const filtering = filter.trim() !== '';
  const grid = useMemo(() => {
    if (plan === null || project === null) return null;
    const everything = new Set(plan.items.map((item) => item.id));
    const built = buildGrid({ plan, project, months, unit, people, load, expanded: filtering ? everything : expanded, pendingAssignments: pending, perEuro: host.currency.perEuro });
    return { ...built, rows: filterRows(built.rows, filter) };
  }, [plan, project, months, unit, people, load, expanded, pending, host.currency.perEuro, filter, filtering]);

  // ---------- cells ----------

  const allocationAt = useCallback(
    (cell: CellRef): Allocation | null =>
      plan?.allocations.find((entry) => entry.breakdownItemId === cell.itemId && entry.employeeId === cell.employeeId && entry.month === cell.month) ?? null,
    [plan],
  );

  const contextFor = useCallback(
    (cell: CellRef): CellContext | null => {
      const employee = people.employee(cell.employeeId);
      return employee === undefined ? null : { weeklyHours: employee.weeklyHours, month: cell.month, blendedRate: blendedRate(sliceMonth(people.ratesOf(cell.employeeId), cell.month)) };
    },
    [people],
  );

  const writeCells = useCallback(
    (writes: readonly { cell: CellRef; personMonths: number }[]): Promise<boolean> => {
      const changes: ChangeSet = writes.reduce<ChangeSet>((set, { cell, personMonths }) => {
        const existing = allocationAt(cell);
        if (personMonths === 0) return existing === null ? set : { ...set, deleteAllocationIds: [...set.deleteAllocationIds, existing.id] };
        const write = { id: existing?.id ?? (newId('alloc') as AllocationId), breakdownItemId: cell.itemId, employeeId: cell.employeeId, month: cell.month, personMonths, updatedBy: host.user.name };
        return { ...set, upsertAllocations: [...set.upsertAllocations, write] };
      }, NO_CHANGES);
      return planning.apply(changes);
    },
    [allocationAt, host.user.name, planning],
  );

  const startEdit = (cell: CellRef, firstKey: string | null): void => {
    const row = grid?.rows.find((candidate) => candidate.kind === 'person' && candidate.itemId === cell.itemId && candidate.employeeId === cell.employeeId);
    const shown = row?.cells.find((candidate) => candidate.month === cell.month)?.displayed ?? null;
    const initial = shown === null ? '' : (shown / 10 ** DECIMALS[unit]).toFixed(DECIMALS[unit]);
    setSelected(cell);
    setEditing({ cell, initial, text: firstKey ?? initial, error: null });
  };

  const typedToPersonMonths = (current: Editing): { typed: number; result: ReturnType<typeof toPersonMonths> } | null => {
    const context = contextFor(current.cell);
    if (context === null) return null;
    const typed = parseTyped(current.text);
    // Cost is typed in the display currency the shell chose; the plan is priced in EUR.
    return { typed, result: toPersonMonths(unit, unit === 'cost' ? typed / host.currency.perEuro : typed, context) };
  };

  const commitEdit = async (then: 'stay' | 'right' | 'down'): Promise<void> => {
    if (editing === null) return;
    const current = editing;
    const step = (): void => {
      setEditing(null);
      if (then === 'stay' || grid === null) return;
      const personRows = grid.rows.filter((row): row is Extract<GridRow, { kind: 'person' }> => row.kind === 'person');
      const rowIndex = personRows.findIndex((row) => row.itemId === current.cell.itemId && row.employeeId === current.cell.employeeId);
      const monthIndex = months.indexOf(current.cell.month);
      const target = then === 'down' ? personRows[rowIndex + 1] : personRows[rowIndex];
      const month = then === 'down' ? current.cell.month : months[monthIndex + 1];
      if (target !== undefined && month !== undefined) setSelected({ itemId: target.itemId, employeeId: target.employeeId, month });
    };
    // Unchanged text writes nothing: looking at a value in another unit can never alter it.
    if (current.text.trim() === current.initial.trim()) return step();
    if (current.text.trim() === '') {
      await writeCells([{ cell: current.cell, personMonths: 0 }]);
      return step();
    }
    const converted = typedToPersonMonths(current);
    if (converted === null) return setEditing({ ...current, error: 'People’s directory is unavailable, so this unit cannot be converted. Switch to person-months.' });
    if (!converted.result.ok) return setEditing({ ...current, error: describeConversion(converted.result.error) });
    if (await writeCells([{ cell: current.cell, personMonths: converted.result.personMonths }])) step();
  };

  const preview = useMemo<Preview | null>(() => {
    if (editing === null || editing.text.trim() === editing.initial.trim()) return null;
    const converted = typedToPersonMonths(editing);
    return converted !== null && converted.result.ok ? { typed: converted.typed, personMonths: converted.result.personMonths } : null;
  }, [editing, unit, host.currency.perEuro, contextFor]);

  // ---------- over capacity: jump to the next flagged cell ----------

  const flagged = useMemo(() => {
    if (plan === null || project === null) return [];
    const itemIds = new Set(plan.items.filter((item) => item.projectId === project.id).map((item) => item.id));
    return plan.allocations
      .filter((entry) => itemIds.has(entry.breakdownItemId) && entry.personMonths > 0 && load.isOver(entry.employeeId, entry.month))
      .sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id));
  }, [plan, project, load]);

  const jumpToNextFlag = (): void => {
    if (plan === null || flagged.length === 0) return;
    const at = flagged.findIndex((entry) => sameCell(selected, { itemId: entry.breakdownItemId, employeeId: entry.employeeId, month: entry.month }));
    const next = flagged[(at + 1) % flagged.length];
    if (next === undefined) return;
    const ancestors: ItemId[] = [];
    for (let item = plan.items.find((candidate) => candidate.id === next.breakdownItemId); item !== undefined; ) {
      ancestors.push(item.id);
      const parentId = item.parentId;
      item = parentId === null ? undefined : plan.items.find((candidate) => candidate.id === parentId);
    }
    setFilter('');
    setExpanded((current) => new Set([...current, ...ancestors]));
    const monthIndex = projectMonths.indexOf(next.month);
    if (monthIndex < windowStart || monthIndex >= windowStart + WINDOW) setWindowStart(Math.max(0, Math.min(projectMonths.length - WINDOW, monthIndex - 2)));
    setSelected({ itemId: next.breakdownItemId, employeeId: next.employeeId, month: next.month });
  };

  // ---------- work breakdown ----------

  const toggle = (id: ItemId): void => setExpanded((current) => (current.has(id) ? new Set([...current].filter((other) => other !== id)) : new Set([...current, id])));

  const confirmAdd = async (name: string): Promise<void> => {
    if (plan === null || project === null || mode?.kind !== 'add') return;
    const id = newId('wbs') as ItemId;
    const result = addItem(plan, { id, projectId: project.id, parentId: mode.parentId, name });
    if (!result.ok) return setMode({ ...mode, error: describeBreakdownError(result.error) });
    if (await planning.apply(result.value.changes)) {
      setExpanded((current) => new Set([...current, ...(mode.parentId === null ? [] : [mode.parentId]), id]));
      setMode(null);
    }
  };

  const confirmRename = async (): Promise<void> => {
    if (plan === null || mode?.kind !== 'rename') return;
    const result = renameItem(plan, mode.id, mode.text);
    if (!result.ok) return setMode({ ...mode, error: describeBreakdownError(result.error) });
    if (await planning.apply(result.value)) setMode(null);
  };

  const confirmMove = async (id: ItemId, parentId: ItemId | null): Promise<void> => {
    if (plan === null) return;
    const result = moveItem(plan, id, parentId);
    if (result.ok && (await planning.apply(result.value))) {
      if (parentId !== null) setExpanded((current) => new Set([...current, parentId]));
      setMode(null);
    }
  };

  const confirmDelete = async (id: ItemId): Promise<void> => {
    if (plan === null) return;
    const result = deleteItem(plan, id);
    if (result.ok && (await planning.apply(result.value.changes))) {
      if (selected !== null && subtreeIds(plan.items, id).includes(selected.itemId)) setSelected(null);
      setMode(null);
    }
  };

  const assign = (itemId: ItemId, employeeId: EmployeeId): void => {
    setPending((current) => new Map(current).set(itemId, [...(current.get(itemId) ?? []), employeeId]));
    setExpanded((current) => new Set([...current, itemId]));
    const month = months.find((candidate) => project !== null && candidate >= monthOf(project.startDate) && candidate <= monthOf(project.endDate));
    if (month !== undefined) setSelected({ itemId, employeeId, month });
    setMode(null);
  };

  // ---------- render ----------

  if (planning.planError !== null) {
    return (
      <div className={styles['page']} role="alert">
        <h1>Delivery’s plan could not be loaded.</h1>
        <p>{planning.planError}</p>
      </div>
    );
  }
  if (plan === null) return <p className={styles['loading']}>Loading the plan…</p>;

  const sidebar = sidebarSlot !== null && (
    <SidebarBlock slot={sidebarSlot} summaries={summaries} recentIds={recent} currentId={project?.id ?? null} workItems={plan.items.length} onOpen={openProject} onShowAll={() => openProject(null)} />
  );

  if (project === null || grid === null) {
    return (
      <>
        {sidebar}
        <ProjectsPage summaries={summaries} currency={host.currency} onOpen={openProject} />
      </>
    );
  }

  const selectedEmployee = selected === null ? undefined : people.employee(selected.employeeId);
  const selectedContext = selected === null ? null : contextFor(selected);
  const selectedAllocation = selected === null ? null : allocationAt(selected);
  const items = plan.items.filter((item) => item.projectId === project.id);

  const renderItem = (row: Extract<GridRow, { kind: 'item' }>): JSX.Element => {
    const { item } = row;
    if (mode?.kind === 'rename' && mode.id === item.id) {
      return (
        <form
          className={styles['renameForm']}
          onSubmit={(event) => {
            event.preventDefault();
            void confirmRename();
          }}
        >
          <input
            autoFocus
            aria-label={`Rename ${item.name}`}
            aria-invalid={mode.error !== null}
            value={mode.text}
            onFocus={(event) => event.target.select()}
            onChange={(event) => setMode({ ...mode, text: event.target.value, error: null })}
            onKeyDown={(event) => event.key === 'Escape' && setMode(null)}
            onBlur={() => void confirmRename()}
          />
          {mode.error !== null && <small className={styles['formError']}>{mode.error}</small>}
        </form>
      );
    }
    if (mode?.kind === 'delete' && mode.id === item.id) {
      const doomed = deleteItem(plan, item.id);
      return (
        <div className={styles['deleteConfirm']} role="alertdialog" aria-label={`Delete ${item.name}`}>
          <span>
            Delete “{item.name}”{doomed.ok && doomed.value.removedItems > 1 ? ` and ${doomed.value.removedItems - 1} items inside` : ''}
            {doomed.ok && doomed.value.removedAllocations > 0 ? `, with ${doomed.value.removedAllocations} ${doomed.value.removedAllocations === 1 ? 'allocation' : 'allocations'}` : ''}?
          </span>
          <button type="button" onClick={() => setMode(null)}>
            Keep
          </button>
          <button type="button" data-danger="true" autoFocus onClick={() => void confirmDelete(item.id)}>
            Delete
          </button>
        </div>
      );
    }
    return (
      <>
        <button type="button" className={styles['toggle']} aria-expanded={row.expanded} aria-label={`${row.expanded ? 'Collapse' : 'Expand'} ${item.name}`} onClick={() => toggle(item.id)} onKeyDown={(event) => event.key === 'F2' && setMode({ kind: 'rename', id: item.id, text: item.name, error: null })}>
          <span className={styles['chevron']} data-open={row.expanded} />
          <span className={styles['itemName']}>{item.name}</span>
        </button>
        <span className={styles['meta']}>{row.leaf ? `${row.people} ${row.people === 1 ? 'person' : 'people'}` : 'derived'}</span>
        <span className={styles['rowActions']}>
          {row.leaf && (
            <button type="button" onClick={() => setMode({ kind: 'assign', id: item.id })}>
              + Assign person
            </button>
          )}
          <button type="button" aria-label={`Actions for ${item.name}`} aria-haspopup="menu" onClick={() => setMode({ kind: 'menu', id: item.id })}>
            ⋯
          </button>
        </span>
        {mode?.kind === 'menu' && mode.id === item.id && (
          <ItemMenu
            canAddInside={depthOf(items, item.id) < MAX_DEPTH}
            onAddInside={() => setMode({ kind: 'add', parentId: item.id, error: null })}
            onRename={() => setMode({ kind: 'rename', id: item.id, text: item.name, error: null })}
            onMove={() => setMode({ kind: 'move', id: item.id })}
            onDelete={() => setMode({ kind: 'delete', id: item.id })}
            onClose={closeMode}
          />
        )}
        {mode?.kind === 'move' && mode.id === item.id && <MovePicker plan={plan} item={item} onMove={(parentId) => void confirmMove(item.id, parentId)} onClose={closeMode} />}
        {mode?.kind === 'assign' && mode.id === item.id && (
          <AssignPerson
            itemName={item.name}
            employees={people.employees}
            alreadyAssigned={new Set([...plan.allocations.filter((entry) => entry.breakdownItemId === item.id).map((entry) => entry.employeeId), ...(pending.get(item.id) ?? [])])}
            months={months}
            load={load}
            onAssign={(employeeId) => assign(item.id, employeeId)}
            onClose={closeMode}
          />
        )}
      </>
    );
  };

  const addParent = mode?.kind === 'add' && mode.parentId !== null ? (items.find((item) => item.id === mode.parentId) ?? null) : null;
  const lastWindow = Math.max(0, projectMonths.length - WINDOW);

  return (
    <div className={styles['page']}>
      {sidebar}
      <header className={styles['pageHead']}>
        <div>
          <h1>{project.name}</h1>
          <p>
            {dateLabel(project.startDate)} – {dateLabel(project.endDate)} · {items.length} work items · {summaries.find((summary) => summary.project.id === project.id)?.people ?? 0} people
          </p>
        </div>
        <div className={styles['headActions']}>
          <p className={styles['saveState']} data-status={planning.save.status} role="status">
            {planning.save.status === 'saved' ? 'All changes saved' : planning.save.status === 'saving' ? 'Saving…' : `Not saved: ${planning.save.message}`}
          </p>
          <button type="button" className={styles['secondary']} onClick={() => setMode({ kind: 'add', parentId: null, error: null })}>
            + Add work item
          </button>
        </div>
      </header>

      {planning.peopleState.status === 'unavailable' && (
        <p className={styles['banner']} role="status">
          People’s directory is unavailable, so names, hours and costs cannot be shown. Person-months and capacity still work, because they are Delivery’s own.
        </p>
      )}

      <div className={styles['toolbar']}>
        <div className={styles['segmented']} role="radiogroup" aria-label="Unit">
          {UNITS.map((option) => (
            <button key={option} type="button" role="radio" aria-checked={unit === option} onClick={() => setUnit(option)}>
              {UNIT_LABEL[option]}
              {option === 'cost' ? ` ${host.currency.symbol}` : ''}
            </button>
          ))}
        </div>
        <input type="search" className={styles['filter']} placeholder="Filter work items or people" aria-label="Filter work items or people" value={filter} onChange={(event) => setFilter(event.target.value)} />
        {flagged.length > 0 && (
          <button type="button" className={styles['flagChip']} onClick={jumpToNextFlag}>
            {flagged.length} over capacity · next
          </button>
        )}
        <span className={styles['spacer']} />
        <button type="button" className={styles['quiet']} onClick={() => setExpanded(new Set())}>
          Collapse all
        </button>
        <div className={styles['pager']} title={`${months.length} of ${projectMonths.length} months`}>
          <button type="button" aria-label="Earlier months" disabled={windowStart === 0} onClick={() => setWindowStart(Math.max(0, windowStart - WINDOW))}>
            ‹
          </button>
          <span>
            {months[0] !== undefined && monthLabel(months[0])} – {months.at(-1) !== undefined && monthLabel(months.at(-1) as MonthKey)}
          </span>
          <button type="button" aria-label="Later months" disabled={windowStart >= lastWindow} onClick={() => setWindowStart(Math.min(lastWindow, windowStart + WINDOW))}>
            ›
          </button>
        </div>
      </div>

      <StaffingGrid
        grid={grid}
        currentMonth={thisMonth()}
        selected={selected}
        editing={editing}
        onSelect={(cell) => {
          setSelected(cell);
          setEditing(null);
        }}
        onEditStart={startEdit}
        onEditChange={(text) => setEditing((current) => (current === null ? null : { ...current, text, error: null }))}
        onEditCommit={(then) => void commitEdit(then)}
        onEditCancel={() => setEditing(null)}
        onClear={(cell) => void writeCells([{ cell, personMonths: 0 }])}
        renderItem={renderItem}
      />

      <p className={styles['hint']} role="status">
        {editing?.error ?? 'Arrows move · Enter edits · Esc cancels · Tab saves and moves right · Delete clears'}
      </p>

      {selected !== null && selectedEmployee !== undefined && selectedContext !== null ? (
        <Inspector
          plan={plan}
          employee={selectedEmployee}
          month={selected.month}
          allocation={selectedAllocation}
          priced={priceAllocation({ personMonths: selectedAllocation?.personMonths ?? 0, weeklyHours: selectedEmployee.weeklyHours, month: selected.month, rates: people.ratesOf(selected.employeeId) })}
          cell={selectedContext}
          load={load.get(selected.employeeId, selected.month)}
          nextLoad={load.get(selected.employeeId, nextMonth(selected.month))?.personMonths ?? 0}
          nextMonthInProject={nextMonth(selected.month) <= monthOf(project.endDate)}
          unit={unit}
          currency={host.currency}
          preview={preview}
          onSetCell={(month, personMonths) => void writeCells([{ cell: { ...selected, month }, personMonths }])}
          onMove={(from, to, keep, moved) =>
            void writeCells([
              { cell: { ...selected, month: from }, personMonths: keep },
              { cell: { ...selected, month: to }, personMonths: (allocationAt({ ...selected, month: to })?.personMonths ?? 0) + moved },
            ])
          }
        />
      ) : (
        <p className={styles['emptyInspector']}>Select a cell to see how it is priced and how it counts against that person’s capacity.</p>
      )}

      {notice !== null && (
        <p className={styles['toast']} role="status">
          {notice}
        </p>
      )}

      {mode?.kind === 'add' && (
        <AddItemDialog
          parent={addParent}
          moving={addParent === null ? [] : plan.allocations.filter((entry) => entry.breakdownItemId === addParent.id)}
          error={mode.error}
          onConfirm={(name) => void confirmAdd(name)}
          onClose={closeMode}
        />
      )}
    </div>
  );
}
