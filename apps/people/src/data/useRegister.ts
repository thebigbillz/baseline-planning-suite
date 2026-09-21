import { useCallback, useEffect, useState } from 'react';
import type { EmployeeId, PeopleDirectory } from '@baseline/contracts';
import { fetchLoad, type LoadByPerson } from './deliveryLoad';
import { announce, onNotice } from './notices';
import { fetchDirectory } from './peopleApi';

export type LoadState = { readonly status: 'loading' } | { readonly status: 'ready'; readonly load: LoadByPerson } | { readonly status: 'unavailable' };

export interface Register {
  readonly directory: PeopleDirectory | null;
  readonly error: string | null;
  readonly loadState: LoadState;
  /** Run a write against People's service, then refetch and tell other remotes that rates changed. */
  mutate(employeeId: EmployeeId, write: () => Promise<unknown>): Promise<string | null>;
  retryLoad(): void;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function useRegister(): Register {
  const [directory, setDirectory] = useState<PeopleDirectory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });

  // Load belongs to Delivery. If it cannot be read, only that part of the page degrades.
  const refreshLoad = useCallback(() => {
    fetchLoad()
      .then((load) => setLoadState({ status: 'ready', load }))
      .catch(() => setLoadState({ status: 'unavailable' }));
  }, []);

  useEffect(() => {
    fetchDirectory().then(setDirectory).catch((cause: unknown) => setError(message(cause)));
    refreshLoad();
    return onNotice((notice) => {
      if (notice.type === 'load-changed') refreshLoad();
    });
  }, [refreshLoad]);

  const mutate = useCallback(async (employeeId: EmployeeId, write: () => Promise<unknown>): Promise<string | null> => {
    try {
      await write();
      setDirectory(await fetchDirectory());
      announce({ type: 'rates-changed', employeeId });
      return null;
    } catch (cause) {
      return message(cause);
    }
  }, []);

  return { directory, error, loadState, mutate, retryLoad: refreshLoad };
}
