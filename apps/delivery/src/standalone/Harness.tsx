import { useEffect, useRef, useState } from 'react';
import type { EmployeeId } from '@baseline/contracts';
import type { ActiveUser, DisplayCurrency, HostContext, MountedRemote } from '@baseline/contracts/host';
import { mount } from '../mount';

/**
 * Stands in for the shell when Delivery runs on its own. It supplies the same
 * two values the shell would push in, and goes through the same mount()
 * contract, so standalone and hosted exercise one code path.
 */
const CURRENCIES: readonly DisplayCurrency[] = [
  { code: 'EUR', symbol: '€', perEuro: 1 },
  { code: 'USD', symbol: '$', perEuro: 1.08 },
  { code: 'GBP', symbol: '£', perEuro: 0.85 },
];

const USERS: readonly ActiveUser[] = [
  { id: 'emp-054' as EmployeeId, name: 'Marta Zielinska', role: 'Delivery Manager' },
  { id: 'emp-013' as EmployeeId, name: 'Lukas Fischer', role: 'Delivery Manager' },
];

export function Harness() {
  const element = useRef<HTMLDivElement>(null);
  /** The shell offers Delivery a place in its sidebar; standalone, the harness offers the same. */
  const sidebar = useRef<HTMLDivElement>(null);
  const mounted = useRef<MountedRemote | null>(null);
  const [context, setContext] = useState<HostContext>({ currency: CURRENCIES[0] as DisplayCurrency, user: USERS[0] as ActiveUser });
  const latest = useRef(context);
  latest.current = context;

  useEffect(() => {
    if (element.current === null) return undefined;
    mounted.current = mount(element.current, latest.current, sidebar.current === null ? {} : { sidebar: sidebar.current });
    return () => {
      mounted.current?.unmount();
      mounted.current = null;
    };
  }, []);

  useEffect(() => mounted.current?.update(context), [context]);

  return (
    <div className="harness">
      <div className="harness-bar">
        <span className="harness-badge">STANDALONE</span>
        <span className="harness-name">delivery</span>
        <span className="harness-note">Running without the shell. These two values are what the shell pushes in when hosted.</span>
        <label>
          Display currency
          <select value={context.currency.code} onChange={(event) => setContext({ ...context, currency: CURRENCIES.find((option) => option.code === event.target.value) ?? context.currency })}>
            {CURRENCIES.map((option) => (
              <option key={option.code}>{option.code}</option>
            ))}
          </select>
        </label>
        <label>
          Active user
          <select value={context.user.id} onChange={(event) => setContext({ ...context, user: USERS.find((option) => option.id === event.target.value) ?? context.user })}>
            {USERS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="harness-body">
        <div className="harness-sidebar" ref={sidebar} />
        <div className="harness-main" ref={element} />
      </div>
    </div>
  );
}
