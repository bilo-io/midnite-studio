import type { CompanionTurn } from '@midnite/studio-shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LuArrowDown } from 'react-icons/lu';

/**
 * How close to the bottom still counts as "at the bottom".
 *
 * Not zero: a scroll container's `scrollTop + clientHeight` lands a fraction
 * of a pixel short of `scrollHeight` at fractional zoom levels and on a
 * trackpad's inertial stop, and a one-pixel gap must not read as "the user
 * scrolled up to read something".
 */
const AT_BOTTOM_SLOP = 24;

/** Rough height of a one-line turn — the estimate before a row has been measured. */
const ESTIMATED_TURN_HEIGHT = 56;

/**
 * The companion's chat thread (Phase 79 Theme C).
 *
 * Virtualised, with **dynamic measurement** rather than the fixed row height
 * `results-grid.tsx` uses: a turn is wrapped prose whose height depends on the
 * panel's current width, and this column is resizable, so a fixed estimate
 * would put every row at the wrong offset the moment the splitter moved.
 * `measureElement` on each rendered row is what keeps the offsets honest.
 *
 * Auto-scroll follows the newest turn **only while the user is already at the
 * bottom**. Scroll up to re-read something and a new turn arriving must not
 * yank the view away — that is the one behaviour a chat log gets wrong most
 * often. A "Jump to latest" chip appears while pinning is off, so getting back
 * is one click rather than a drag.
 */
export function CompanionThread({ turns }: { turns: readonly CompanionTurn[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /**
   * Whether new turns should pull the view down. Starts `true` — a freshly
   * opened panel shows the most recent conversation, not the top of a
   * two-hundred-turn transcript.
   */
  const [pinned, setPinned] = useState(true);

  const virtualizer = useVirtualizer({
    count: turns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_TURN_HEIGHT,
    overscan: 8,
  });

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinned(distance <= AT_BOTTOM_SLOP);
  }, []);

  const jumpToLatest = useCallback(() => {
    setPinned(true);
    if (turns.length > 0) virtualizer.scrollToIndex(turns.length - 1, { align: 'end' });
  }, [turns.length, virtualizer]);

  /*
    Pull to the bottom whenever the turn count grows and pinning is on.

    A layout effect, not a plain one: the row has already been committed by
    this point, so scrolling here happens in the same frame the turn appears
    and there is no visible jump from "new message at the fold" to "new message
    in view". `turns.length` rather than the array — a `markSpoken` on an
    existing turn replaces the array identity without adding anything to scroll
    to (`companion-store.ts`).
  */
  useLayoutEffect(() => {
    if (!pinned || turns.length === 0) return;
    virtualizer.scrollToIndex(turns.length - 1, { align: 'end' });
  }, [turns.length, pinned, virtualizer]);

  /*
    A width change re-wraps every turn, so every measured height is stale.
    `measure()` drops the cache and re-measures what is on screen — cheaper
    than remounting the list, and the only thing that keeps the scroll offset
    sane through a drag of the panel's splitter.
  */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => virtualizer.measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [virtualizer]);

  if (turns.length === 0) {
    return (
      <div
        data-testid="companion-thread"
        className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground"
      >
        Nothing said yet. Ask for a task, or just say hello.
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        data-testid="companion-thread"
        className="h-full overflow-y-auto px-3 py-2"
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const turn = turns[item.index];
            if (!turn) return null;
            return (
              <div
                key={turn.id}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <CompanionTurnRow turn={turn} />
              </div>
            );
          })}
        </div>
      </div>

      {!pinned ? (
        <button
          type="button"
          onClick={jumpToLatest}
          data-testid="companion-jump-latest"
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-popover px-2.5 py-1 text-[11px] text-muted-foreground shadow-md transition-colors hover:text-foreground"
        >
          <LuArrowDown aria-hidden className="h-3 w-3" />
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}

/** The first line of an agent turn, which is what its `<details>` summary shows. */
function firstLine(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.trim().length > 0);
  return (line ?? text).trim();
}

function CompanionTurnRow({ turn }: { turn: CompanionTurn }) {
  /*
    An agent turn is a chunk of terminal scrollback — Theme E strips its ANSI
    and hands the whole thing over, which can be dozens of lines. Collapsed by
    default with the summary line showing, so the thread stays a conversation
    and the raw output is one disclosure away rather than the thing you have to
    scroll past to find the next sentence.
  */
  if (turn.role === 'agent') {
    return (
      <div className="py-1" data-turn-role="agent">
        <details className="rounded-md border border-border/70 bg-card/40 px-2 py-1.5 text-xs">
          <summary className="cursor-pointer list-none truncate text-[11px] text-muted-foreground marker:hidden">
            {firstLine(turn.text) || 'Agent output'}
          </summary>
          <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
            {turn.text}
          </pre>
        </details>
      </div>
    );
  }

  const mine = turn.role === 'user';
  return (
    <div
      className={`flex py-1 ${mine ? 'justify-end' : 'justify-start'}`}
      data-turn-role={turn.role}
    >
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
          mine
            ? 'bg-primary/10 text-foreground'
            : 'border border-border/70 bg-card/60 text-foreground'
        }`}
      >
        {turn.text}
      </div>
    </div>
  );
}
