import type { HostContext } from '@baseline/contracts/host';

export function App({ host }: { readonly host: HostContext }) {
  return (
    <p style={{ padding: 32 }}>
      People · {host.user.name} · {host.currency.code}
    </p>
  );
}
