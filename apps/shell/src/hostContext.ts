import type { EmployeeId } from '@baseline/contracts';
import type { ActiveUser, CurrencyCode, DisplayCurrency } from '@baseline/contracts/host';

/**
 * The two things the shell owns besides navigation. Costs are stored in EUR;
 * these fixed demonstration rates only change how they are read.
 */
export const CURRENCIES: Readonly<Record<CurrencyCode, DisplayCurrency>> = {
  EUR: { code: 'EUR', symbol: '€', perEuro: 1 },
  USD: { code: 'USD', symbol: '$', perEuro: 1.08 },
  GBP: { code: 'GBP', symbol: '£', perEuro: 0.85 },
};

/** Auth is out of scope, so the active user is picked from a short list. */
export const USERS: readonly ActiveUser[] = [
  { id: 'emp-054' as EmployeeId, name: 'Marta Zielinska', role: 'Delivery Manager' },
  { id: 'emp-013' as EmployeeId, name: 'Lukas Fischer', role: 'Delivery Manager' },
  { id: 'emp-060' as EmployeeId, name: 'Sara Lindholm', role: 'Delivery Manager' },
];

const STORAGE_KEY = 'baseline.shell.context';

interface Remembered {
  readonly currency: CurrencyCode;
  readonly userId: string;
}

export function remembered(): { currency: DisplayCurrency; user: ActiveUser } {
  const fallback = { currency: CURRENCIES.EUR, user: USERS[0] as ActiveUser };
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Remembered> | null;
    return {
      currency: (stored?.currency !== undefined ? CURRENCIES[stored.currency] : undefined) ?? fallback.currency,
      user: USERS.find((user) => user.id === stored?.userId) ?? fallback.user,
    };
  } catch {
    return fallback;
  }
}

export function remember(currency: DisplayCurrency, user: ActiveUser): void {
  try {
    const value: Remembered = { currency: currency.code, userId: user.id };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode: the choice simply lasts for this visit.
  }
}
