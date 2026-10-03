import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { Chat } from '@midnite/studio-shared';
import { LuArrowDown } from 'react-icons/lu';

import { AssistantMessage, UserMessage } from './chat-message';
import type { ChatEngine } from './use-chat-engines';

/**
 * The scrolling thread.
 *
 * **Stick to the bottom, but never fight the reader.** While the user is near
 * the bottom, new content (a sent message, streamed text, markdown growing as
 * it renders) keeps the view pinned there; the moment they scroll up to read,
 * it lets go and a "Jump to latest" button appears instead. A new message
 * scrolls smoothly; streamed growth scrolls instantly — a smooth scroll
 * restarted forty times a second only lags behind the text it is chasing.
 * Reduced motion turns every smooth scroll into a jump.
 *
 * `role="log"` with `aria-live="polite"` announces additions, and `aria-busy`
 * holds the announcement while a reply is mid-stream so a screen reader is not
 * read every chunk — it hears the finished message.
 */

/** Distance from the bottom, in px, within which the thread counts as "at the bottom". */
const NEAR_BOTTOM_PX = 96;

const reducedMotion = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-motion') === 'reduced';

export function scrollToBottom(el: HTMLElement, smooth: boolean): void {
  const top = el.scrollHeight;
  if (typeof el.scrollTo === 'function') el.scrollTo({ top, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  else el.scrollTop = top;
}

export function isNearBottom(el: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>, threshold = NEAR_BOTTOM_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

export function ChatThread({
  chat,
  engines,
  streaming,
  resolvingChangeSetId,
  onEdit,
  onRetry,
  onOpenChanges,
  onResolveAll,
}: {
  chat: Chat;
  engines: readonly ChatEngine[];
  streaming: boolean;
  resolvingChangeSetId: string | null;
  onEdit: (messageId: string, text: string) => void;
  onRetry: (messageId: string) => void;
  onOpenChanges: (changeSetId: string) => void;
  onResolveAll: (changeSetId: string, action: 'accept' | 'reject') => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const lastCount = useRef(0);
  const lastChatId = useRef<string | null>(null);
  const [away, setAway] = useState(false);
  /** A smooth scroll fires scroll events from far above the bottom; those must not unpin the view. */
  const ignoreScrollUntil = useRef(0);
  const follow = useCallback((el: HTMLElement, smooth: boolean) => {
    if (smooth && !reducedMotion()) ignoreScrollUntil.current = Date.now() + 700;
    scrollToBottom(el, smooth);
  }, []);

  const messages = chat.messages;
  const last = messages[messages.length - 1];

  // Follow new content while pinned; jump (not glide) when a different chat opens.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (lastChatId.current !== chat.id) {
      lastChatId.current = chat.id;
      lastCount.current = messages.length;
      stuck.current = true;
      scrollToBottom(el, false);
      setAway(false);
      return;
    }
    const grew = messages.length > lastCount.current;
    lastCount.current = messages.length;
    // A message the user just sent always takes the view to the bottom.
    if (grew && last?.role === 'user') stuck.current = true;
    if (stuck.current) follow(el, grew);
  }, [chat.id, messages.length, last?.text, last?.status, last?.activity?.length, last?.changeSet?.status, last?.role, follow]);

  // Markdown, code highlighting and images settle after the text lands and change the height.
  useLayoutEffect(() => {
    const el = scroller.current;
    const content = el?.firstElementChild;
    if (!el || !content || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (stuck.current) scrollToBottom(el, false);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [chat.id]);

  /** The reader took over: stop ignoring scroll events from a glide that may still be running. */
  const userScrolls = useCallback(() => {
    ignoreScrollUntil.current = 0;
  }, []);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    if (Date.now() < ignoreScrollUntil.current) return;
    const near = isNearBottom(el);
    stuck.current = near;
    setAway(!near);
  }, []);

  const editable = !streaming;
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const engineById = (id: string | undefined) => engines.find((e) => e.id === (id ?? chat.engine));

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        onWheel={userScrolls}
        onTouchMove={userScrolls}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={streaming}
        data-testid="chat-thread"
        className="h-full overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {messages.map((message) =>
            message.role === 'user' ? (
              <UserMessage key={message.id} message={message} canEdit={editable} onEdit={onEdit} />
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                engine={engineById(message.engine)}
                isLast={message.id === lastAssistantId}
                canRetry={!streaming}
                onRetry={onRetry}
                onOpenChanges={onOpenChanges}
                onResolveAll={onResolveAll}
                resolving={message.changeSet?.id === resolvingChangeSetId}
              />
            ),
          )}
        </div>
      </div>
      {away ? (
        <button
          type="button"
          onClick={() => {
            const el = scroller.current;
            if (el) {
              stuck.current = true;
              follow(el, true);
              setAway(false);
            }
          }}
          aria-label="Jump to latest"
          data-testid="chat-jump-latest"
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover px-3 py-1 text-xs text-muted-foreground shadow-md transition-colors hover:text-foreground"
        >
          <LuArrowDown aria-hidden className="h-3 w-3" /> Jump to latest
        </button>
      ) : null}
    </div>
  );
}
