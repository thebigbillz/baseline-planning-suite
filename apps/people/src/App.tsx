import { useMemo, useState } from 'react';
import type { Employee, EmployeeId, MonthKey } from '@baseline/contracts';
import type { HostContext } from '@baseline/contracts/host';
import { isOversubscribed } from './data/deliveryLoad';
import { useRegister } from './data/useRegister';
import { rateAtEndOf } from './domain/rateHistory';
import { RateHistory } from './ui/RateHistory';
import { dateLabel, euros, inDisplayCurrency, monthInitial, monthLabel, monthsFrom, percent, thisMonth } from './ui/format';
import styles from './ui/people.module.css';

const SHOWN = 50;

export function App({ host }: { readonly host: HostContext }) {
  const register = useRegister();
  const [query, setQuery] = useState('');
  const [onlyOver, setOnlyOver] = useState(false);
  const [month, setMonth] = useState<MonthKey>(thisMonth);
  const [selectedId, setSelectedId] = useState<EmployeeId | null>(null);

  const load = register.loadState.status === 'ready' ? register.loadState.load : null;

  /** Twelve months starting from the first planned month, so the strip covers the plan whatever today is. */
  const months = useMemo(() => {
    const planned = load === null ? [] : [...load.values()].flatMap((byMonth) => [...byMonth.keys()]).sort();
    return monthsFrom(planned[0] ?? thisMonth(), Math.max(12, new Set(planned).size));
  }, [load]);

  const overMonthsOf = (id: EmployeeId): MonthKey[] => (load === null ? [] : [...(load.get(id) ?? [])].filter(([, value]) => isOversubscribed(value)).map(([key]) => key).sort());

  const people = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (register.directory?.employees ?? [])
      .filter((employee) => needle === '' || `${employee.name} ${employee.role} ${employee.id}`.toLowerCase().includes(needle))
      .filter((employee) => !onlyOver || overMonthsOf(employee.id).length > 0)
      .map((employee) => ({ employee, loadNow: load?.get(employee.id)?.get(month) ?? 0 }))
      .sort((a, b) => b.loadNow - a.loadNow || a.employee.name.localeCompare(b.employee.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register.directory, query, onlyOver, load, month]);

  if (register.error !== null) {
    return (
      <div className={styles['page']} role="alert">
        <h1>The register could not be loaded.</h1>
        <p>{register.error}</p>
      </div>
    );
  }
  if (register.directory === null) return <p className={styles['loading']}>Loading the register…</p>;

  const { employees, rateRecords } = register.directory;
  const overCount = employees.filter((employee) => overMonthsOf(employee.id).length > 0).length;
  const selected = employees.find((employee) => employee.id === selectedId) ?? null;

  return (
    <div className={styles['page']}>
      <header className={styles['pageHead']}>
        <div>
          <h1>People &amp; rates</h1>
          <p>The register behind every plan. One owner for weekly hours and cost rates.</p>
        </div>
        <p>
          {employees.length} people <span className={styles['slash']}>/</span> {rateRecords.length} rate records
        </p>
      </header>

      <div className={styles['columns']}>
        <section className={styles['card']} aria-label="Register">
          <div className={styles['controls']}>
            <input type="search" className={styles['search']} placeholder="Search name, role or id" aria-label="Search the register" value={query} onChange={(event) => setQuery(event.target.value)} />
            {load !== null && (
              <button type="button" className={styles['chip']} aria-pressed={onlyOver} onClick={() => setOnlyOver((value) => !value)}>
                {overCount} oversubscribed
              </button>
            )}
            <span className={styles['spacer']} />
            <label className={styles['monthPicker']}>
              <span>Load in</span>
              <select value={month} onChange={(event) => setMonth(event.target.value as MonthKey)}>
                {(months.includes(month) ? months : [month, ...months]).map((option) => (
                  <option key={option} value={option}>
                    {monthLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles['listHead']}>
            <span>Person</span>
            <span>Cross-project capacity</span>
          </div>
          <div className={styles['list']}>
            {people.slice(0, SHOWN).map(({ employee, loadNow }) => (
              <PersonRow key={employee.id} employee={employee} loadNow={load === null ? null : loadNow} overMonths={overMonthsOf(employee.id)} selected={employee.id === selectedId} onSelect={() => setSelectedId(employee.id)} />
            ))}
            {people.length === 0 && <p className={styles['muted']}>Nobody matches “{query}”.</p>}
          </div>
          <footer className={styles['listFoot']}>
            <span>
              Showing {Math.min(SHOWN, people.length)} of {employees.length} · sorted by load in {monthLabel(month)}
              {people.length > SHOWN ? ' · search to narrow' : ''}
            </span>
            <span>{load === null ? 'Load is published by Delivery, which is not answering.' : 'Counts every project, open or not.'}</span>
          </footer>
        </section>

        {selected === null ? (
          <section className={`${styles['card']} ${styles['detail']} ${styles['placeholder']}`}>
            <p>Select a person to see their rate history and load.</p>
          </section>
        ) : (
          <section className={`${styles['card']} ${styles['detail']}`} aria-label={selected.name}>
            <header className={styles['detailHead']}>
              <div>
                <h2>{selected.name}</h2>
                <p>
                  {selected.role} · {selected.weeklyHours} hours / week · <code>{selected.id}</code>
                </p>
              </div>
              <button type="button" className={styles['quiet']} aria-label="Close" onClick={() => setSelectedId(null)}>
                ✕
              </button>
            </header>

            <Summary employee={selected} month={month} host={host} rate={rateAtEndOf(rateRecords.filter((record) => record.employeeId === selected.id), month)} loadNow={load?.get(selected.id)?.get(month) ?? null} available={load !== null} />

            {register.loadState.status === 'unavailable' ? (
              <div className={styles['degraded']} role="status">
                <strong>Load isn’t available right now</strong>
                <p>Capacity is published by Delivery, which isn’t responding. Rates and weekly hours are People’s own data, so everything else on this page still works.</p>
                <button type="button" className={styles['secondary']} onClick={register.retryLoad}>
                  Check again
                </button>
              </div>
            ) : (
              <div className={styles['strip']}>
                <div className={styles['bars']}>
                  <i className={styles['capacityLine']} />
                  {months.slice(0, 12).map((key) => {
                    const value = load?.get(selected.id)?.get(key) ?? 0;
                    return (
                      <button key={key} type="button" title={`${monthLabel(key)} · ${percent(value)}`} aria-label={`${monthLabel(key)}: ${percent(value)}`} aria-pressed={key === month} onClick={() => setMonth(key)}>
                        <span data-over={isOversubscribed(value)} style={{ height: `${Math.max(2, Math.min(64, value * 46))}px` }} />
                        <small>{monthInitial(key)}</small>
                      </button>
                    );
                  })}
                </div>
                <p className={styles['muted']}>
                  Load per month from {monthLabel(months[0] as MonthKey)} · dashed line is 100% · published by Delivery
                </p>
              </div>
            )}

            <RateHistory key={selected.id} employee={selected} records={rateRecords.filter((record) => record.employeeId === selected.id)} currency={host.currency} mutate={(write) => register.mutate(selected.id, write)} />
          </section>
        )}
      </div>
    </div>
  );
}

function PersonRow({ employee, loadNow, overMonths, selected, onSelect }: { readonly employee: Employee; readonly loadNow: number | null; readonly overMonths: readonly MonthKey[]; readonly selected: boolean; readonly onSelect: () => void }) {
  const overNow = loadNow !== null && isOversubscribed(loadNow);
  return (
    <button type="button" className={styles['person']} data-over={overNow} aria-pressed={selected} onClick={onSelect}>
      <span className={styles['who']}>
        <strong>{employee.name}</strong>
        <small>
          {employee.role} · {employee.weeklyHours} h / week
        </small>
      </span>
      <span className={styles['load']}>
        <strong>{loadNow === null ? '—' : percent(loadNow)}</strong>
        <small>{overNow ? 'Over capacity' : overMonths.length > 0 ? `Oversubscribed in ${overMonths.map((key) => monthLabel(key)).join(', ')}` : loadNow === null ? 'Load unavailable' : 'Allocated'}</small>
      </span>
    </button>
  );
}

function Summary({ employee, month, host, rate, loadNow, available }: { readonly employee: Employee; readonly month: MonthKey; readonly host: HostContext; readonly rate: ReturnType<typeof rateAtEndOf>; readonly loadNow: number | null; readonly available: boolean }) {
  const over = loadNow !== null && isOversubscribed(loadNow);
  return (
    <div className={styles['summary']}>
      <div className={styles['rateCard']}>
        <small>Effective rate · {monthLabel(month)}</small>
        {rate === null ? (
          <strong>No rate yet</strong>
        ) : (
          <strong>
            {euros(rate.hourlyCost)} <em>/ hour</em>
          </strong>
        )}
        <span>{rate === null ? `Planned time for ${employee.name.split(' ')[0] ?? ''} costs zero this month.` : `Since ${dateLabel(rate.validFrom)} ${inDisplayCurrency(rate.hourlyCost, host.currency) ?? ''}`}</span>
      </div>
      <div className={styles['loadCard']} data-over={over} data-available={available}>
        <small>Load · {monthLabel(month)}</small>
        <strong>{!available ? '—' : percent(loadNow ?? 0)}</strong>
        <span>{!available ? 'Published by Delivery' : `${(loadNow ?? 0).toFixed(2)} of 1.00 PM · all projects`}</span>
      </div>
    </div>
  );
}
