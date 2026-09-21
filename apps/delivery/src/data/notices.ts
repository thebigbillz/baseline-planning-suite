import { NOTICE_CHANNEL, type Notice } from '@baseline/contracts';

/**
 * Notices between remotes. They say that something changed, never what: the
 * receiver refetches through the owner's API. BroadcastChannel reaches other
 * remotes in this window and every other open tab.
 */
export function onNotice(handler: (notice: Notice) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const channel = new BroadcastChannel(NOTICE_CHANNEL);
  channel.onmessage = (event: MessageEvent<Notice>) => handler(event.data);
  return () => channel.close();
}

export function announce(notice: Notice): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(NOTICE_CHANNEL);
  channel.postMessage(notice);
  channel.close();
}
