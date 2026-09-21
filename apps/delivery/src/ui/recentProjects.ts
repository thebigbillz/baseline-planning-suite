import type { ProjectId } from '../domain/model';

/** Delivery remembers which projects this browser opened, newest first, so it can reopen the last one. */
const STORAGE_KEY = 'baseline.delivery.recent';

export function readRecent(): ProjectId[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is ProjectId => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecent(id: ProjectId): ProjectId[] {
  const next = [id, ...readRecent().filter((other) => other !== id)].slice(0, 8);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode: recents simply last for this visit.
  }
  return next;
}

/** The project is also carried in the address, so a link or a reload lands in the same place. */
export function projectFromUrl(): ProjectId | null {
  return new URLSearchParams(window.location.search).get('project') as ProjectId | null;
}

export function writeProjectToUrl(id: ProjectId | null): void {
  const url = new URL(window.location.href);
  if (id === null) url.searchParams.delete('project');
  else url.searchParams.set('project', id);
  window.history.replaceState(window.history.state, '', url);
}
