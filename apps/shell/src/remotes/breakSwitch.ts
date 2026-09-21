import type { RemoteName } from '../config';

/**
 * How to break a remote on purpose. Either open the shell with
 * `?break=delivery` (or `people`), or flip the switch in the user menu, which
 * is remembered for the next load. A broken remote is asked for at an address
 * that does not exist, so the shell goes through its real failure path.
 */
const STORAGE_KEY = 'baseline.shell.break';

const isRemoteName = (value: string | null): value is RemoteName => value === 'people' || value === 'delivery';

function fromStorage(): RemoteName[] {
  try {
    return (window.localStorage.getItem(STORAGE_KEY) ?? '').split(',').filter(isRemoteName);
  } catch {
    return [];
  }
}

export function brokenRemotes(): ReadonlySet<RemoteName> {
  const fromUrl = new URLSearchParams(window.location.search).getAll('break').flatMap((value) => value.split(',')).filter(isRemoteName);
  return new Set([...fromUrl, ...fromStorage()]);
}

export function setBroken(remote: RemoteName, broken: boolean): void {
  const next = new Set(fromStorage());
  if (broken) next.add(remote);
  else next.delete(remote);
  try {
    window.localStorage.setItem(STORAGE_KEY, [...next].join(','));
  } catch {
    // Private mode: the URL switch still works.
  }
}

export function sabotage(url: string): string {
  return `${url}.deliberately-broken`;
}
