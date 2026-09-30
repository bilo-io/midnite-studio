import { LuExternalLink } from 'react-icons/lu';

import { Tooltip } from '../../../components/tooltip';
import { useUiStore } from '../../../store/ui-store';
import { LazyTerminalView } from '../../terminal/lazy-terminal-view';
import { revealSession } from '../../terminal/reveal-session';
import { useMountedSessionIds } from '../../terminal/session-mount-policy';
import { useTerminalStore, type SessionActivity } from '../../terminal/terminal-store';
import { CardActivityLine } from './card-activity-line';

/**
 * The terminal inside a running card (Phase 41 Theme E) — through
 * `LazyTerminalView` only, per that module's own docblock: a direct
 * `./terminal-view` import here would put xterm straight back in the entry
 * chunk and nothing would say so.
 *
 * There is no longer a separate cap on how many card terminals may mount at
 * once (Phase 51 Theme C retired `card-terminal-mounts.ts`'s
 * `MAX_CARD_TERMINALS`, which existed only to ration the same WebGL contexts
 * `xterm-budget.ts` now rations directly, process-wide) — a card over that
 * budget still mounts, and degrades to the DOM renderer instead of not
 * rendering at all.
 *
 * `visible` (the caller's `IntersectionObserver`) still decides what's ON
 * SCREEN, but Phase 84 Theme E.5 puts a second, independent question to
 * `session-mount-policy.ts`: whether this card's xterm stays MOUNTED a beat
 * longer than that — the same visible-plus-grace-period budget the docked
 * panel's own sessions get, rather than the instant unmount-on-scroll-away
 * this component used to be the last holdout on. Without it, idly scrolling
 * a board up and down would tear a running agent's xterm down and pay a full
 * scrollback-snapshot re-fetch on every pass. `keepRecent: 1` is the whole of
 * a single card's own domain — there is only ever one session id to keep,
 * once it goes hidden — and the disposal deadline itself comes from
 * `Settings ▸ Terminal`, the same field the panel reads, so one number
 * governs "how long a hidden terminal survives" everywhere it applies.
 */
export function CardTerminal({
  sessionId,
  visible,
  activity,
}: {
  sessionId: string;
  visible: boolean;
  /** What to show in the activity-line fallback while this card is off-screen or past its grace period. */
  activity: SessionActivity | undefined;
}) {
  const session = useTerminalStore((s) => s.sessions.find((row) => row.id === sessionId));
  const pendingInput = useTerminalStore((s) => s.pendingInput[sessionId]);
  const disposeAfterMs = useUiStore((s) => s.terminalDisposeAfterMs);
  const mounted = useMountedSessionIds([sessionId], visible ? sessionId : null, {
    keepRecent: 1,
    disposeAfterMs,
  }).has(sessionId);

  if (!session) return null;

  if (!visible) {
    // Off-screen: the activity line is what's actually shown, but the xterm
    // underneath stays alive — invisible, not unmounted — for as long as the
    // shared policy grants it, so scrolling back within the grace window
    // shows the SAME pane rather than a freshly rehydrated one.
    return (
      <div className="relative">
        <CardActivityLine activity={activity} />
        {mounted ? (
          <div className="invisible absolute inset-0 h-40 overflow-hidden rounded border border-border">
            <LazyTerminalView
              key={session.id}
              session={session}
              active={false}
              autoFocus={false}
              initialInput={pendingInput}
              fitSignal={0}
              layoutClassName="h-full w-full"
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="relative h-40 overflow-hidden rounded border border-border"
      onClick={(event) => event.stopPropagation()}
    >
      <Tooltip label="Pop out to Terminal view">
        <button
          type="button"
          aria-label="Pop out to Terminal view"
          onClick={(event) => {
            event.stopPropagation();
            revealSession(sessionId);
          }}
          className="absolute right-1 top-1 z-10 rounded bg-background/80 p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LuExternalLink aria-hidden className="h-3 w-3" />
        </button>
      </Tooltip>
      {/*
        `active` (not `invisible`) because this pane is genuinely on screen,
        with `autoFocus={false}` so a card scrolling into view never steals
        focus from wherever it actually was — the one thing `active` alone
        cannot express (see `terminal-view.tsx`'s own note on the prop).
        `initialInput` reads `pendingInput` only: a kanban session always
        arrives with one set (Theme G's `startAgent({ autoSend: false })`),
        so there is no roster-lookup fallback to build here.
      */}
      <LazyTerminalView
        key={session.id}
        session={session}
        active
        autoFocus={false}
        initialInput={pendingInput}
        fitSignal={0}
        layoutClassName="h-full w-full"
      />
    </div>
  );
}
