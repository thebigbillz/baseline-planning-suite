import type { RemoteName } from '../config';
import styles from './Sidebar.module.css';

export type Health = 'unknown' | 'healthy' | 'down';

interface SidebarProps {
  readonly active: RemoteName;
  readonly health: Readonly<Record<RemoteName, Health>>;
  readonly onNavigate: (remote: RemoteName) => void;
  /** Receives the element Delivery may fill with its project search and recents. */
  readonly deliverySlotRef: (element: HTMLDivElement | null) => void;
}

const ENTRIES: readonly { remote: RemoteName; label: string; icon: JSX.Element }[] = [
  {
    remote: 'people',
    label: 'People',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 13.5c.6-2.4 2.6-3.5 5-3.5s4.4 1.1 5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    remote: 'delivery',
    label: 'Delivery',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="2.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 6.5h12M6.5 6.5v7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

const HEALTH_LABEL: Readonly<Record<Health, string>> = { unknown: 'not loaded yet', healthy: 'running', down: 'unavailable' };

export function Sidebar({ active, health, onNavigate, deliverySlotRef }: SidebarProps) {
  return (
    <aside className={styles['sidebar']}>
      <div className={styles['brand']}>
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <rect width="26" height="26" rx="7" fill="var(--bl-accent)" />
          <path d="M7 18.5h12" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M9 14.5V11M13 14.5V7.5M17 14.5v-2" stroke="var(--bl-accent-soft)" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <span>baseline</span>
      </div>
      <nav aria-label="Applications" className={styles['nav']}>
        {ENTRIES.map(({ remote, label, icon }) => (
          <a
            key={remote}
            href={`/${remote}`}
            className={styles['link']}
            aria-current={active === remote ? 'page' : undefined}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey) return;
              event.preventDefault();
              onNavigate(remote);
            }}
          >
            {icon}
            <span className={styles['label']}>{label}</span>
            <span className={styles['dot']} data-health={health[remote]} title={`${label} is ${HEALTH_LABEL[health[remote]]}`} />
          </a>
        ))}
      </nav>
      <div ref={deliverySlotRef} className={styles['slot']} hidden={active !== 'delivery'} />
    </aside>
  );
}
