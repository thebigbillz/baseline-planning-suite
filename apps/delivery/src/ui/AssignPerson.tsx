import { useMemo, useState } from 'react';
import type { Employee, EmployeeId, MonthKey } from '@baseline/contracts';
import { isOverCapacity, type LoadIndex } from '../domain/capacity';
import { fixed } from './format';
import { usePopover } from './usePopover';
import styles from './delivery.module.css';

interface AssignPersonProps {
  readonly itemName: string;
  readonly employees: readonly Employee[];
  readonly alreadyAssigned: ReadonlySet<EmployeeId>;
  readonly months: readonly MonthKey[];
  readonly load: LoadIndex;
  readonly onAssign: (employeeId: EmployeeId) => void;
  readonly onClose: () => void;
}

const SHOWN = 6;

/**
 * Search the register and see each person's load before adding them: peak
 * load over the months on screen, least loaded first. Names and hours come
 * from People's directory; the load is Delivery's own.
 */
export function AssignPerson({ itemName, employees, alreadyAssigned, months, load, onAssign, onClose }: AssignPersonProps) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const popover = usePopover<HTMLDivElement>(onClose);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return employees
      .filter((employee) => needle === '' || employee.name.toLowerCase().includes(needle) || employee.role.toLowerCase().includes(needle))
      .map((employee) => ({
        employee,
        assigned: alreadyAssigned.has(employee.id),
        peak: Math.max(0, ...months.map((month) => load.get(employee.id, month)?.personMonths ?? 0)),
      }))
      .sort((a, b) => Number(a.assigned) - Number(b.assigned) || a.peak - b.peak || a.employee.name.localeCompare(b.employee.name));
  }, [employees, alreadyAssigned, months, load, query]);

  const selectable = matches.filter((match) => !match.assigned);

  return (
    <div className={styles['popover']} ref={popover} role="dialog" aria-label={`Assign a person to ${itemName}`}>
      <input
        autoFocus
        className={styles['popoverSearch']}
        placeholder="Search name or role"
        aria-label="Search people to assign"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') setHighlight((value) => Math.min(selectable.length - 1, value + 1));
          else if (event.key === 'ArrowUp') setHighlight((value) => Math.max(0, value - 1));
          else if (event.key === 'Enter') {
            const chosen = selectable[highlight];
            if (chosen !== undefined) onAssign(chosen.employee.id);
          } else return;
          event.preventDefault();
        }}
      />
      <div className={styles['popoverHead']}>
        <span>
          {matches.length} of {employees.length} people
        </span>
        <span>Peak load, months shown</span>
      </div>
      {matches.slice(0, SHOWN).map(({ employee, assigned, peak }) => (
        <button key={employee.id} type="button" className={styles['candidate']} disabled={assigned} data-highlight={selectable[highlight]?.employee.id === employee.id} onClick={() => onAssign(employee.id)}>
          <span className={styles['who']}>
            <strong>{employee.name}</strong>
            <small>
              {employee.role} · {employee.weeklyHours} h / week
            </small>
          </span>
          {assigned ? (
            <small>Already on {itemName}</small>
          ) : (
            <span className={styles['peak']} data-over={isOverCapacity(peak)}>
              <code>{fixed(peak * 100, 1)}%</code>
              <span className={styles['meter']}>
                <span style={{ width: `${Math.min(100, peak * 100)}%` }} />
              </span>
            </span>
          )}
        </button>
      ))}
      <p className={styles['popoverFoot']}>
        <span>Least loaded first · names and hours come from People</span>
        {matches.length > SHOWN && <span>{matches.length - SHOWN} more · keep typing</span>}
      </p>
    </div>
  );
}
