/**
 * Everything the three apps agree on. Types and names only: if logic appears
 * here, two teams have started sharing source.
 */

// ---------- primitives ----------

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type EmployeeId = Brand<string, 'EmployeeId'>;
export type RateRecordId = Brand<string, 'RateRecordId'>;
/** Calendar month, `YYYY-MM`. */
export type MonthKey = Brand<string, 'MonthKey'>;
/** Calendar day, `YYYY-MM-DD`. */
export type IsoDate = Brand<string, 'IsoDate'>;

export const WEEKLY_HOURS = [40, 32, 20] as const;
export type WeeklyHours = (typeof WEEKLY_HOURS)[number];

// ---------- shell → remotes ----------

export type CurrencyCode = 'EUR' | 'USD' | 'GBP';

/** Costs are stored in EUR. The shell owns how they are read. */
export interface DisplayCurrency {
  readonly code: CurrencyCode;
  readonly symbol: string;
  /** Units of this currency per one euro. */
  readonly perEuro: number;
}

export interface ActiveUser {
  readonly id: EmployeeId;
  readonly name: string;
  readonly role: string;
}

export interface HostContext {
  readonly currency: DisplayCurrency;
  readonly user: ActiveUser;
}

export interface MountedRemote {
  /** The shell calls this whenever currency or user changes. */
  update(context: HostContext): void;
  unmount(): void;
}

/** The single module every remote exposes as `./mount`. */
export interface RemoteModule {
  mount(element: HTMLElement, context: HostContext): MountedRemote;
}

// ---------- People's published API (`/api/people`) ----------

export interface Employee {
  readonly id: EmployeeId;
  readonly name: string;
  readonly role: string;
  readonly weeklyHours: WeeklyHours;
}

/** No end date: a record runs until the next one for the same person starts. */
export interface RateRecord {
  readonly id: RateRecordId;
  readonly employeeId: EmployeeId;
  /** Inclusive: this day is already priced at `hourlyCost`. */
  readonly validFrom: IsoDate;
  /** EUR per hour. */
  readonly hourlyCost: number;
}

export type RateRecordDraft = Omit<RateRecord, 'id'>;

export interface PeopleDirectory {
  readonly employees: readonly Employee[];
  readonly rateRecords: readonly RateRecord[];
}

// ---------- Delivery's published API (`/api/delivery/load`) ----------

/** Person-months planned for one person in one month, summed over every project. */
export interface LoadEntry {
  readonly employeeId: EmployeeId;
  readonly month: MonthKey;
  readonly personMonths: number;
}

// ---------- notices between remotes ----------

export const NOTICE_CHANNEL = 'baseline.notices';

/**
 * Notices carry no data. A receiver refetches through the owner's API, so the
 * API stays the only source of truth.
 */
export type Notice =
  | { readonly type: 'rates-changed'; readonly employeeId: EmployeeId }
  | { readonly type: 'employees-changed' }
  | { readonly type: 'load-changed' };
