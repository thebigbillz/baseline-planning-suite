import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActiveUser, DisplayCurrency, HostContext } from '@baseline/contracts/host';
import { Sidebar, type Health } from './chrome/Sidebar';
import { TopStrip } from './chrome/TopStrip';
import type { RemoteName, RuntimeConfig } from './config';
import { remember, remembered } from './hostContext';
import { RemoteSlot } from './remotes/RemoteSlot';
import { brokenRemotes, sabotage, setBroken } from './remotes/breakSwitch';
import styles from './App.module.css';

const LABEL: Readonly<Record<RemoteName, string>> = { people: 'People', delivery: 'Delivery' };

function remoteFromPath(pathname: string): RemoteName {
  return pathname.startsWith('/people') ? 'people' : 'delivery';
}

export function App({ config }: { readonly config: RuntimeConfig }) {
  const [active, setActive] = useState<RemoteName>(() => remoteFromPath(window.location.pathname));
  /** A remote stays mounted once visited, so an open Delivery view hears about a rate edit without a reload. */
  const [visited, setVisited] = useState<ReadonlySet<RemoteName>>(() => new Set([active]));
  const [health, setHealth] = useState<Readonly<Record<RemoteName, Health>>>({ people: 'unknown', delivery: 'unknown' });
  const [deliverySlot, setDeliverySlot] = useState<HTMLDivElement | null>(null);
  const [broken, setBrokenState] = useState(brokenRemotes);
  const [{ currency, user }, setOwned] = useState(remembered);

  const context = useMemo<HostContext>(() => ({ currency, user }), [currency, user]);

  const navigate = useCallback((remote: RemoteName) => {
    const keepBreak = new URLSearchParams(window.location.search).getAll('break');
    const search = keepBreak.length > 0 ? `?break=${keepBreak.join(',')}` : '';
    window.history.pushState(null, '', `/${remote}${search}`);
    setActive(remote);
    setVisited((current) => new Set([...current, remote]));
  }, []);

  useEffect(() => {
    const onPop = (): void => {
      const remote = remoteFromPath(window.location.pathname);
      setActive(remote);
      setVisited((current) => new Set([...current, remote]));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const own = (next: { currency: DisplayCurrency; user: ActiveUser }): void => {
    remember(next.currency, next.user);
    setOwned(next);
  };

  const onHealth = useCallback((remote: RemoteName, healthy: boolean) => {
    setHealth((current) => ({ ...current, [remote]: healthy ? 'healthy' : 'down' }));
  }, []);

  /** Broken remotes were decided when the page loaded; the switch only takes effect on the next load. */
  const urls = useMemo(() => {
    const atLoad = brokenRemotes();
    const url = (remote: RemoteName): string => (atLoad.has(remote) ? sabotage(config.remotes[remote]) : config.remotes[remote]);
    return { people: url('people'), delivery: url('delivery') };
  }, [config]);

  return (
    <div className={styles['app']}>
      <Sidebar active={active} health={health} onNavigate={navigate} deliverySlotRef={setDeliverySlot} />
      <div className={styles['main']}>
        <TopStrip
          currency={currency}
          user={user}
          broken={broken}
          onCurrency={(next) => own({ currency: next, user })}
          onUser={(next) => own({ currency, user: next })}
          onBreak={(remote, value) => {
            setBroken(remote, value);
            setBrokenState(brokenRemotes());
          }}
        />
        {(['people', 'delivery'] as const).map(
          (remote) =>
            visited.has(remote) &&
            (remote === 'people' || deliverySlot !== null) && (
              <div key={remote} className={styles['panel']} hidden={active !== remote}>
                <RemoteSlot
                  remote={remote}
                  label={LABEL[remote]}
                  url={urls[remote]}
                  context={context}
                  sidebarSlot={remote === 'delivery' ? deliverySlot : null}
                  onHealth={onHealth}
                  onLeave={() => navigate(remote === 'delivery' ? 'people' : 'delivery')}
                />
              </div>
            ),
        )}
      </div>
    </div>
  );
}
