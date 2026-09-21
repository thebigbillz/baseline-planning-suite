import { useEffect, useRef, useState } from 'react';
import type { HostContext, MountedRemote } from '@baseline/contracts/host';
import type { RemoteName } from '../config';
import { FailurePanel } from '../chrome/FailurePanel';
import { RemoteLoadError, loadRemote } from './loadRemote';
import styles from './RemoteSlot.module.css';

type SlotState =
  | { readonly status: 'loading' }
  | { readonly status: 'mounted' }
  | { readonly status: 'failed'; readonly url: string; readonly reason: string; readonly attempt: number };

interface RemoteSlotProps {
  readonly remote: RemoteName;
  readonly label: string;
  readonly url: string;
  readonly context: HostContext;
  /** The sidebar element this remote may fill, once the sidebar has rendered it. */
  readonly sidebarSlot: HTMLElement | null;
  readonly onHealth: (remote: RemoteName, healthy: boolean) => void;
  readonly onLeave: () => void;
}

/**
 * Where a remote lives. If it cannot be loaded, or throws while mounting, the
 * failure is shown here, in place of the panel, and the rest of the shell
 * carries on. The remote renders with its own React root, so an error inside
 * it can never unmount the shell's tree.
 */
export function RemoteSlot({ remote, label, url, context, sidebarSlot, onHealth, onLeave }: RemoteSlotProps) {
  const element = useRef<HTMLDivElement>(null);
  const mounted = useRef<MountedRemote | null>(null);
  const latestContext = useRef(context);
  const [attempt, setAttempt] = useState(1);
  const [state, setState] = useState<SlotState>({ status: 'loading' });

  latestContext.current = context;

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    loadRemote(remote, url)
      .then((module) => {
        if (cancelled || element.current === null) return;
        mounted.current = module.mount(element.current, latestContext.current, sidebarSlot === null ? {} : { sidebar: sidebarSlot });
        setState({ status: 'mounted' });
        onHealth(remote, true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const reason = error instanceof RemoteLoadError || error instanceof Error ? error.message : String(error);
        setState({ status: 'failed', url, reason, attempt });
        onHealth(remote, false);
      });

    return () => {
      cancelled = true;
      mounted.current?.unmount();
      mounted.current = null;
    };
  }, [remote, url, attempt, sidebarSlot, onHealth]);

  // Currency and user are pushed in at runtime, without remounting the remote.
  useEffect(() => {
    mounted.current?.update(context);
  }, [context]);

  return (
    <div className={styles['slot']}>
      <div ref={element} className={styles['mount']} hidden={state.status === 'failed'} />
      {state.status === 'loading' && <p className={styles['loading']}>Loading {label}…</p>}
      {state.status === 'failed' && (
        <FailurePanel label={label} remote={remote} url={state.url} reason={state.reason} attempt={state.attempt} onRetry={() => setAttempt((value) => value + 1)} onLeave={onLeave} />
      )}
    </div>
  );
}
