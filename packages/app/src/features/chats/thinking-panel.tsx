import { useEffect, useId, useRef, useState } from 'react';

import type { ChatMessage, ChatUsage } from '@midnite/studio-shared';
import { LuBrain, LuChevronRight } from 'react-icons/lu';

import { Spinner } from '../../components/skeleton';
import { Tooltip } from '../../components/tooltip';
import { useThinkingVerb } from './thinking-verbs';

/**
 * The status row at the top of an assistant turn: what the agent is doing, how
 * long it has taken, and what it has cost.
 *
 * Left, a pill wearing the thinking ring (`.thinking-ring` in styles.css — a
 * rainbow border with an arc travelling round it while the turn is live) that
 * holds the spinner and a verb cycling through `THINKING_VERBS`. When the
 * engine streamed its reasoning, the pill is a toggle: collapsed, the ring
 * wraps only the pill; expanded, the same ring grows to wrap the whole panel —
 * this row plus the reasoning text under it. Right, the elapsed time, the
 * generated token count and a context-window ring, each shown only when the
 * engine reported it.
 *
 * The row is `h-6` at `mt-0.5` — the provider icon's own box — so the pill's
 * centre line is the icon's, in both states. The ring is painted by
 * pseudo-elements rather than a real border so that opening the panel moves
 * nothing.
 */

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** Ticks once a second while `active`, so a live elapsed time moves. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function ContextRing({ usage }: { usage: ChatUsage }) {
  const { contextTokens, contextWindow } = usage;
  if (contextTokens === undefined || contextWindow === undefined) return null;
  const fraction = Math.min(1, contextTokens / contextWindow);
  const percent = Math.round(fraction * 100);
  const r = 5;
  const circumference = 2 * Math.PI * r;
  const label = `${formatTokens(contextTokens)} of ${formatTokens(contextWindow)} context tokens used`;
  return (
    <Tooltip label={label} side="top">
      <span tabIndex={0} role="img" aria-label={label} data-testid="thinking-context" className="flex items-center gap-1 rounded outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <svg aria-hidden viewBox="0 0 14 14" className="h-3.5 w-3.5 -rotate-90">
          <circle cx="7" cy="7" r={r} fill="none" strokeWidth="2" className="stroke-muted-foreground/25" />
          <circle
            cx="7"
            cy="7"
            r={r}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            className={fraction >= 0.9 ? 'stroke-destructive' : fraction >= 0.7 ? 'stroke-amber-500' : 'stroke-primary'}
          />
        </svg>
        <span>{percent}%</span>
      </span>
    </Tooltip>
  );
}

function Metrics({ message, now }: { message: ChatMessage; now: number }) {
  const streaming = message.status === 'streaming';
  const end = message.finishedAt ?? (streaming ? now : undefined);
  const elapsed = end === undefined ? undefined : end - message.createdAt;
  const output = message.usage?.outputTokens;
  if (elapsed === undefined && output === undefined && !message.usage) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2.5 text-[11px] leading-none tabular-nums text-muted-foreground" data-testid="thinking-metrics">
      {elapsed !== undefined ? <span data-testid="thinking-elapsed">{formatElapsed(elapsed)}</span> : null}
      {output !== undefined ? <span data-testid="thinking-tokens">{formatTokens(output)} tokens</span> : null}
      {message.usage ? <ContextRing usage={message.usage} /> : null}
    </span>
  );
}

export function ThinkingPanel({ message }: { message: ChatMessage }) {
  const streaming = message.status === 'streaming';
  const thinking = message.thinking ?? '';
  const hasThinking = thinking.trim().length > 0;
  const [open, setOpen] = useState(false);
  const verb = useThinkingVerb(streaming);
  const now = useNow(streaming);
  const bodyId = useId();
  const body = useRef<HTMLDivElement>(null);

  // Follow the reasoning as it streams, the way the reply itself grows.
  useEffect(() => {
    if (open && streaming && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [open, streaming, thinking]);

  if (!streaming && !hasThinking && !message.usage) return null;

  const label = streaming
    ? `${verb}…`
    : message.status === 'cancelled'
      ? 'Stopped'
      : message.status === 'error'
        ? 'Failed'
        : hasThinking
          ? `Thought for ${formatElapsed(message.thinkingMs ?? (message.finishedAt ?? message.createdAt) - message.createdAt)}`
          : 'Done';
  const expanded = open && hasThinking;
  const mark = streaming ? (
    <Spinner size="xs" tone="inherit" />
  ) : (
    <LuBrain aria-hidden className="h-3 w-3 shrink-0" />
  );
  const pillInner = (
    <>
      {mark}
      <span data-testid="thinking-label" className="whitespace-nowrap">
        {label}
      </span>
      {hasThinking ? (
        <LuChevronRight aria-hidden className={`h-3 w-3 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      ) : null}
    </>
  );
  const pillClass = 'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs leading-none text-muted-foreground';
  const pill = hasThinking ? (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={bodyId}
      onClick={() => setOpen((v) => !v)}
      data-testid="thinking-toggle"
      className={`${pillClass} ${expanded ? '' : 'thinking-ring'} hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
      data-live={streaming}
    >
      {pillInner}
    </button>
  ) : (
    <span className={`${pillClass} thinking-ring`} data-live={streaming} data-testid="thinking-pill">
      {pillInner}
    </span>
  );

  return (
    <div
      role="group"
      aria-label="Agent status"
      data-testid="thinking-panel"
      data-expanded={expanded}
      className={`mb-1.5 mt-0.5 ${expanded ? 'thinking-ring rounded-xl' : ''}`}
      data-live={streaming}
    >
      <div className={`flex h-6 items-center gap-2 ${expanded ? 'pr-2.5' : ''}`}>
        {pill}
        <Metrics message={message} now={now} />
      </div>
      {expanded ? (
        <div
          id={bodyId}
          ref={body}
          data-testid="thinking-body"
          data-selectable
          className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words px-2.5 pb-2 pt-1 text-xs leading-relaxed text-muted-foreground"
        >
          {thinking}
        </div>
      ) : null}
    </div>
  );
}
