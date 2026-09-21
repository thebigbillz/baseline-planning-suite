/**
 * The contract between the shell and a remote. Kept apart from the data
 * contracts because it mentions the DOM, which the services never load.
 */
import type { EmployeeId } from './index';

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

/**
 * Places in the host's chrome that a remote may fill. The host owns the
 * element; the remote owns what it renders there.
 */
export interface HostSlots {
  /** Below the navigation in the sidebar. Delivery puts its project search and recents here. */
  readonly sidebar?: HTMLElement;
}

/** The single module every remote exposes as `./mount`. */
export interface RemoteModule {
  mount(element: HTMLElement, context: HostContext, slots?: HostSlots): MountedRemote;
}
