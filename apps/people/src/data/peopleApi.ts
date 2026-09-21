import type { EmployeeId, IsoDate, PeopleDirectory, RateRecord, RateRecordId } from '@baseline/contracts';
import { requestJson } from './http';

/** People's own service. */
const BASE = '/api/people';

export const fetchDirectory = async (): Promise<PeopleDirectory> => (await requestJson(`${BASE}/directory`)) as PeopleDirectory;

export const addRate = async (employeeId: EmployeeId, validFrom: IsoDate, hourlyCost: number): Promise<RateRecord> =>
  (await requestJson(`${BASE}/rates`, { method: 'POST', body: JSON.stringify({ employeeId, validFrom, hourlyCost }) })) as RateRecord;

export const correctRate = async (id: RateRecordId, validFrom: IsoDate, hourlyCost: number): Promise<RateRecord> =>
  (await requestJson(`${BASE}/rates/${id}`, { method: 'PUT', body: JSON.stringify({ validFrom, hourlyCost }) })) as RateRecord;

export const removeRate = async (id: RateRecordId): Promise<void> => {
  await requestJson(`${BASE}/rates/${id}`, { method: 'DELETE' });
};
