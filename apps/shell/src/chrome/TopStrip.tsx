import { useEffect, useRef, useState } from 'react';
import type { ActiveUser, CurrencyCode, DisplayCurrency } from '@baseline/contracts/host';
import type { RemoteName } from '../config';
import { CURRENCIES, USERS } from '../hostContext';
import styles from './TopStrip.module.css';

interface TopStripProps {
  readonly currency: DisplayCurrency;
  readonly user: ActiveUser;
  readonly broken: ReadonlySet<RemoteName>;
  readonly onCurrency: (currency: DisplayCurrency) => void;
  readonly onUser: (user: ActiveUser) => void;
  readonly onBreak: (remote: RemoteName, broken: boolean) => void;
}

const initials = (name: string): string => name.split(' ').map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase();

const REMOTES: readonly { remote: RemoteName; label: string }[] = [
  { remote: 'people', label: 'People' },
  { remote: 'delivery', label: 'Delivery' },
];

export function TopStrip({ currency, user, broken, onCurrency, onUser, onBreak }: TopStripProps) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <header className={styles['strip']}>
      <label className={styles['currency']}>
        <span>Display</span>
        <select value={currency.code} onChange={(event) => onCurrency(CURRENCIES[event.target.value as CurrencyCode])}>
          {Object.values(CURRENCIES).map((option) => (
            <option key={option.code} value={option.code}>
              {option.code} {option.symbol}
            </option>
          ))}
        </select>
      </label>

      <div className={styles['user']} ref={menu}>
        <button type="button" className={styles['userButton']} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span className={styles['who']}>
            <span className={styles['name']}>{user.name}</span>
            <span className={styles['role']}>{user.role}</span>
          </span>
          <span className={styles['avatar']} aria-hidden="true">
            {initials(user.name)}
          </span>
        </button>

        {open && (
          <div className={styles['menu']}>
            <p className={styles['heading']}>Active user</p>
            {USERS.map((option) => (
              <button key={option.id} type="button" className={styles['item']} aria-pressed={option.id === user.id} onClick={() => onUser(option)}>
                {option.name}
              </button>
            ))}
            <hr className={styles['rule']} />
            <p className={styles['heading']}>Resilience check</p>
            {REMOTES.map(({ remote, label }) => (
              <label key={remote} className={styles['switchRow']}>
                <span>Break {label} on next load</span>
                <input type="checkbox" role="switch" checked={broken.has(remote)} onChange={(event) => onBreak(remote, event.target.checked)} />
              </label>
            ))}
            <p className={styles['hint']}>
              Reload to apply. Same switch as <code>?break=delivery</code> in the address bar.
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
