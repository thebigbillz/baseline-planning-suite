import type { ChangeSet, Plan } from '../domain/model';
import { requestJson } from './http';

/** Delivery's own service. It returns the whole plan after every change, so the UI never guesses at server state. */
const BASE = '/api/delivery';

const asPlan = (body: unknown): Plan => body as Plan;

export const fetchPlan = async (): Promise<Plan> => asPlan(await requestJson(`${BASE}/plan`));

export const applyChanges = async (changes: ChangeSet): Promise<Plan> =>
  asPlan(await requestJson(`${BASE}/changes`, { method: 'POST', body: JSON.stringify(changes) }));
