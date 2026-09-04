import { LuExternalLink } from 'react-icons/lu';

import { Tooltip } from '../../../components/tooltip';
import { LazyTerminalView } from '../../terminal/lazy-terminal-view';
import { revealSession } from '../../terminal/reveal-session';
import { useTerminalStore } from '../../terminal/terminal-store';

/**
 * The terminal inside a running card (Phase 41 Theme E) — through
 * `LazyTerminalView` only, per that module's own docblock: a direct
 * `./terminal-view` import here would put xterm straight back in the entry
 * chunk and nothing would say so.
 *
 * Rendered only while `visible` — the caller (`TaskCard`) owns the
 * `IntersectionObserver` and falls back to `CardActivityLine` itself when
 * this card is off-screen. There is no longer a separate cap on how many
 * card terminals may mount at once (Phase 51 Theme C retired
 * `card-terminal-mounts.ts`'s `MAX_CARD_TERMINALS`, which existed only to
 * ration the same WebGL contexts `xterm-budget.ts` now rations directly,
 * process-wide) — a card over that budget still mounts, and degrades to the
 * DOM renderer instead of not rendering at all.
 */
export function CardTerminal({ sessionId, visible }: { sessionId: string; visible: boolean }) {
  const session = useTerminalStore((s) => s.sessions.find((row) => row.id === sessionId));
  const pendingInput = useTerminalStore((s) => s.pendingInput[sessionId]);

  if (!session || !visible) return null;

  return (
    <div className="relative h-40 overflow-hidden rounded border border-border">
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
