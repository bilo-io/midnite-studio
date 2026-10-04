import { memo, useEffect, useRef, useState } from 'react';

import type { ChatMessage as ChatMessageData } from '@midnite/studio-shared';
import { LuCheck, LuCopy, LuFileText, LuPencil, LuRotateCcw, LuTriangleAlert } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { useToastStore } from '../../store/toast-store';
import { MarkdownBody } from '../markdown/markdown-body';
import { ChatChangesCard } from './chat-changes-card';
import { ThinkingPanel } from './thinking-panel';
import type { ChatEngine } from './use-chat-engines';

/**
 * One message in the thread — a user bubble or an assistant turn.
 *
 * Both are `memo`ised on the message object: while a reply streams only the
 * message being written changes identity, so the rest of a long thread (and its
 * markdown + syntax highlighting) does not re-render with every chunk.
 */

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    useToastStore.getState().addToast({ message: 'Could not copy to the clipboard.', status: 'error' });
    return false;
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current !== null && clearTimeout(timer.current)), []);
  return (
    <IconButton
      icon={copied ? LuCheck : LuCopy}
      label={copied ? 'Copied' : label}
      size="sm"
      onClick={() => {
        void copyText(text).then((ok) => {
          if (!ok) return;
          setCopied(true);
          timer.current = setTimeout(() => setCopied(false), 1500);
        });
      }}
    />
  );
}

const ACTIONS = 'mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100';

export const UserMessage = memo(function UserMessage({
  message,
  canEdit,
  onEdit,
}: {
  message: ChatMessageData;
  /** Editing rewinds the thread, so it is offered only while nothing is streaming. */
  canEdit: boolean;
  onEdit: (messageId: string, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      field.current?.focus();
      field.current?.setSelectionRange(field.current.value.length, field.current.value.length);
    }
  }, [editing]);

  const save = () => {
    const text = draft.trim();
    setEditing(false);
    if (text.length > 0 && text !== message.text) onEdit(message.id, text);
  };

  return (
    <article className="group flex flex-col items-end" data-testid="chat-message-user" data-message-id={message.id} aria-label="You">
      {editing ? (
        <div className="w-full max-w-[85%] rounded-2xl border border-primary/40 bg-background p-2">
          <textarea
            ref={field}
            value={draft}
            aria-label="Edit message"
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                save();
              } else if (event.key === 'Escape') {
                event.stopPropagation();
                setEditing(false);
                setDraft(message.text);
              }
            }}
            className="block w-full resize-none bg-transparent px-1 text-sm leading-relaxed focus-visible:outline-none"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Sending an edit replaces everything after this message.</p>
          <div className="mt-1 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(message.text);
              }}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button type="button" onClick={save} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              Send
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-accent px-3.5 py-2 text-sm leading-relaxed text-foreground" data-selectable>
            {message.text}
          </div>
          {message.attachments && message.attachments.length > 0 ? (
            <ul className="mt-1 flex max-w-[85%] flex-wrap justify-end gap-1" aria-label="Attached files">
              {message.attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  <LuFileText aria-hidden className="h-3 w-3" />
                  <span className="max-w-[12rem] truncate">{a.name}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className={ACTIONS}>
            <CopyButton text={message.text} label="Copy message" />
            {canEdit ? <IconButton icon={LuPencil} label="Edit message" size="sm" onClick={() => setEditing(true)} /> : null}
          </div>
        </>
      )}
    </article>
  );
});

export const AssistantMessage = memo(function AssistantMessage({
  message,
  engine,
  isLast,
  canRetry,
  onRetry,
  onOpenChanges,
  onResolveAll,
  resolving,
  docked = false,
}: {
  message: ChatMessageData;
  engine: ChatEngine | undefined;
  isLast: boolean;
  canRetry: boolean;
  onRetry: (messageId: string) => void;
  onOpenChanges: (changeSetId: string) => void;
  onResolveAll: (changeSetId: string, action: 'accept' | 'reject') => void;
  resolving: boolean;
  docked?: boolean;
}) {
  const streaming = message.status === 'streaming';
  const Icon = engine?.icon;
  const label = engine?.label ?? message.engine ?? 'Assistant';
  const hasText = message.text.trim().length > 0;

  return (
    <article className="group flex gap-3" data-testid="chat-message-assistant" data-message-id={message.id} data-status={message.status} aria-label={label}>
      <span
        aria-hidden
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 ${docked ? 'invisible' : ''}`}
        {...(engine?.accent ? { style: { color: engine.accent } } : {})}
      >
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        {!docked && <ThinkingPanel message={message} />}
        {message.activity && message.activity.length > 0 ? (
          <ul className="mb-1.5 flex flex-wrap gap-1" aria-label="What the agent did" data-testid="chat-activity">
            {message.activity.slice(-8).map((line, i) => (
              <li key={`${i}-${line}`} className="max-w-full truncate rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        ) : null}

        {hasText ? (
          <div className="relative">
            <MarkdownBody content={message.text} />
            {streaming ? <span aria-hidden data-testid="chat-caret" className="ml-0.5 inline-block h-4 w-[2px] animate-caret-blink bg-foreground align-text-bottom" /> : null}
          </div>
        ) : null}

        {message.status === 'error' && message.error ? (
          <p role="alert" data-testid="chat-error" className="mt-1 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <LuTriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">{message.error}</span>
          </p>
        ) : null}
        {message.status === 'cancelled' ? (
          <p data-testid="chat-stopped" className="mt-1 text-[11px] italic text-muted-foreground">
            {message.error ?? 'Stopped.'}
          </p>
        ) : null}

        {message.changeSet ? (
          <ChatChangesCard
            changeSet={message.changeSet}
            busy={resolving}
            onOpen={() => onOpenChanges(message.changeSet!.id)}
            onResolveAll={(action) => onResolveAll(message.changeSet!.id, action)}
          />
        ) : null}

        {!streaming ? (
          <div className={ACTIONS}>
            {hasText ? <CopyButton text={message.text} label="Copy reply" /> : null}
            {isLast && canRetry ? <IconButton icon={LuRotateCcw} label="Retry" size="sm" onClick={() => onRetry(message.id)} /> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
});
