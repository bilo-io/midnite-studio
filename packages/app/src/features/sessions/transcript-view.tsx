import { useEffect, useRef, useState } from 'react';

import { SCROLLBACK_BYTES } from '@midnite/studio-shared';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { LuHistory } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { bridge } from '../../services/bridge';
import { resolveTerminalPalette } from '../themes/resolve-palette';
import { terminalFontOptions } from '../terminal/terminal-font';
import { useUiStore } from '../../store/ui-store';

/**
 * Same reset-modes pairing `terminal-view.tsx` writes after every replay
 * (`term.write(bytes); term.write(RESET_MODES)`) — a transcript that ended
 * mid-alternate-screen or mid-bracketed-paste must not leave the emulator in
 * that mode.
 */
const RESET_MODES =
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1004l\x1b[?1005l\x1b[?1006l\x1b[?1015l\x1b[?2004l\x1b[?1049l\x1b[?47l\x1b[?25h';

const isDark = (): boolean => document.documentElement.classList.contains('dark');

/**
 * A read-only xterm over an archived transcript (Phase 67 Theme D).
 *
 * **Not a reuse of `TerminalView`.** That component wires an input path, a
 * live `pty.snapshot` fetch, and a wake-on-keystroke behaviour that starts a
 * NEW process on a dead session — a closed session whose `cwd` may no longer
 * exist must never be able to spawn anything (Decision 3). What survives
 * here is the two lines that matter: `term.write(bytes); term.write(RESET_MODES)`.
 *
 * **DOM renderer, never WebGL** — this never calls `useXtermWebglSlot`
 * (`xterm-budget.ts`) and never loads the WebGL addon. That module has no
 * "never ask" flag; the opt-out here is simply not asking, which leaves all
 * twelve of `MAX_WEBGL_CONTEXTS` available to live terminals.
 *
 * Fetches its own bytes from `sessionId` so the parent (`sessions-view.tsx`)
 * holds only an id, never a megabyte.
 */
export function TranscriptView({ sessionId }: { sessionId: string }) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBytes(null);

    void bridge()
      ?.sessions.transcript({ sessionId })
      .then((res) => {
        // Ignore an in-flight fetch for a session the user has since moved
        // past — the standard guard for a fetch racing a selection change.
        if (cancelled) return;
        setBytes(res.bytes);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (bytes === null) return null;

  if (bytes.length === 0) {
    return (
      <EmptyState
        icon={LuHistory}
        title="No transcript"
        body="This session ended before anything was written."
      />
    );
  }

  // Keyed on `sessionId`: a new session tears down and rebuilds the whole
  // `Terminal` rather than `reset()` + rewrite, because `reset()` preserves
  // the old instance's dimensions and addon state and fidelity — the pane
  // looking like what you saw — is the deliverable.
  return <TranscriptTerminal key={sessionId} bytes={bytes} />;
}

function TranscriptTerminal({ bytes }: { bytes: Uint8Array }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const dark = isDark();
    const font = useUiStore.getState();
    const term = new Terminal({
      disableStdin: true,
      cursorBlink: false,
      convertEol: false,
      // `scrollback: 0` is wrong here — the whole point is scrollback. A
      // generous upper bound; the trim already applied on disk (`terminal-
      // store.ts`'s `trimScrollback`) does the real bounding.
      scrollback: Math.floor(SCROLLBACK_BYTES / 40),
      theme: resolveTerminalPalette(dark ? 'dark' : 'light').terminal,
      ...terminalFontOptions({
        fontFamily: font.terminalFontFamily,
        fontSize: font.terminalFontSize,
        lineHeight: font.terminalLineHeight,
      }),
    });

    // Selection and copy/select-all stay live; every other keystroke is
    // swallowed rather than reaching a process that does not exist.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && (key === 'c' || key === 'a')) return true;
      return false;
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();
    term.write(bytes);
    term.write(RESET_MODES);

    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(container);

    return () => {
      observer.disconnect();
      term.dispose();
    };
    // `bytes` never changes for a mounted instance — `TranscriptView` keys
    // this component on `sessionId`, so a new transcript is a new mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="min-h-0 flex-1" />;
}
