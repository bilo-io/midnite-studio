import { useRef } from 'react';
import { LuPlay } from 'react-icons/lu';

import { BUILTIN_AGENTS, type ForgeProjectField, type ForgeProjectItem } from '@midnite/studio-shared';

import { useActiveWorktree } from '../../../services/use-status';
import { revealSession } from '../../terminal/reveal-session';
import { startAgent } from '../../terminal/start-agent';
import { useTerminalStore } from '../../terminal/terminal-store';
import { CardAssignees, CardFieldChips, CardNumberRow, CardTitleRow, CONTENT_ICON } from './card-chrome';
import { CardTerminal } from './card-terminal';
import { composeCardPrompt } from './board-derive';
import { deriveCardGlowState } from './glow-state';
import { useCardStatus } from './use-card-status';
import { useCardVisible } from './use-card-visible';

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
   * Roving tabindex (Phase 52 Theme G): exactly one card on the board is `0`
   * at a time — the board's own single Tab stop — every other card (and the
   * `DragOverlay`'s own visual-only copy, which never passes this at all) is
   * `-1`, reachable only by the board's own arrow-key navigation.
   */
  tabIndex?: number;
  onClick?: () => void;
}) {
  const { repoId, worktreePath } = useActiveWorktree();
  const sessions = useTerminalStore((s) => s.sessions);
  const Icon = CONTENT_ICON[item.content.type];
  const href = item.content.type === 'draft' ? null : item.content.url;
  const number = item.content.type === 'draft' ? null : item.content.number;

  // No board, no session to bind to — falls out of `useCardStatus` as idle.
  const status = useCardStatus(projectId ? { projectId, itemId: item.id } : { projectId: '', itemId: '' });
  // "Open" only means something once there is a session to point the ring
  // at — an item pane opened with no agent ever launched on it is plain
  // browsing, not a terminal left open.
  const glow = projectId
    ? deriveCardGlowState({
        running: status.running,
        waiting: status.waiting,
        isOpen: isOpen && status.sessionId !== undefined,
      })
    : 'idle';
  // Narrowed once, here — `status.sessionId` is read twice below (the button's
  // existence and its click), and a property read cannot narrow across a JSX
  // callback boundary.
  const sessionId = status.sessionId;

  // Theme E: the card's own viewport-mount signal — a running card mounts
  // its xterm only while scrolled into view, and shows the last activity
  // line (free, from the store, regardless of mount state) otherwise.
  const cardRef = useRef<HTMLDivElement>(null);
  const visible = useCardVisible(cardRef);

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
    >
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

        <button
          type="button"
          data-testid="card-play-agent"
          aria-label={sessionId !== undefined ? 'Open in terminal' : 'Start agent'}
          title={sessionId !== undefined ? 'Open in terminal' : 'Start agent'}
          onClick={(event) => {
            event.stopPropagation();
            if (sessionId !== undefined) {
              revealSession(sessionId);
              return;
            }
            const targetCwd = worktreePath ?? '';
            const prompt = composeCardPrompt(item, targetCwd);
            const mostRecent = sessions
              .filter((s) => s.repoId === repoId && s.kind === 'agent' && s.agentId !== undefined)
              .sort((a, b) => b.createdAt - a.createdAt)[0];
            const agentId = mostRecent?.agentId ?? BUILTIN_AGENTS[0]?.id ?? 'claude';
            const agent = BUILTIN_AGENTS.find((a) => a.id === agentId) ?? BUILTIN_AGENTS[0]!;

            const session = startAgent({
              repoId: repoId ?? '',
              cwd: targetCwd,
              title: item.content.title,
              prompt,
              agentId: agent.id,
              command: agent.command,
              surface: 'kanban',
              taskRef: { projectId: projectId ?? '', itemId: item.id },
              autoSend: true,
            });
            revealSession(session.id);
          }}
          className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LuPlay aria-hidden className="h-3 w-3 fill-current" />
        </button>
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
      {sessionId !== undefined && status.running ? (
        <CardTerminal sessionId={sessionId} visible={visible} activity={status.activity} />
      ) : null}
    </div>
  );
}
