import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PeopleLookup } from '../domain/grid';
import { LoadIndex } from '../domain/capacity';
import type { ChangeSet, Plan } from '../domain/model';
import { applyChanges, fetchPlan } from './deliveryApi';
import { announce, onNotice } from './notices';
import { NOBODY, fetchPeople, lookupFrom } from './peopleDirectory';

export type SaveState = { readonly status: 'saved' } | { readonly status: 'saving' } | { readonly status: 'failed'; readonly message: string };

export type PeopleState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly refreshedAt: number; readonly byNotice: boolean }
  | { readonly status: 'unavailable'; readonly message: string };

export interface Planning {
  readonly plan: Plan | null;
  readonly planError: string | null;
  readonly people: PeopleLookup & { readonly employees: ReturnType<typeof lookupFrom>['employees'] };
  readonly peopleState: PeopleState;
  readonly load: LoadIndex;
  readonly save: SaveState;
  apply(changes: ChangeSet): Promise<boolean>;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Everything the Delivery UI reads: its own plan, People's published directory, and the load derived from the plan. */
export function usePlanning(): Planning {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [people, setPeople] = useState(NOBODY);
  const [peopleState, setPeopleState] = useState<PeopleState>({ status: 'loading' });
  const [save, setSave] = useState<SaveState>({ status: 'saved' });

  const refreshPeople = useCallback((byNotice: boolean) => {
    fetchPeople()
      .then((directory) => {
        setPeople(lookupFrom(directory));
        setPeopleState({ status: 'ready', refreshedAt: Date.now(), byNotice });
      })
      .catch((error: unknown) => setPeopleState({ status: 'unavailable', message: message(error) }));
  }, []);

  useEffect(() => {
    fetchPlan().then(setPlan).catch((error: unknown) => setPlanError(message(error)));
    refreshPeople(false);
    // A rate saved in People reaches this open view here, with no reload.
    return onNotice((notice) => {
      if (notice.type === 'rates-changed' || notice.type === 'employees-changed') refreshPeople(true);
      if (notice.type === 'load-changed') fetchPlan().then(setPlan).catch(() => undefined);
    });
  }, [refreshPeople]);

  const apply = useCallback(async (changes: ChangeSet): Promise<boolean> => {
    setSave({ status: 'saving' });
    try {
      setPlan(await applyChanges(changes));
      setSave({ status: 'saved' });
      announce({ type: 'load-changed' });
      return true;
    } catch (error) {
      setSave({ status: 'failed', message: message(error) });
      return false;
    }
  }, []);

  const load = useMemo(() => new LoadIndex(plan?.allocations ?? []), [plan]);

  return { plan, planError, people, peopleState, load, save, apply };
}
