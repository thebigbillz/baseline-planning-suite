import type { Employee, MonthKey } from '@baseline/contracts';
import type { DisplayCurrency } from '@baseline/contracts/host';
import { nextMonth } from '../domain/calendar';
import { FULL_CAPACITY, causeOf, type PersonMonthLoad } from '../domain/capacity';
import type { Allocation, Plan } from '../domain/model';
import type { PricedAllocation } from '../domain/pricing';
import { DECIMALS, fromPersonMonths, personMonthHours, type CellContext, type Unit } from '../domain/units';
import { dayOfMonth, fixed, monthName } from './format';
import styles from './delivery.module.css';

export interface Preview {
  readonly typed: number;
  readonly personMonths: number;
}

interface InspectorProps {
  readonly plan: Plan;
  readonly employee: Employee;
  readonly month: MonthKey;
  readonly allocation: Allocation | null;
  readonly priced: PricedAllocation;
  readonly cell: CellContext;
  readonly load: PersonMonthLoad | undefined;
  readonly nextLoad: number;
  readonly nextMonthInProject: boolean;
  readonly unit: Unit;
  readonly currency: DisplayCurrency;
  readonly preview: Preview | null;
  readonly onSetCell: (month: MonthKey, personMonths: number) => void;
  readonly onMove: (from: MonthKey, to: MonthKey, keep: number, moved: number) => void;
}

const pathOf = (plan: Plan, allocation: Allocation): { project: string; path: string } => {
  const names: string[] = [];
  let item = plan.items.find((candidate) => candidate.id === allocation.breakdownItemId);
  const projectId = item?.projectId;
  while (item !== undefined) {
    names.unshift(item.name);
    const parentId = item.parentId;
    item = parentId === null ? undefined : plan.items.find((candidate) => candidate.id === parentId);
  }
  return { project: plan.projects.find((project) => project.id === projectId)?.name ?? 'Unknown project', path: names.join(' › ') };
};

/**
 * Docked under the grid: the selected cell explains itself. How it is priced
 * (R1), what a typed value will become (R2), and, when the person is over
 * capacity, every contribution across projects and what caused it (R5).
 */
export function Inspector(props: InspectorProps) {
  const { employee, month, priced, cell, currency, preview, load } = props;
  const money = (eur: number): string => `${currency.symbol}${fixed(eur * currency.perEuro, 2)}`;
  const personMonths = props.allocation?.personMonths ?? 0;
  const over = load !== undefined && load.personMonths > FULL_CAPACITY + 1e-9 && personMonths > 0;
  const overBy = over ? load.personMonths - FULL_CAPACITY : 0;
  const cause = load === undefined ? undefined : causeOf(load);

  return (
    <section className={styles['inspector']} aria-live="polite" aria-label="Selected cell">
      <header className={styles['inspectorHead']}>
        <h2>
          {employee.name} <span className={styles['slash']}>/</span> {monthName(month)}
        </h2>
        <span className={styles['eyebrow']}>{preview !== null ? 'Editing · not saved yet' : 'How this cell is priced'}</span>
      </header>

      {preview !== null && <EditPreview {...props} preview={preview} money={money} />}

      {over && load !== undefined && (
        <div className={styles['capacity']}>
          <div className={styles['capacityMain']}>
            <p className={styles['badge']}>
              {fixed(load.personMonths * 100, 1)}% · over by {fixed(overBy, 2)} PM
            </p>
            {load.contributions.map((contribution) => {
              const place = pathOf(props.plan, contribution);
              const isCause = cause?.id === contribution.id;
              return (
                <div key={contribution.id} className={styles['contribution']}>
                  <div className={styles['where']}>
                    <strong>{place.project}</strong>
                    <span>
                      {place.path}
                      {contribution.id === props.allocation?.id ? ' · this cell' : ''}
                      {isCause ? ` · latest edit${contribution.updatedBy === null ? '' : ` by ${contribution.updatedBy}`}, caused the overload` : ''}
                    </span>
                  </div>
                  <div className={styles['bar']}>
                    <span style={{ width: `${Math.min(100, contribution.personMonths * 100)}%` }} data-cause={isCause} />
                  </div>
                  <span className={styles['figure']}>{fixed(contribution.personMonths, 2)} PM</span>
                </div>
              );
            })}
            <p className={styles['capacityFoot']}>
              Across every project, open or not · capacity 1.00 PM = {fixed(personMonthHours(employee.weeklyHours, month), 2)} h ({employee.weeklyHours} h/week)
            </p>
          </div>
          <div className={styles['fixes']}>
            <p className={styles['eyebrow']}>Saved and flagged · resolve if you want to</p>
            {personMonths - overBy >= 0 && (
              <Fix title={`Reduce this cell to ${fixed(personMonths - overBy, 2)} PM`} detail={`Brings ${employee.name.split(' ')[0] ?? employee.name} to exactly 100% in ${monthName(month)}.`} onApply={() => props.onSetCell(month, personMonths - overBy)} />
            )}
            {props.nextMonthInProject && props.nextLoad + overBy <= FULL_CAPACITY + 1e-9 && personMonths - overBy >= 0 && (
              <Fix
                title={`Move ${fixed(overBy, 2)} PM to ${monthName(nextMonth(month))}`}
                detail={`That month is at ${fixed(props.nextLoad, 2)} PM, so the shift fits.`}
                onApply={() => props.onMove(month, nextMonth(month), personMonths - overBy, overBy)}
              />
            )}
            <p className={styles['keep']}>Or keep it: the flag stays on Delivery and People until the plan changes.</p>
          </div>
        </div>
      )}

      <div className={styles['stats']}>
        <Stat value={fixed(personMonths, DECIMALS.personMonths)} label="person-months · stored" />
        <Stat value={fixed(priced.hours, DECIMALS.hours)} label="hours" />
        <Stat value={`${fixed(fromPersonMonths('percent', personMonths, cell), DECIMALS.percent)}%`} label="of capacity" />
        <Stat value={money(priced.cost)} label="allocation cost" accent />
      </div>

      <div className={styles['days']} aria-hidden="true">
        {priced.slices.flatMap((slice, sliceIndex) =>
          Array.from({ length: slice.workingDays }, (_, day) => <span key={`${sliceIndex}-${day}`} data-slice={slice.hourlyCost === null ? 'none' : sliceIndex % 2} />),
        )}
      </div>
      <div className={styles['slices']}>
        {priced.slices.map((slice) => (
          <div key={slice.from} className={styles['slice']}>
            <span>
              {dayOfMonth(slice.from)}–{dayOfMonth(slice.to)} {monthName(month).split(' ')[0]?.slice(0, 3)} · {slice.workingDays} working days
            </span>
            <code>
              {slice.hourlyCost === null
                ? `${fixed(slice.hours, 2)} h · before the first rate, costs nothing`
                : `${fixed(slice.hours, 2)} h × ${money(slice.hourlyCost)} = ${money(slice.cost)}`}
            </code>
          </div>
        ))}
      </div>
      <p className={styles['inspectorFoot']}>
        {priced.slices.reduce((days, slice) => days + slice.workingDays, 0)} working days · {fixed(priced.hoursPerWorkingDay, 2)} h/day ·{' '}
        {priced.blendedRate === null ? 'No rate applies in this month' : `Blended rate ${currency.symbol}${fixed(priced.blendedRate * currency.perEuro, 4)}/h`} · rates read
        from People
      </p>
    </section>
  );
}

function Stat({ value, label, accent = false }: { readonly value: string; readonly label: string; readonly accent?: boolean }) {
  return (
    <div className={styles['stat']}>
      <span data-accent={accent}>{value}</span>
      <small>{label}</small>
    </div>
  );
}

function Fix({ title, detail, onApply }: { readonly title: string; readonly detail: string; readonly onApply: () => void }) {
  return (
    <div className={styles['fix']}>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <button type="button" onClick={onApply}>
        Apply
      </button>
    </div>
  );
}

function EditPreview({ preview, unit, cell, employee, month, allocation, currency, money }: InspectorProps & { readonly preview: Preview; readonly money: (eur: number) => string }) {
  const monthHours = personMonthHours(employee.weeklyHours, month);
  const before = allocation?.personMonths ?? 0;
  const costOf = (personMonths: number): string => money(fromPersonMonths('cost', personMonths, cell));
  const steps: [string, string][] =
    unit === 'cost'
      ? [
          ['You typed', `${currency.symbol}${fixed(preview.typed, 2)}`],
          [`Divide by this month’s blended rate, ${currency.symbol}${fixed((cell.blendedRate ?? 0) * currency.perEuro, 4)}/h`, `${fixed(preview.personMonths * monthHours, 2)} h`],
          [`Divide by one person-month, ${fixed(monthHours, 2)} h`, `${fixed(preview.personMonths, 2)} PM`],
        ]
      : unit === 'hours'
        ? [
            ['You typed', `${fixed(preview.typed, 2)} h`],
            [`Divide by one person-month, ${fixed(monthHours, 2)} h`, `${fixed(preview.personMonths, 2)} PM`],
          ]
        : unit === 'percent'
          ? [
              ['You typed', `${fixed(preview.typed, 1)}%`],
              ['100% is one person-month', `${fixed(preview.personMonths, 2)} PM`],
            ]
          : [['You typed', `${fixed(preview.typed, 2)} PM`]];
  return (
    <div className={styles['preview']}>
      <ol>
        {steps.map(([label, value], index) => (
          <li key={label}>
            <span className={styles['stepNumber']}>{index + 1}</span>
            <span>{label}</span>
            <code>{value}</code>
          </li>
        ))}
      </ol>
      <div className={styles['becomes']}>
        <div>
          <small>Was</small>
          <code>
            {fixed(before, 2)} PM · {costOf(before)}
          </code>
        </div>
        <div>
          <small>Becomes</small>
          <code>
            {fixed(preview.personMonths, 2)} PM · {costOf(preview.personMonths)}
          </code>
        </div>
        <p>Person-months is what gets stored, at full precision. Enter saves · Esc keeps the old value · Tab saves and moves right.</p>
      </div>
    </div>
  );
}
