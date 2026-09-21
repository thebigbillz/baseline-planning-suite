import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Employee, EmployeeId, IsoDate, PeopleDirectory, RateRecord, RateRecordId, WeeklyHours } from '@baseline/contracts';
import { HttpError, isRecord, readJson, sendJson } from './http.ts';
import { JsonStore } from './store.ts';

const PORT = Number(process.env['PORT'] ?? 4001);
const DATA_FILE = process.env['DATA_FILE'] ?? './data/people.json';
const SEED_FILE = process.env['SEED_FILE'] ?? '../../seed/baseline-seed.json';
const BASE = '/api/people';

interface SeedFile {
  readonly employees: readonly { id: string; name: string; role: string; weeklyHours: number }[];
  readonly rateRecords: readonly { id: string; employeeId: string; validFrom: string; hourlyCost: number }[];
}

function fromSeed(): PeopleDirectory {
  const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as SeedFile;
  return {
    employees: seed.employees.map((employee): Employee => ({
      id: employee.id as EmployeeId,
      name: employee.name,
      role: employee.role,
      weeklyHours: employee.weeklyHours as WeeklyHours,
    })),
    rateRecords: seed.rateRecords.map((record): RateRecord => ({
      id: record.id as RateRecordId,
      employeeId: record.employeeId as EmployeeId,
      validFrom: record.validFrom as IsoDate,
      hourlyCost: record.hourlyCost,
    })),
  };
}

const store = new JsonStore<PeopleDirectory>(DATA_FILE, fromSeed);

// ---------- validation ----------

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isRealDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function parseRate(body: unknown): { validFrom: IsoDate; hourlyCost: number } {
  if (!isRecord(body)) throw new HttpError(400, 'Send an object with validFrom and hourlyCost.');
  const { validFrom, hourlyCost } = body;
  if (typeof validFrom !== 'string' || !isRealDate(validFrom)) throw new HttpError(422, 'validFrom must be a real date, YYYY-MM-DD.');
  if (typeof hourlyCost !== 'number' || !Number.isFinite(hourlyCost) || hourlyCost < 0) {
    throw new HttpError(422, 'hourlyCost must be a number of euros, zero or more.');
  }
  return { validFrom, hourlyCost };
}

/** A person cannot have two rates that start on the same day: one of them would never apply. */
function assertNoClash(records: readonly RateRecord[], employeeId: EmployeeId, validFrom: IsoDate, except?: RateRecordId): void {
  const clash = records.find((record) => record.employeeId === employeeId && record.validFrom === validFrom && record.id !== except);
  if (clash !== undefined) {
    throw new HttpError(409, `A rate already starts on ${validFrom} (€${clash.hourlyCost.toFixed(2)}). Pick another date, or edit that rate instead.`);
  }
}

// ---------- routes ----------

async function route(method: string, path: string, body: () => Promise<unknown>): Promise<{ status: number; body: unknown }> {
  const directory = store.read();

  if (method === 'GET' && path === '/health') return { status: 200, body: { ok: true } };
  if (method === 'GET' && path === `${BASE}/directory`) return { status: 200, body: directory };
  if (method === 'POST' && path === `${BASE}/reset`) return { status: 200, body: store.reset() };

  if (method === 'POST' && path === `${BASE}/rates`) {
    const payload = await body();
    const rate = parseRate(payload);
    const employeeId = isRecord(payload) ? payload['employeeId'] : undefined;
    if (typeof employeeId !== 'string' || !directory.employees.some((employee) => employee.id === employeeId)) {
      throw new HttpError(422, 'employeeId does not match anyone in the register.');
    }
    assertNoClash(directory.rateRecords, employeeId as EmployeeId, rate.validFrom);
    const created: RateRecord = { id: `rate-${randomUUID().slice(0, 8)}` as RateRecordId, employeeId: employeeId as EmployeeId, ...rate };
    store.write({ ...directory, rateRecords: [...directory.rateRecords, created] });
    return { status: 201, body: created };
  }

  const rateId = path.startsWith(`${BASE}/rates/`) ? (path.slice(`${BASE}/rates/`.length) as RateRecordId) : null;
  if (rateId !== null) {
    const existing = directory.rateRecords.find((record) => record.id === rateId);
    if (existing === undefined) throw new HttpError(404, 'That rate record no longer exists.');

    if (method === 'PUT') {
      const rate = parseRate(await body());
      assertNoClash(directory.rateRecords, existing.employeeId, rate.validFrom, rateId);
      const updated: RateRecord = { ...existing, ...rate };
      store.write({ ...directory, rateRecords: directory.rateRecords.map((record) => (record.id === rateId ? updated : record)) });
      return { status: 200, body: updated };
    }
    if (method === 'DELETE') {
      store.write({ ...directory, rateRecords: directory.rateRecords.filter((record) => record.id !== rateId) });
      return { status: 200, body: existing };
    }
  }

  throw new HttpError(404, `No route for ${method} ${path}.`);
}

createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  route(request.method ?? 'GET', path, () => readJson(request))
    .then(({ status, body }) => sendJson(response, status, body))
    .catch((error: unknown) => {
      if (error instanceof HttpError) sendJson(response, error.status, { message: error.message });
      else {
        console.error(error);
        sendJson(response, 500, { message: 'People’s service failed unexpectedly.' });
      }
    });
}).listen(PORT, () => console.log(`people-api listening on ${PORT}, data in ${DATA_FILE}`));
