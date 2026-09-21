export type RemoteName = 'people' | 'delivery';

export interface RuntimeConfig {
  readonly remotes: Readonly<Record<RemoteName, string>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Remote URLs come from the container, not the bundle: the shell's container
 * writes /config.json from its environment when it starts.
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`/config.json answered ${response.status}`);
  const body: unknown = await response.json();
  const remotes = isRecord(body) ? body['remotes'] : undefined;
  if (!isRecord(remotes) || typeof remotes['people'] !== 'string' || typeof remotes['delivery'] !== 'string') {
    throw new Error('/config.json must look like { "remotes": { "people": url, "delivery": url } }');
  }
  return { remotes: { people: remotes['people'], delivery: remotes['delivery'] } };
}
