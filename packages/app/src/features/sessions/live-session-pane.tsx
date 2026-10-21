import { useEffect, useState } from 'react';

import type { ManagedLiveSession } from '@midnite/studio-feature-sessions/renderer';
import { ExplorerNotice as Notice } from '@midnite/studio-frame';
import type { TerminalSession } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import { revealFabSession, revealSession } from '../terminal/reveal-session';
import { inMainPanel, useTerminalStore } from '../terminal/terminal-store';
import { LiveSessionTerminal } from './live-session-terminal';

/**
 * Studio's live detail pane for the Sessions view — the sessions feature's `LivePane` (Phase 113 Theme O
 * slice 4). It stayed in Studio when the view moved into `packages/features/sessions`, because it is the
 * terminal's own business: which panel already shows the session, and the store claim that keeps two
 * xterms from racing one pty.
 *
 * (Phase 86 Theme D, reworked by an ad hoc follow-up) — closed rows go through the transcript pane and
 * are untouched.
 *
 * Every still-live session — plain terminal, Kanban-card agent, or a Loop running on the FAB surface —
 * can render here, in `LiveSessionTerminal`. The one rule is mutual exclusion, not a surface
 * distinction: two live xterms racing the same pty over `pty.resize` (not the read side — `pty:data`
 * already fans out to any number of subscribers, see `live-session-terminal.tsx`'s own doc) is a real
 * bug, so a session's xterm is mounted in exactly one host at a time. `terminal-store`'s
 * `sessionsPaneSessionId` is the lock: while this pane holds it, the terminal panel and the Loops tab
 * render `YieldedToSessionsPage` in that session's slot instead of their own `LazyTerminalView`, and
 * their "Focus it here" button hands it back.
 *
 * Whether this pane takes the lock is the user's call, made once per selected session
 * (`LiveSessionHost`, keyed by session id):
 * - Owning panel closed (`terminalOpen` / `fabPanelOpen` false) — nothing else has the session mounted,
 *   so the pane embeds straight away and holds the claim; opening the panel later yields to the pane,
 *   not the reverse.
 * - Owning panel open and docked — the pane offers **Focus it here** (primary, takes the claim and
 *   embeds) beside the older **Focus it there** / **Reveal in Loops** (secondary,
 *   `revealSession`/`revealFabSession`).
 * - Owning panel detached into its own window (`terminalDetached` / `fabDetached`) — that window has its
 *   own store and cannot be told to yield, so only the reveal button is offered there.
 *
 * Four shapes, in order of precedence:
 * 1. Asleep — no process to show at all.
 * 2. No raw session — a stale/removed store entry the merged row hasn't caught up with yet.
 * 3. Not (yet) claimed — the hand-off card.
 * 4. Claimed — embeds the real terminal, full read/write, whichever surface it's on. A loop-driven
 *    session gets no reduced, read-only mode: the mutual-exclusion rule is what makes a second writer
 *    safe (it never coexists with the first), not a permissions distinction.
 */
export function LiveSessionDetail({
  session,
  rawSession,
}: {
  session: ManagedLiveSession;
  rawSession: TerminalSession | null;
}) {
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const terminalDetached = useUiStore((s) => s.terminalDetached);
  const fabPanelOpen = useUiStore((s) => s.fabPanelOpen);
  const fabDetached = useUiStore((s) => s.fabDetached);

  if (session.liveness === 'asleep') {
    return <Notice>This session is asleep — no live process to show. Wake it from the terminal panel.</Notice>;
  }

  if (!rawSession) {
    return <Notice>This session is running — open the terminal panel to interact with it.</Notice>;
  }

  const isFabSession = !inMainPanel(rawSession);
  const ownerDetached = isFabSession ? fabDetached : terminalDetached;
  const ownerDocked = !ownerDetached && (isFabSession ? fabPanelOpen : terminalOpen);

  return (
    <LiveSessionHost
      key={rawSession.id}
      session={rawSession}
      isFabSession={isFabSession}
      ownerDocked={ownerDocked}
      ownerDetached={ownerDetached}
    />
  );
}

/**
 * One selected live session's stay in the pane — keyed by session id from `LiveSessionDetail`, so the
 * "did the user pull it in here?" latch starts over for every row they select.
 *
 * The latch starts `true` when no panel has the session mounted (nothing to hand off to) and `false`
 * otherwise; the buttons flip it. While it is set the store claim is held for exactly as long as this
 * component is mounted for this session — the effect's cleanup releases it, scoped to the id so a late
 * cleanup cannot clear a claim a newer selection just made. The store subscription inside the same
 * effect is the reverse channel: when the owning panel's own "Focus it here" clears the claim, the latch
 * drops and the pane falls back to the hand-off card without a second render cycle of embedding.
 */
function LiveSessionHost({
  session,
  isFabSession,
  ownerDocked,
  ownerDetached,
}: {
  session: TerminalSession;
  isFabSession: boolean;
  /** The owning panel is open in this window and would mount the session itself. */
  ownerDocked: boolean;
  /** The owning panel lives in another window, out of this store's reach. */
  ownerDetached: boolean;
}) {
  const [focusHere, setFocusHere] = useState(() => !ownerDocked && !ownerDetached);
  const embedding = focusHere && !ownerDetached;

  useEffect(() => {
    if (!embedding) return undefined;
    const sessionId = session.id;
    useTerminalStore.getState().claimSessionsPane(sessionId);
    const unsubscribe = useTerminalStore.subscribe((s) => {
      if (s.sessionsPaneSessionId !== sessionId) setFocusHere(false);
    });
    return () => {
      unsubscribe();
      useTerminalStore.getState().releaseSessionsPane(sessionId);
    };
  }, [embedding, session.id]);

  if (embedding) {
    return <LiveSessionTerminal key={session.id} session={session} />;
  }

  const where = isFabSession ? 'the Loops panel' : 'the terminal panel';
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-8">
      <div className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        <p>
          {ownerDetached
            ? `This session's terminal is open in ${where}, in its own window.`
            : `This session's terminal is already open in ${where}.`}
        </p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => (isFabSession ? revealFabSession(session.id) : revealSession(session.id))}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {isFabSession ? 'Reveal in Loops' : 'Focus it there'}
          </button>
          {ownerDetached ? null : (
            <button
              type="button"
              onClick={() => setFocusHere(true)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Focus it here
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
