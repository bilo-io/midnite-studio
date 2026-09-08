import type { CompanionTurn } from '@midnite/studio-shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { LuArrowDown } from 'react-icons/lu';
import remarkGfm from 'remark-gfm';

import { daySeparatorLabel, formatTurnTime, formatTurnTitle, startsNewDay } from './turn-time';
import { ExternalLink } from '../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';

/**
 * The markdown slots a chat bubble needs, and no more.
 *
 * `a: ExternalLink` is the whole reason this is a constant rather than an
 * inline object: the renderer is an SPA served from `file://` in production, so
 * a real same-window navigation *replaces the entire application* with the
 * target page. `ExternalLink` keeps a genuine `href` on the anchor (for the
 * status bar, middle-click and "Copy link") and routes activation through
 * Phase 71's `openLinkFromEvent`, which honours the `linkTarget` preference
 * and lands the page in the embedded browser.
 *
 * Hoisted out of the component because react-markdown re-parses when
 * `components` changes identity, and a fresh object per render would re-parse
 * every bubble on every scroll tick of a virtualised list.
 */
const BUBBLE_MARKDOWN_COMPONENTS = { a: ExternalLink } as const;

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
 *
 * **The Phase 79 follow-up added two things to every row**: a right-hand time
 * gutter, and a day separator where consecutive turns cross local midnight.
 * The separator is rendered *inside* the virtual row it belongs above rather
 * than as a row of its own — this list measures each rendered element, and an
 * interleaved separator would put the turn index and the item index out of
 * step, which is the one thing dynamic measurement cannot survive.
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

  /*
    One clock reading per render, shared by every visible row.

    Not per row: `daySeparatorLabel` only distinguishes days, so a thousand
    `Date.now()` calls would agree, and a single value means two rows in the
    same paint cannot straddle midnight and disagree about which of them is
    "Today". The label going stale after midnight on a window nobody has
    touched is the correct amount of wrong for a chat log.
  */
  const now = Date.now();

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
                <CompanionTurnRow turn={turn} previousAt={turns[item.index - 1]?.at} now={now} />
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

/**
 * The day this turn belongs to, drawn once above the first turn of it.
 *
 * A rule rather than a chip, because it separates rather than labels: the
 * label sits on the rule, which is the shape every chat client converged on
 * for the same reason — it has to be legible without competing with a message.
 */
function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-1 pb-1 pt-2" data-turn-day={label}>
      <span className="h-px flex-1 bg-border/70" />
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-border/70" />
    </div>
  );
}

/**
 * The turn's time, in the right-hand gutter of every row.
 *
 * A real `<time>` with a machine-readable `dateTime`, and `data-turn-at`
 * carrying the raw epoch value the e2e spec asserts on — a spec that read the
 * rendered `14:32` would be asserting the CI runner's timezone.
 *
 * `tabular-nums` so the column does not jitter between `1:05` and `11:55`, and
 * `title` rather than a tooltip component: the full instant is a browser
 * affordance here, not a control, and a hover card on every bubble in a
 * two-hundred-turn transcript is two hundred listeners for something nobody
 * hovers twice.
 */
function TurnTime({ at }: { at: number }) {
  const short = formatTurnTime(at);
  if (short === '') return null;
  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={formatTurnTitle(at)}
      data-turn-at={at}
      className="w-11 shrink-0 self-end pb-1.5 text-right text-[10px] tabular-nums leading-relaxed text-muted-foreground/70"
    >
      {short}
    </time>
  );
}

function CompanionTurnRow({
  turn,
  previousAt,
  now,
}: {
  turn: CompanionTurn;
  /** The turn above this one, or `undefined` at the top of the transcript. */
  previousAt: number | undefined;
  now: number;
}) {
  const separator = startsNewDay(turn.at, previousAt) ? daySeparatorLabel(turn.at, { now }) : null;

  /*
    An agent turn is a chunk of terminal scrollback — Theme E strips its ANSI
    and hands the whole thing over, which can be dozens of lines. Collapsed by
    default with the summary line showing, so the thread stays a conversation
    and the raw output is one disclosure away rather than the thing you have to
    scroll past to find the next sentence.

    Never markdown, either: this is program output, and a stack trace full of
    underscores and asterisks is not a document.
  */
  if (turn.role === 'agent') {
    return (
      <>
        {separator === null ? null : <DaySeparator label={separator} />}
        <div className="flex items-start gap-1.5 py-1" data-turn-role="agent">
          <details className="min-w-0 flex-1 rounded-md border border-border/70 bg-card/40 px-2 py-1.5 text-xs">
            <summary className="cursor-pointer list-none truncate text-[11px] text-muted-foreground marker:hidden">
              {firstLine(turn.text) || 'Agent output'}
            </summary>
            <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
              {turn.text}
            </pre>
          </details>
          <TurnTime at={turn.at} />
        </div>
      </>
    );
  }

  const mine = turn.role === 'user';
  return (
    <>
      {separator === null ? null : <DaySeparator label={separator} />}
      {/*
        `items-end` with a spacer, rather than `justify-end`: the time is a
        gutter on the right of every row — the same column for a companion
        bubble and for the user's own — so the spacer is what pushes a user
        bubble across to meet it, and the gutter never moves.
      */}
      <div className="flex items-end gap-1.5 py-1" data-turn-role={turn.role}>
        {mine ? <span className="min-w-0 flex-1" aria-hidden /> : null}
        <div
          className={`max-w-[85%] break-words rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
            mine
              ? 'whitespace-pre-wrap bg-primary/10 text-foreground'
              : 'border border-border/70 bg-card/60 text-foreground'
          }`}
        >
          {/*
            The companion's own turns are markdown; the user's are not.

            The follow-up's second fix renders one consolidated overview turn
            (`composeOverviewMarkdown`) with a bold repo name, bullets, inline
            code and forge links — so a companion bubble has to be parsed. A
            *user* bubble must not be: what someone typed is what they meant,
            and silently italicising their `snake_case` or eating their
            asterisks is the app editing their words.

            No `rehype-raw`, exactly as every other markdown surface in this
            app: raw HTML in a bubble stays inert text rather than being
            sanitised, which is the same posture `issue-conversation.tsx` and
            `pr-detail.tsx` take and document.
          */}
          {mine ? (
            turn.text
          ) : (
            /*
              `MARKDOWN_PROSE_CLASSES` is written for a document pane, so its
              `[&_p]:my-2` would give a one-paragraph bubble two rows of dead
              space inside its own padding. Zeroing the *outer* margins fixes
              that without fighting the shared string — a `first-child`
              selector is a different rule, not a competing one, so it wins by
              specificity rather than by class order (which Tailwind does not
              honour).
            */
            <div
              className={`max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${MARKDOWN_PROSE_CLASSES}`}
            >
              <Markdown remarkPlugins={[remarkGfm]} components={BUBBLE_MARKDOWN_COMPONENTS}>
                {turn.text}
              </Markdown>
            </div>
          )}
        </div>
        {mine ? null : <span className="min-w-0 flex-1" aria-hidden />}
        <TurnTime at={turn.at} />
      </div>
    </>
  );
}
