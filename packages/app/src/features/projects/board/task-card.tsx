import { useRef, useState } from 'react';
import { LuCircleStop, LuPlay, LuSquareTerminal } from 'react-icons/lu';

import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import { useDialogs } from '../../../components/dialog-host';
import { useActiveWorktree } from '../../../services/use-status';
import { ActivityBadgeStack } from '../../activity/activity-badge';
import { useActivityGlow, type ActivityGlowSessionInput } from '../../activity/use-activity-glow';
import { closeSessionWithConfirm } from '../../terminal/close-session';
import { useTerminalStore } from '../../terminal/terminal-store';
import { CardAssignees, CardFieldChips, CardNumberRow, CardTitleRow, CONTENT_ICON } from './card-chrome';
import { CardTerminal } from './card-terminal';
import { cardGlowStateFromActivity } from './glow-state';
import { useCardPlay } from './use-card-play';
import { useCardStatus } from './use-card-status';
import { useCardVisible } from './use-card-visible';

const NO_SESSIONS: readonly ActivityGlowSessionInput[] = [];

/**
 * One card (Phase 41 Theme B): title, type glyph, `#number` where the item
 * has one, assignee avatars, and a chip per non-`Status` field with a value.
 *
 * **No "labels" row** — the phase doc names one, but `ForgeProjectItemContent`
 * carries no labels field at all (`assignees: string[]` is the whole of it);
 * this is a stale claim, corrected here rather than built against data that
 * does not exist.
 *
 * Avatars use GitHub's own `<login>.png` convention rather than a fetched
 * URL — the item content only ever carries a login string, never an avatar
 * URL, and this is the same convention `git config`-less commit avatars in
 * this app do not have the luxury of (those go through gravatar by email
 * instead, in `services/avatars.ts` — a login has no email to hash).
 */
export function TaskCard({
  item,
  fields,
  projectId,
  isOpen = false,
  statusColor,
  tabIndex = -1,
  onClick,
}: {
  item: ForgeProjectItem;
  /** Every field except `Status` — the board already reads that one as the column. */
  fields: readonly ForgeProjectField[];
  /**
   * The board this card belongs to — set only once a board is showing.
   * Absent in `CardDetail`'s own re-use of nothing (there is none today),
   * kept optional so a future caller with no board context still compiles.
   */
  projectId?: string;
  /** Whether this card's detail pane is the one currently open (Theme F). */
  isOpen?: boolean;
  /**
   * The card's own column colour (`fieldOptionColor(column.color)`, Phase 95
   * Theme C) — painted as a static ring once no live session is bound, so an
   * idle card still reads its own status at a glance instead of going bare.
   * `undefined` when the card is rendered with no board context (the drag
   * overlay) or the column carries no colour.
   */
  statusColor?: string;
  /**
   * Roving tabindex (Phase 52 Theme G): exactly one card on the board is `0`
   * at a time — the board's own single Tab stop — every other card (and the
   * `DragOverlay`'s own visual-only copy, which never passes this at all) is
   * `-1`, reachable only by the board's own arrow-key navigation.
   */
  tabIndex?: number;
  onClick?: () => void;
}) {
  const { repoId, worktreePath } = useActiveWorktree();
  const Icon = CONTENT_ICON[item.content.type];
  const href = item.content.type === 'draft' ? null : item.content.url;
  const number = item.content.type === 'draft' ? null : item.content.number;

  // No board, no session to bind to — falls out of `useCardStatus` as idle.
  const status = useCardStatus(projectId ? { projectId, itemId: item.id } : { projectId: '', itemId: '' });
  // Narrowed once, here — `status.sessionId` is read twice below (the button's
  // existence and its click), and a property read cannot narrow across a JSX
  // callback boundary.
  const sessionId = status.sessionId;

  // `useActivityGlow` (Phase 95 Theme C) is the one place "who is doing what
  // to this card" gets decided — replacing this card's own ad hoc
  // running/waiting read of the terminal store. A card carries at most one
  // bound session today, so this is a one-element list; `NO_SESSIONS` keeps
  // that array reference stable when there is none, so the hook (which does
  // no memoising of its own) never sees a "new" input on every render.
  const activityGlow = useActivityGlow(
    projectId && sessionId !== undefined
      ? {
          sessions: [
            {
              sessionId,
              agentId: status.liveAgentId,
              activity: status.activity,
              running: status.running,
            },
          ],
          fallbackColor: statusColor,
        }
      : { sessions: NO_SESSIONS, fallbackColor: projectId ? statusColor : undefined },
  );
  // "Open" only means something once there is a session to point the ring
  // at — an item pane opened with no agent ever launched on it is plain
  // browsing, not a terminal left open.
  const glow = projectId ? cardGlowStateFromActivity(activityGlow.status, isOpen && sessionId !== undefined) : 'idle';

  // Theme E: the card's own viewport-mount signal — a running card mounts
  // its xterm only while scrolled into view, and shows the last activity
  // line (free, from the store, regardless of mount state) otherwise.
  const cardRef = useRef<HTMLDivElement>(null);
  const visible = useCardVisible(cardRef);

  const { onPlay } = useCardPlay({
    item,
    repoId,
    worktreePath,
    taskRef: { projectId: projectId ?? '', itemId: item.id },
    sessionId,
  });

  /*
    Start / Stop / `>_` (Phase 95 Theme G) split the old single Play-or-
    reveal button into three: Start (unchanged `useCardPlay.onPlay`, shown
    only once there is no session to launch a second one over — the phase
    doc's own "a card already running shows Stop, never a second Start" rule,
    already established for `CardComposer`'s detail-pane copy of this same
    fork), Stop (`closeSessionWithConfirm`, the identical confirm-gated close
    the terminal list's own row uses), and `>_` — a plain, local, un-persisted
    toggle over this card's OWN embedded `CardTerminal`, defaulted `true` so
    a running card looks exactly as it did before this theme until a user
    deliberately collapses it back. `CardTerminal` already carries a "pop out
    to Terminal view" button of its own (`revealSession`), so nothing is lost
    by not also wiring `>_` to the main dock panel here — that is
    `ProjectGraphNode`'s own `>_` (Theme G), which has no embedded terminal of
    its own to toggle.
  */
  const [terminalOpen, setTerminalOpen] = useState(true);
  const session = useTerminalStore((s) => (sessionId ? s.sessions.find((row) => row.id === sessionId) : undefined));
  const dialogs = useDialogs();

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={tabIndex}
      data-card-id={item.id}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
      className={`relative flex w-full flex-col gap-1.5 rounded border border-border bg-background px-2 py-1.5 text-left text-xs hover:border-foreground/30 ${
        glow === 'idle' ? '' : `agent-run-glow is-${glow}`
      }`}
      // A static ring in the card's own status-pill colour, once idle with
      // nothing else to show — never applied while a real glow class is
      // active above, so it can never fight the ramp/amber ring for the
      // same border. Inline because the colour is board data, not a
      // Tailwind class this stylesheet has ever seen (`CardFieldChips`'
      // own chips make the identical trade).
      style={glow === 'idle' && activityGlow.ringColor ? { borderColor: activityGlow.ringColor } : undefined}
    >
      {activityGlow.badges.length > 0 ? (
        <ActivityBadgeStack badges={activityGlow.badges} className="absolute -right-1 -top-1 z-10" />
      ) : null}
      <div className="relative flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex min-w-0 flex-1 items-start gap-1.5">
            <CardTitleRow icon={Icon} title={item.content.title} />
          </div>
          {item.content.assignees.length > 0 ? (
            <div className="-mt-0.5 shrink-0">
              <CardAssignees assignees={item.content.assignees} />
            </div>
          ) : null}
        </div>

        {number !== null ? (
          <div className="flex items-center justify-between gap-2 pr-6">
            <CardNumberRow number={number} href={href} />
          </div>
        ) : null}

        <div className="pr-6">
          <CardFieldChips item={item} fields={fields} />
        </div>

        <div className="absolute bottom-0 right-0 flex items-center gap-0.5">
          {sessionId !== undefined ? (
            <>
              <button
                type="button"
                data-testid="card-terminal-toggle"
                aria-label={terminalOpen ? 'Hide terminal' : 'Show terminal'}
                title={terminalOpen ? 'Hide terminal' : 'Show terminal'}
                aria-pressed={terminalOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  setTerminalOpen((open) => !open);
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LuSquareTerminal aria-hidden className="h-3 w-3" />
              </button>
              <button
                type="button"
                data-testid="card-stop-agent"
                aria-label="Stop agent"
                title="Stop agent"
                onClick={(event) => {
                  event.stopPropagation();
                  if (session) closeSessionWithConfirm(dialogs, session);
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LuCircleStop aria-hidden className="h-3 w-3" />
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="card-play-agent"
              aria-label="Start agent"
              title="Start agent"
              onClick={onPlay}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LuPlay aria-hidden className="h-3 w-3 fill-current" />
            </button>
          )}
        </div>
      </div>

      {/*
        Theme E: only ever rendered once a session is actually running — a
        card with no session, or one that has ended, shows neither the
        terminal nor the activity line (`EndedStrip` inside the card's own
        detail pane already covers "ended", per Theme F/H).

        `CardTerminal` owns its own click-guard now (Phase 84 Theme E.5):
        `stopPropagation` only ever wraps the real xterm and its pop-out
        button, never the activity-line fallback it shows while off-screen or
        past its own mount policy's grace period — a plain status pill has
        nothing of its own to click, so a click on it is still "open the
        card". `visible` alone no longer decides whether `CardTerminal` even
        renders: it consults `session-mount-policy.ts` to keep a recently-
        hidden session's xterm alive a little past that, exactly like the
        docked panel's own sessions.
      */}
      {sessionId !== undefined && status.running && terminalOpen ? (
        <CardTerminal sessionId={sessionId} visible={visible} activity={status.activity} />
      ) : null}
    </div>
  );
}
