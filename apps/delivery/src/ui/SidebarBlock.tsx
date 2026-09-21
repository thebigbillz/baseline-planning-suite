import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Project, ProjectId } from '../domain/model';
import type { ProjectSummary } from '../domain/summary';
import { dateLabel } from './format';
import { usePopover } from './usePopover';
import styles from './delivery.module.css';

interface SidebarBlockProps {
  /** The host's sidebar slot. Hosted, it is the shell's; standalone, the harness's. */
  readonly slot: HTMLElement;
  readonly summaries: readonly ProjectSummary[];
  readonly recentIds: readonly ProjectId[];
  readonly currentId: ProjectId | null;
  readonly workItems: number;
  readonly onOpen: (id: ProjectId) => void;
  readonly onShowAll: () => void;
}

const RECENTS_SHOWN = 5;

/**
 * Delivery's part of the sidebar: a project search, recent projects and the
 * totals. Projects are reached by search, never by a full list, so this
 * block is the same size at 4 projects or 4,000.
 */
export function SidebarBlock({ slot, summaries, recentIds, currentId, workItems, onOpen, onShowAll }: SidebarBlockProps) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = usePopover<HTMLDivElement>(() => setQuery(''));

  // "/" focuses the search from anywhere in Delivery, unless the user is typing somewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing = target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (event.key === '/' && !typing && slot.offsetParent !== null) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [slot]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle === '' ? [] : summaries.filter((summary) => summary.project.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [summaries, query]);

  const recents = recentIds.map((id) => summaries.find((summary) => summary.project.id === id)?.project).filter((project): project is Project => project !== undefined);

  const open = (id: ProjectId): void => {
    setQuery('');
    input.current?.blur();
    onOpen(id);
  };

  return createPortal(
    <div className={styles['sidebarBlock']}>
      <hr />
      <div className={styles['projectSearch']} ref={results}>
        <input
          ref={input}
          type="search"
          placeholder="Find a project"
          aria-label="Find a project"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') setHighlight((value) => Math.min(matches.length - 1, value + 1));
            else if (event.key === 'ArrowUp') setHighlight((value) => Math.max(0, value - 1));
            else if (event.key === 'Enter' && matches[highlight] !== undefined) open(matches[highlight].project.id);
            else return;
            event.preventDefault();
          }}
        />
        <kbd>/</kbd>
        {query.trim() !== '' && (
          <div className={`${styles['popover']} ${styles['searchResults']}`} role="listbox" aria-label="Matching projects">
            <p className={styles['popoverHead']}>
              <span>{matches.length === 0 ? 'No project matches' : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`}</span>
            </p>
            {matches.map((summary, index) => (
              <button key={summary.project.id} type="button" role="option" aria-selected={index === highlight} className={styles['candidate']} data-highlight={index === highlight} onClick={() => open(summary.project.id)}>
                <span className={styles['who']}>
                  <strong>{summary.project.name}</strong>
                  <small>
                    {dateLabel(summary.project.startDate)} – {dateLabel(summary.project.endDate)} · {summary.workItems} work items · {summary.people} people
                  </small>
                </span>
                {index === highlight && <kbd>Enter</kbd>}
              </button>
            ))}
            <p className={styles['popoverFoot']}>
              <span>Searching {summaries.length} projects · ↑ ↓ to move</span>
            </p>
          </div>
        )}
      </div>

      <p className={styles['sidebarHeading']}>Recent projects</p>
      {recents.length === 0 && <p className={styles['sidebarEmpty']}>Projects you open will be listed here.</p>}
      {recents.slice(0, RECENTS_SHOWN).map((project) => (
        <button key={project.id} type="button" className={styles['recent']} aria-current={project.id === currentId ? 'page' : undefined} onClick={() => open(project.id)}>
          {project.name}
        </button>
      ))}
      <button type="button" className={styles['allProjects']} onClick={onShowAll}>
        All projects
      </button>
      <p className={styles['sidebarFoot']}>
        {summaries.length} projects · {workItems} work items
      </p>
    </div>,
    slot,
  );
}
