import type { DisplayCurrency } from '@baseline/contracts/host';
import type { ProjectId } from '../domain/model';
import type { ProjectSummary } from '../domain/summary';
import { dateLabel, fixed } from './format';
import styles from './delivery.module.css';

interface ProjectsPageProps {
  readonly summaries: readonly ProjectSummary[];
  readonly currency: DisplayCurrency;
  readonly onOpen: (id: ProjectId) => void;
}

/** Where Delivery lands when there is no last project to reopen: a list to act on, never a blank "search for something". */
export function ProjectsPage({ summaries, currency, onOpen }: ProjectsPageProps) {
  return (
    <div className={styles['page']}>
      <header className={styles['pageHead']}>
        <div>
          <h1>Projects</h1>
          <p>Pick a project to plan. Next time, Delivery reopens the one you had open last.</p>
        </div>
      </header>
      <div className={styles['projectList']} role="table" aria-label="Projects">
        <div className={styles['projectHead']} role="row">
          <span role="columnheader">Project</span>
          <span role="columnheader">Work items</span>
          <span role="columnheader">People</span>
          <span role="columnheader">Flags</span>
          <span role="columnheader">Person-months</span>
          <span role="columnheader">Planned cost, {currency.code}</span>
        </div>
        {summaries.map((summary) => (
          <button key={summary.project.id} type="button" className={styles['projectRow']} role="row" onClick={() => onOpen(summary.project.id)}>
            <span role="cell" className={styles['who']}>
              <strong>{summary.project.name}</strong>
              <small>
                {dateLabel(summary.project.startDate)} – {dateLabel(summary.project.endDate)}
              </small>
            </span>
            <code role="cell">{summary.workItems}</code>
            <code role="cell">{summary.people}</code>
            <span role="cell">{summary.overCapacity > 0 ? <span className={styles['flagChip']}>{summary.overCapacity} over capacity</span> : <small>none</small>}</span>
            <code role="cell">{fixed(summary.personMonths, 2)}</code>
            <code role="cell">{fixed(summary.cost * currency.perEuro, 2)}</code>
          </button>
        ))}
      </div>
      <p className={styles['hint']}>
        Showing {summaries.length} of {summaries.length} · press <kbd>/</kbd> to search by name from anywhere in Delivery
      </p>
    </div>
  );
}
