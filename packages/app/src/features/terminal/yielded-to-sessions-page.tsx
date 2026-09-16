import { useTerminalStore } from './terminal-store';

/**
 * What a terminal host renders in a session's slot while the Sessions page's
 * detail pane is hosting that session's xterm instead (ad hoc follow-up to
 * Phase 86 Theme D — see `sessionsPaneSessionId` in `terminal-store.ts`).
 *
 * Two live xterms on one pty fight over `pty.resize`, so a session is only
 * ever mounted in one place. The Sessions pane's "Focus it here" claims it;
 * this is the other end of that hand-off, in the terminal panel's stacked
 * pane (`terminal-panel.tsx`) and a Loops tab's terminal box
 * (`loop-tab.tsx`), and its own "Focus it here" gives it back — the moment
 * the claim clears, the host remounts a fresh `LazyTerminalView`, which
 * replays main's scrollback the same way any remount already does.
 *
 * `hidden` mirrors `TerminalView`'s own `invisible`-not-`display:none` rule
 * for an inactive stacked pane: the panel positions every pane `absolute
 * inset-0` and shows one, and this placeholder sits in that stack.
 */
export function YieldedToSessionsPage({
  sessionId,
  hidden = false,
  layoutClassName = 'absolute inset-0',
}: {
  sessionId: string;
  /** An inactive pane in a stack of panes — kept in layout, not shown. */
  hidden?: boolean;
  /** The host's own box classes; defaults to the panel's stacked layout. */
  layoutClassName?: string;
}) {
  const release = useTerminalStore((s) => s.releaseSessionsPane);
  return (
    <div
      data-terminal-yielded={sessionId}
      aria-hidden={hidden}
      className={`${layoutClassName} grid place-items-center bg-background p-6 ${hidden ? 'invisible' : ''}`}
    >
      <div className="max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
        <p>This terminal is showing on the Sessions page.</p>
        <button
          type="button"
          onClick={() => release(sessionId)}
          className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Focus it here
        </button>
      </div>
    </div>
  );
}
