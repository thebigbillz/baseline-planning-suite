import type { HostContext } from '@baseline/contracts/host';

export function App({ host }: { readonly host: HostContext; readonly sidebarSlot: HTMLElement | null }) {
  return (
    <p style={{ padding: 32 }}>
      Delivery · {host.user.name} · {host.currency.code}
    </p>
  );
}
