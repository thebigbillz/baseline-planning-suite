import { useState } from 'react';
import type { Employee, IsoDate, RateRecord } from '@baseline/contracts';
import type { DisplayCurrency } from '@baseline/contracts/host';
import { afterDeleting, periodsOf, reach, validateDraft, type RateDraftError } from '../domain/rateHistory';
import { addRate, correctRate, removeRate } from '../data/peopleApi';
import { dateLabel, euros, inDisplayCurrency, today } from './format';
import styles from './people.module.css';

type Mode = { readonly kind: 'add' } | { readonly kind: 'edit'; readonly record: RateRecord } | { readonly kind: 'delete'; readonly record: RateRecord } | null;

interface RateHistoryProps {
  readonly employee: Employee;
  readonly records: readonly RateRecord[];
  readonly currency: DisplayCurrency;
  readonly mutate: (write: () => Promise<unknown>) => Promise<string | null>;
}

const describe = (error: RateDraftError): string => {
  switch (error.kind) {
    case 'bad-date':
      return 'Enter a real date, year-month-day.';
    case 'bad-cost':
      return 'Enter the hourly cost in euros, zero or more.';
    case 'clash':
      return `A rate already starts on ${dateLabel(error.with.validFrom)} (${euros(error.with.hourlyCost)}). Pick another date, or edit that rate instead.`;
  }
};

/** A rate is a history, never a single field: records can be added, corrected and removed, including in the past. */
export function RateHistory({ employee, records, currency, mutate }: RateHistoryProps) {
  const [mode, setMode] = useState<Mode>(null);
  const periods = periodsOf(records);

  return (
    <section className={styles['history']} aria-labelledby="history-title">
      <header>
        <h3 id="history-title">Rate history</h3>
        <button type="button" className={styles['link']} onClick={() => setMode({ kind: 'add' })}>
          + Add rate
        </button>
      </header>

      {mode?.kind === 'add' && <RateForm key="add" title="Add rate" editing={null} records={records} onSubmit={(validFrom, cost) => mutate(() => addRate(employee.id, validFrom, cost))} onEditOther={(record) => setMode({ kind: 'edit', record })} onDone={() => setMode(null)} />}

      {periods.length === 0 && <p className={styles['muted']}>No rate yet. Until one is added, everything planned for {employee.name} costs zero and is marked in Delivery.</p>}

      {periods.map((period) => {
        const { record } = period;
        if (mode?.kind === 'edit' && mode.record.id === record.id) {
          return (
            <RateForm
              key={record.id}
              title={`Edit rate · was ${euros(record.hourlyCost)} from ${dateLabel(record.validFrom)}`}
              editing={record}
              records={records}
              onSubmit={(validFrom, cost) => mutate(() => correctRate(record.id, validFrom, cost))}
              onEditOther={(other) => setMode({ kind: 'edit', record: other })}
              onDone={() => setMode(null)}
            />
          );
        }
        if (mode?.kind === 'delete' && mode.record.id === record.id) {
          const after = afterDeleting(records, record);
          return (
            <div key={record.id} className={styles['confirm']} role="alertdialog" aria-label="Delete rate">
              <strong>
                Delete {euros(record.hourlyCost)} from {dateLabel(record.validFrom)}?
              </strong>
              <p>
                {after.takesOver === null
                  ? `No earlier rate takes over, so ${dateLabel(record.validFrom)}${after.until === null ? ' onwards' : ` – ${dateLabel(after.until)}`} will have no rate: it costs zero and is marked in Delivery.`
                  : `The rate before it takes over: ${euros(after.takesOver.hourlyCost)} / hour will run ${after.until === null ? 'open-ended' : `until ${dateLabel(after.until)}`}.`}{' '}
                Open Delivery cost views update straight away.
              </p>
              <DeleteButtons onKeep={() => setMode(null)} onDelete={() => mutate(() => removeRate(record.id))} onDone={() => setMode(null)} />
            </div>
          );
        }
        return (
          <div key={record.id} className={styles['period']}>
            <div>
              <small>
                {dateLabel(record.validFrom)} – {period.until === null ? 'open-ended' : dateLabel(period.until)}
                {period.isFirst ? ' · first rate' : ''}
              </small>
              <span>
                {euros(record.hourlyCost)} <em>/ hour</em>
                {inDisplayCurrency(record.hourlyCost, currency) !== null && <em> {inDisplayCurrency(record.hourlyCost, currency)}</em>}
                {period.startsMidMonth && <b className={styles['midMonth']}>starts mid-month</b>}
              </span>
            </div>
            <button type="button" className={styles['quiet']} onClick={() => setMode({ kind: 'edit', record })}>
              Edit
            </button>
            <button type="button" className={styles['quiet']} onClick={() => setMode({ kind: 'delete', record })}>
              Delete
            </button>
          </div>
        );
      })}
      <p className={styles['muted']}>A rate runs from its start date, inclusive, until the next one begins. Months before the first rate cost zero and are marked in Delivery.</p>
    </section>
  );
}

function DeleteButtons({ onKeep, onDelete, onDone }: { readonly onKeep: () => void; readonly onDelete: () => Promise<string | null>; readonly onDone: () => void }) {
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <>
      {failure !== null && <p className={styles['error']}>{failure}</p>}
      <footer>
        <button type="button" className={styles['secondary']} onClick={onKeep}>
          Keep rate
        </button>
        <button
          type="button"
          className={styles['danger']}
          onClick={() =>
            void onDelete().then((problem) => {
              if (problem === null) onDone();
              else setFailure(problem);
            })
          }
        >
          Delete rate
        </button>
      </footer>
    </>
  );
}

interface RateFormProps {
  readonly title: string;
  readonly editing: RateRecord | null;
  readonly records: readonly RateRecord[];
  readonly onSubmit: (validFrom: IsoDate, hourlyCost: number) => Promise<string | null>;
  readonly onEditOther: (record: RateRecord) => void;
  readonly onDone: () => void;
}

function RateForm({ title, editing, records, onSubmit, onEditOther, onDone }: RateFormProps) {
  const [validFrom, setValidFrom] = useState<string>(editing?.validFrom ?? today());
  const [hourlyCost, setHourlyCost] = useState(editing === null ? '' : editing.hourlyCost.toFixed(2));
  const [touched, setTouched] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const error = validateDraft(records, { validFrom, hourlyCost }, editing);
  const shown = touched || error?.kind === 'clash' ? error : null;
  const scope = error === null ? reach(records, validFrom as IsoDate, editing, today()) : null;

  return (
    <form
      className={styles['form']}
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (error !== null) return;
        setSaving(true);
        void onSubmit(validFrom as IsoDate, Number(hourlyCost)).then((problem) => {
          setSaving(false);
          if (problem === null) onDone();
          else setFailure(problem);
        });
      }}
    >
      <strong>{title}</strong>
      <div className={styles['fields']}>
        <label>
          Effective from
          <input type="date" value={validFrom} aria-invalid={shown?.kind === 'bad-date' || shown?.kind === 'clash'} onChange={(event) => setValidFrom(event.target.value)} />
        </label>
        <label>
          Hourly cost · stored in EUR
          <input autoFocus inputMode="decimal" placeholder="0.00" value={hourlyCost} aria-invalid={shown?.kind === 'bad-cost'} onChange={(event) => setHourlyCost(event.target.value)} />
        </label>
      </div>
      {shown !== null && <p className={styles['error']}>{describe(shown)}</p>}
      {failure !== null && <p className={styles['error']}>{failure}</p>}
      {scope !== null && (
        <p className={styles['scope']}>
          {scope.retroactive ? 'Retroactive: reprices ' : 'Applies '}
          {dateLabel(scope.from)} {scope.until === null ? 'onwards' : `– ${dateLabel(scope.until)}`}
          {scope.retroactive ? ', including past allocations' : ''}. Open Delivery cost views update as soon as you save.
        </p>
      )}
      <footer>
        {shown?.kind === 'clash' && (
          <button type="button" className={styles['link']} onClick={() => onEditOther(shown.with)}>
            Edit the {dateLabel(shown.with.validFrom)} rate
          </button>
        )}
        <button type="button" className={styles['quiet']} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={styles['primary']} disabled={saving || shown !== null}>
          Save rate
        </button>
      </footer>
    </form>
  );
}
