import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { LoadEntry } from '@baseline/contracts';
import { HttpError, isRecord, readJson, sendJson } from './http.ts';
import { JsonStore } from './store.ts';

const PORT = Number(process.env['PORT'] ?? 4002);
const DATA_FILE = process.env['DATA_FILE'] ?? './data/delivery.json';
const SEED_FILE = process.env['SEED_FILE'] ?? '../../seed/baseline-seed.json';
const BASE = '/api/delivery';

/**
 * The stored plan. Shapes mirror apps/delivery/src/domain/model.ts; this
 * service and that app belong to the same team, but the service only
 * persists: every planning rule lives in the tested domain, and arrives here
 * as a change set to apply atomically.
 */
interface Project { id: string; name: string; startDate: string; endDate: string }
interface BreakdownItem { id: string; projectId: string; parentId: string | null; name: string }
interface Allocation { id: string; breakdownItemId: string; employeeId: string; month: string; personMonths: number; updatedAt: string; updatedBy: string | null }
interface Plan { projects: Project[]; items: BreakdownItem[]; allocations: Allocation[] }

interface SeedFile {
  readonly projects: Project[];
  readonly breakdownItems: BreakdownItem[];
  readonly allocations: { id: string; breakdownItemId: string; employeeId: string; month: string; amount: number }[];
}

/** The fixture's `amount` is read as person-months: 0.50 in March 2026 is the brief's reference cell. */
function fromSeed(): Plan {
  const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as SeedFile;
  const seededAt = new Date(0).toISOString();
  return {
    projects: seed.projects,
    items: seed.breakdownItems,
    allocations: seed.allocations.map(({ amount, ...allocation }) => ({ ...allocation, personMonths: amount, updatedAt: seededAt, updatedBy: null })),
  };
}

const store = new JsonStore<Plan>(DATA_FILE, fromSeed);

// ---------- change sets ----------

const text = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value === '') throw new HttpError(422, `${field} must be a non-empty string.`);
  return value;
};

const list = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) throw new HttpError(422, `${field} must be a list.`);
  return value;
};

function parseItem(value: unknown): BreakdownItem {
  if (!isRecord(value)) throw new HttpError(422, 'Each item must be an object.');
  const parentId = value['parentId'];
  return {
    id: text(value['id'], 'item.id'),
    projectId: text(value['projectId'], 'item.projectId'),
    parentId: parentId === null ? null : text(parentId, 'item.parentId'),
    name: text(value['name'], 'item.name'),
  };
}

function parseAllocation(value: unknown, stamp: string): Allocation {
  if (!isRecord(value)) throw new HttpError(422, 'Each allocation must be an object.');
  const personMonths = value['personMonths'];
  if (typeof personMonths !== 'number' || !Number.isFinite(personMonths) || personMonths < 0) {
    throw new HttpError(422, 'allocation.personMonths must be a number, zero or more.');
  }
  const month = text(value['month'], 'allocation.month');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(422, 'allocation.month must be YYYY-MM.');
  return {
    id: text(value['id'], 'allocation.id'),
    breakdownItemId: text(value['breakdownItemId'], 'allocation.breakdownItemId'),
    employeeId: text(value['employeeId'], 'allocation.employeeId'),
    month,
    personMonths,
    updatedAt: stamp,
    updatedBy: typeof value['updatedBy'] === 'string' ? value['updatedBy'] : null,
  };
}

/** All or nothing: the plan is only written if every part of the change set is well formed. */
function apply(plan: Plan, body: unknown): Plan {
  if (!isRecord(body)) throw new HttpError(400, 'Send a change set object.');
  const stamp = new Date().toISOString();
  const upsertItems = list(body['upsertItems'], 'upsertItems').map(parseItem);
  const deleteItemIds = new Set(list(body['deleteItemIds'], 'deleteItemIds').map((id) => text(id, 'deleteItemIds[]')));
  const upsertAllocations = list(body['upsertAllocations'], 'upsertAllocations').map((entry) => parseAllocation(entry, stamp));
  const deleteAllocationIds = new Set(list(body['deleteAllocationIds'], 'deleteAllocationIds').map((id) => text(id, 'deleteAllocationIds[]')));

  const upsertedItemIds = new Set(upsertItems.map((item) => item.id));
  const items = [...plan.items.filter((item) => !upsertedItemIds.has(item.id) && !deleteItemIds.has(item.id)), ...upsertItems];

  const itemIds = new Set(items.map((item) => item.id));
  for (const allocation of upsertAllocations) {
    if (!itemIds.has(allocation.breakdownItemId)) throw new HttpError(422, `Allocation ${allocation.id} points at a work item that does not exist.`);
  }

  // One allocation per person, work item and month: a write replaces whatever held that slot.
  const slot = (allocation: Allocation): string => `${allocation.breakdownItemId}|${allocation.employeeId}|${allocation.month}`;
  const upsertedIds = new Set(upsertAllocations.map((allocation) => allocation.id));
  const upsertedSlots = new Set(upsertAllocations.map(slot));
  const kept = plan.allocations.filter(
    (allocation) =>
      !upsertedIds.has(allocation.id) &&
      !upsertedSlots.has(slot(allocation)) &&
      !deleteAllocationIds.has(allocation.id) &&
      itemIds.has(allocation.breakdownItemId),
  );

  return { projects: plan.projects, items, allocations: [...kept, ...upsertAllocations] };
}

/** Published for People: load per person per month across every project. People never sees an allocation. */
function loadOf(plan: Plan): LoadEntry[] {
  const totals = new Map<string, LoadEntry>();
  for (const allocation of plan.allocations) {
    const key = `${allocation.employeeId}|${allocation.month}`;
    const current = totals.get(key);
    totals.set(key, {
      employeeId: allocation.employeeId as LoadEntry['employeeId'],
      month: allocation.month as LoadEntry['month'],
      personMonths: (current?.personMonths ?? 0) + allocation.personMonths,
    });
  }
  return [...totals.values()].filter((entry) => entry.personMonths > 0);
}

// ---------- routes ----------

async function route(method: string, path: string, body: () => Promise<unknown>): Promise<{ status: number; body: unknown }> {
  if (method === 'GET' && path === '/health') return { status: 200, body: { ok: true } };
  if (method === 'GET' && path === `${BASE}/plan`) return { status: 200, body: store.read() };
  if (method === 'GET' && path === `${BASE}/load`) return { status: 200, body: loadOf(store.read()) };
  if (method === 'POST' && path === `${BASE}/changes`) return { status: 200, body: store.write(apply(store.read(), await body())) };
  if (method === 'POST' && path === `${BASE}/reset`) return { status: 200, body: store.reset() };
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
        sendJson(response, 500, { message: 'Delivery’s service failed unexpectedly.' });
      }
    });
}).listen(PORT, () => console.log(`delivery-api listening on ${PORT}, data in ${DATA_FILE}`));
