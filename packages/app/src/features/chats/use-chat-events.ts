import { useEffect } from 'react';

import type { ChatEvent } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { useChatsStore } from './chats-store';

/**
 * Subscribe the Chats store to main's event stream, for as long as the page is
 * mounted.
 *
 * Events are buffered and applied once per frame: a fast model emits dozens of
 * deltas a second, and each one re-rendering the thread (markdown, highlighting)
 * would spend the frame budget on text nobody could read that fast. Runs of
 * deltas for one message are coalesced by the store, so batching loses nothing.
 */
export function useChatEvents(): void {
  useEffect(() => {
    void useChatsStore.getState().refreshList();
    const api = bridge();
    if (!api) return undefined;

    let buffer: ChatEvent[] = [];
    let handle: number | ReturnType<typeof setTimeout> | null = null;
    const hasRaf = typeof requestAnimationFrame === 'function';

    const flush = () => {
      handle = null;
      const batch = buffer;
      buffer = [];
      useChatsStore.getState().applyEvents(batch);
    };

    const off = api.chats.onEvent((event) => {
      buffer.push(event);
      if (handle === null) handle = hasRaf ? requestAnimationFrame(flush) : setTimeout(flush, 16);
    });

    return () => {
      off();
      if (handle !== null) {
        if (hasRaf) cancelAnimationFrame(handle as number);
        else clearTimeout(handle as ReturnType<typeof setTimeout>);
      }
      // Whatever arrived since the last frame still belongs to the store.
      if (buffer.length > 0) useChatsStore.getState().applyEvents(buffer);
      buffer = [];
    };
  }, []);
}
