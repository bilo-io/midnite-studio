import { useEffect, useRef } from 'react';

import { SCROLLBACK_BYTES, type TerminalSession } from '@midnite/studio-shared';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

import { bridge } from '../../services/bridge';
import { shouldEscapeTerminal } from '../../services/keybindings/use-keybindings';
import { resolveTerminalPalette } from '../themes/resolve-palette';
import { disableSynchronizedOutput } from '../terminal/disable-synchronized-output';
import { enableUnicode11 } from '../terminal/enable-unicode11';
import { terminalFontOptions } from '../terminal/terminal-font';
import { createReplayGate, gateLiveWrite, replayLiveHandoff, type ReplayGate } from '../terminal/replay-gate';
import { useTerminalIpc } from '../terminal/use-terminal-ipc';
import { useTerminalStore } from '../terminal/terminal-store';
import { useUiStore } from '../../store/ui-store';

const isDark = (): boolean => document.documentElement.classList.contains('dark');

/**
 * The Sessions manager's own live pane (Phase 86 Theme D).
 *
 * **Never spawns a pty.** Unlike `TerminalView`, this component has no
 * `start()` call anywhere in it — a session showing here is, by construction,
 * already running (`ManagedSessionLiveness === 'running'`), so the only thing
 * this ever does is read the existing pty id out of `terminal-store`'s
 * `ptyIds` map and attach to its already-live `pty:data` stream. That is the
 * "reuses the single [pty] instance" the phase doc asks for — there is no
 * second process, only a second *subscriber* to the one that already exists,
 * which is the same fan-out `pty-service.ts` already serves to a detached
 * popout window showing the same session.
 *
 * **DOM renderer, never WebGL.** `terminal-view.tsx`'s WebGL budget
 * (`xterm-budget.ts`) is accounted against the terminal panel's own mounted
 * set; this is a second, independent host that budget knows nothing about,
 * so it never asks — the same reasoning `transcript-view.tsx` already
 * documents for the closed half of this same pane.
 *
 * **Caller's job, not this component's:** deciding whether to render this at
 * all, and for which surface. `sessions-view.tsx` mounts it for ANY still-live
 * session — plain terminal, Kanban-card agent, or a FAB-surface Loop — but
 * only while it holds `terminal-store`'s `sessionsPaneSessionId` claim for
 * that session. That claim is what keeps this the ONLY live xterm on the pty
 * in this window: the terminal panel and the Loops tab yield the session's
 * slot (`YieldedToSessionsPage`) for as long as it is held, and the pane
 * offers "Focus it here" / "Focus it there" to move the one xterm between
 * them. A panel detached into its own window has its own store and cannot be
 * made to yield, so the pane hands off there instead of claiming.
 */
export function LiveSessionTerminal({ session }: { session: TerminalSession }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  const writeToTermRef = useRef<(bytes: Uint8Array) => void>(() => {});
  const replayGateRef = useRef<ReplayGate | null>(null);

  const write = (bytes: Uint8Array) => {
    gateLiveWrite(replayGateRef.current, bytes, (b) => writeToTermRef.current(b));
  };

  const { connectionState, error } = useTerminalIpc(session, write);
  const connectionStateRef = useRef(connectionState);
  connectionStateRef.current = connectionState;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (connectionState !== 'open') return undefined;

    const dark = isDark();
    const font = useUiStore.getState();
    const term = new Terminal({
      disableStdin: false,
      cursorBlink: true,
      convertEol: false,
      scrollback: Math.floor(SCROLLBACK_BYTES / 40),
      theme: resolveTerminalPalette(dark ? 'dark' : 'light').terminal,
      ...terminalFontOptions({
        fontFamily: font.terminalFontFamily,
        fontSize: font.terminalFontSize,
        lineHeight: font.terminalLineHeight,
      }),
      // `term.unicode`, for `enableUnicode11` below.
      allowProposedApi: true,
    });
    enableUnicode11(term);

    disableSynchronizedOutput(term);

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      return !shouldEscapeTerminal(event);
    });

    writeToTermRef.current = (bytes) => term.write(bytes);

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();
    termRef.current = term;

    let cancelled = false;
    const ptyId = useTerminalStore.getState().ptyIds[session.id];
    const api = bridge();
    if (ptyId && api) {
      replayGateRef.current = replayLiveHandoff(
        () => api.pty.snapshot({ ptyId }).then(({ bytes }) => bytes),
        (bytes) => {
          if (bytes.length > 0) {
            term.write(bytes);
          }
        },
        (bytes) => term.write(bytes),
        () => cancelled,
      );
    } else {
      const gate = createReplayGate();
      gate.release((bytes) => term.write(bytes));
      replayGateRef.current = gate;
    }

    const dataSub = term.onData((data) => {
      if (connectionStateRef.current === 'open') {
        useTerminalStore.getState().sendInput(session.id, data);
      }
    });

    const observer = new ResizeObserver(() => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        fit.fit();
        const { cols, rows } = term;
        const currentPtyId = useTerminalStore.getState().ptyIds[session.id];
        if (currentPtyId) bridge()?.pty.resize({ ptyId: currentPtyId, cols, rows });
      } catch {
        // Container stopped being measurable mid-fit.
      }
    });
    observer.observe(container);

    return () => {
      cancelled = true;
      dataSub.dispose();
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      replayGateRef.current = null;
    };
    // One mount per (session, connectionState reaching 'open') — a session
    // that drops back to `starting`/`unavailable` and later re-opens (a
    // revive from elsewhere while this pane stays mounted) gets a fresh
    // terminal and a fresh snapshot rather than writing into a disposed one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, connectionState === 'open']);

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* Always mounted — the mount effect above needs a real container the
          moment `connectionState` reaches `'open'`, so this can never be
          swapped out for a placeholder the way `TranscriptView`'s loading
          state is. The placeholder below overlays it instead. */}
      <div ref={containerRef} className="min-h-0 flex-1" />
      {connectionState === 'unavailable' ? (
        <div className="absolute inset-0 grid place-items-center bg-background p-8">
          <p className="max-w-md text-center text-sm leading-relaxed text-destructive">
            {error ?? 'This session is unavailable.'}
          </p>
        </div>
      ) : connectionState !== 'open' ? (
        <div className="absolute inset-0 grid place-items-center bg-background p-8">
          <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">Starting…</p>
        </div>
      ) : null}
    </div>
  );
}
