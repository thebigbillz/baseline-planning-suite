import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { HostContext, HostSlots, MountedRemote } from '@baseline/contracts/host';
import '@baseline/tokens/tokens.css';
import { App } from './App';
import { CrashBoundary } from './CrashBoundary';

/**
 * The only thing Delivery exposes. The host hands over an element, its
 * context and, optionally, a place in its sidebar; Delivery renders with its
 * own React root and tells the host nothing about how.
 */
export function mount(element: HTMLElement, context: HostContext, slots: HostSlots = {}): MountedRemote {
  const root = createRoot(element);
  const render = (next: HostContext): void =>
    root.render(
      <StrictMode>
        <CrashBoundary>
          <App host={next} sidebarSlot={slots.sidebar ?? null} />
        </CrashBoundary>
      </StrictMode>,
    );
  render(context);
  return { update: render, unmount: () => root.unmount() };
}
