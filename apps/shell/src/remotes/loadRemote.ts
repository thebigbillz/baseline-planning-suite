import type { RemoteModule } from '@baseline/contracts/host';
import type { RemoteName } from '../config';

/** webpack's Module Federation runtime, as seen from application code. */
declare const __webpack_init_sharing__: (scope: string) => Promise<void>;
declare const __webpack_share_scopes__: { readonly default: unknown };

interface RemoteContainer {
  init(shareScope: unknown): Promise<void> | void;
  get(module: string): Promise<() => unknown>;
}

/** Each remote build registers its container on `window` under this name. */
const CONTAINER_NAME: Readonly<Record<RemoteName, string>> = { people: 'baseline_people', delivery: 'baseline_delivery' };

const LOAD_TIMEOUT_MS = 8000;

export class RemoteLoadError extends Error {
  readonly remote: RemoteName;
  readonly url: string;

  constructor(remote: RemoteName, url: string, reason: string) {
    super(reason);
    this.remote = remote;
    this.url = url;
  }
}

function injectScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(() => finish(new Error(`timed out after ${LOAD_TIMEOUT_MS / 1000} s`)), LOAD_TIMEOUT_MS);
    const finish = (error?: Error): void => {
      window.clearTimeout(timer);
      // A failed tag is removed so that "Try again" really fetches again.
      if (error !== undefined) script.remove();
      if (error === undefined) resolve();
      else reject(error);
    };
    script.src = url;
    script.async = true;
    script.onload = () => finish();
    script.onerror = () => finish(new Error('the entry file could not be fetched'));
    document.head.append(script);
  });
}

const isContainer = (value: unknown): value is RemoteContainer =>
  typeof value === 'object' && value !== null && typeof (value as { get?: unknown }).get === 'function';

const isRemoteModule = (value: unknown): value is RemoteModule =>
  typeof value === 'object' && value !== null && typeof (value as { mount?: unknown }).mount === 'function';

const containers = new Map<RemoteName, Promise<RemoteContainer>>();

async function containerFor(remote: RemoteName, url: string): Promise<RemoteContainer> {
  await injectScript(url);
  const container: unknown = (window as unknown as Record<string, unknown>)[CONTAINER_NAME[remote]];
  if (!isContainer(container)) throw new Error(`the entry file did not register “${CONTAINER_NAME[remote]}”`);
  // Hand the remote the host's share scope, so it uses the host's React instead of loading its own.
  await __webpack_init_sharing__('default');
  await container.init(__webpack_share_scopes__.default);
  return container;
}

/**
 * Fetches a remote's entry file from a URL known only at runtime and returns
 * the one module the contract allows: `./mount`. A failure is cached nowhere,
 * so retrying is just calling this again.
 */
export async function loadRemote(remote: RemoteName, url: string): Promise<RemoteModule> {
  try {
    let pending = containers.get(remote);
    if (pending === undefined) {
      pending = containerFor(remote, url);
      containers.set(remote, pending);
    }
    const container = await pending;
    const factory = await container.get('./mount');
    const module = factory();
    if (!isRemoteModule(module)) throw new Error('its ./mount module does not export mount()');
    return module;
  } catch (error) {
    containers.delete(remote);
    throw new RemoteLoadError(remote, url, error instanceof Error ? error.message : String(error));
  }
}
