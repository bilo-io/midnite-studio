import { useRef } from 'react';
import { LuCircleDot, LuGitPullRequest, LuNotebookPen, LuSquareTerminal } from 'react-icons/lu';

import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import type { IconComponent } from '../../../components/icon-button';
import { Tooltip } from '../../../components/tooltip';
import { formatFieldValue } from '../field-editor';
import { ExternalLink } from '../../markdown/external-link';
import { revealSession } from '../../terminal/reveal-session';
import { CardActivityLine } from './card-activity-line';
import { CardTerminal } from './card-terminal';
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
  const Icon = CONTENT_ICON[item.content.type];
  const href = item.content.type === 'draft' ? null : item.content.url;
  const number = item.content.type === 'draft' ? null : item.content.number;

  const chips = fields
    .map((field) => ({ field, text: formatFieldValue(item.fieldValues[field.id]) }))
    .filter((chip) => chip.text.length > 0);

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
      className={`flex w-full flex-col gap-1.5 rounded border border-border bg-background px-2 py-1.5 text-left text-xs hover:border-foreground/30 ${
        glow === 'idle' ? '' : `card-run-glow is-${glow}`
      }`}
    >
      <div className="flex items-start gap-1.5">
        <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{item.content.title}</span>
        {/*
          The card's own answer to "where did my agent go" — shown only once
          this card HAS a session, so an untouched card carries no chrome for
          a terminal that does not exist. Its own click target, stopped from
          also opening the detail pane: the pane is the composer, and someone
          reaching for the terminal has already launched.
        */}
        {sessionId !== undefined ? (
          <Tooltip label="Open in terminal">
            <button
              type="button"
              aria-label="Open in terminal"
              data-testid="card-reveal-terminal"
              onClick={(event) => {
                event.stopPropagation();
                revealSession(sessionId);
              }}
              className="-mr-0.5 mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <LuSquareTerminal aria-hidden className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        ) : null}
      </div>

      {number !== null || item.content.assignees.length > 0 ? (
        <div className="flex items-center justify-between gap-2">
          {number !== null ? (
            href ? (
              // Its own click target, not the card's — stopped from also
              // opening the detail pane the card click would.
              <span onClick={(event) => event.stopPropagation()}>
                <ExternalLink href={href}>
                  <span className="text-[11px] text-muted-foreground">#{number}</span>
                </ExternalLink>
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">#{number}</span>
            )
          ) : (
            <span />
          )}
          {item.content.assignees.length > 0 ? (
            <div className="flex -space-x-1.5">
              {item.content.assignees.map((login) => (
                <img
                  key={login}
                  src={`https://github.com/${login}.png?size=32`}
                  alt={login}
                  title={login}
                  className="h-4 w-4 rounded-full border border-background"
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span
              key={chip.field.id}
              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {chip.text}
            </span>
          ))}
        </div>
      ) : null}

      {/*
        Theme E: only ever rendered once a session is actually running — a
        card with no session, or one that has ended, shows neither the
        terminal nor the activity line (`EndedStrip` inside the card's own
        detail pane already covers "ended", per Theme F/H).

        `stopPropagation` guards only the terminal, not the activity line: the
        line is a plain status pill with nothing of its own to click, so a
        click on it is still "open the card" — only the terminal underneath
        (a real xterm, and its pop-out button) needs to keep a click from also
        opening the detail pane behind it.
      */}
      {sessionId !== undefined && status.running ? (
        visible ? (
          <div onClick={(event) => event.stopPropagation()}>
            <CardTerminal sessionId={sessionId} visible={visible} />
          </div>
        ) : (
          <CardActivityLine activity={status.activity} />
        )
      ) : null}
    </div>
  );
}

const CONTENT_ICON: Record<ForgeProjectItem['content']['type'], IconComponent> = {
  issue: LuCircleDot,
  pull: LuGitPullRequest,
  draft: LuNotebookPen,
};
