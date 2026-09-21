import type { RemoteName } from '../config';
import styles from './FailurePanel.module.css';

interface FailurePanelProps {
  readonly label: string;
  readonly remote: RemoteName;
  readonly url: string;
  readonly reason: string;
  readonly attempt: number;
  readonly onRetry: () => void;
  readonly onLeave: () => void;
}

export function FailurePanel({ label, remote, url, reason, attempt, onRetry, onLeave }: FailurePanelProps) {
  const other = remote === 'delivery' ? 'People' : 'Delivery';
  return (
    <section className={styles['frame']} role="alert" aria-labelledby="failure-title">
      <div className={styles['card']}>
        <p className={styles['eyebrow']}>Remote unavailable · {label}</p>
        <h1 id="failure-title" className={styles['title']}>
          {label} didn’t load. Everything else is fine.
        </h1>
        <p className={styles['body']}>
          The shell couldn’t fetch {label}’s entry file, so this panel is empty. {other} is still running, your currency and user are unchanged, and
          nothing you saved is lost.
        </p>
        <div className={styles['actions']}>
          <button type="button" className={styles['primary']} onClick={onRetry}>
            Try again
          </button>
          <button type="button" className={styles['secondary']} onClick={onLeave}>
            Go to {other}
          </button>
        </div>
        <dl className={styles['details']}>
          <dt>remote</dt>
          <dd>{remote}</dd>
          <dt>entry</dt>
          <dd>{url} — from /config.json at runtime</dd>
          <dt>reason</dt>
          <dd>
            {reason} · attempt {attempt}
          </dd>
        </dl>
      </div>
    </section>
  );
}
