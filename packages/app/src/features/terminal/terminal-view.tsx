import type { TerminalSession } from '@midnite/git-shared';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useCallback, useEffect, useRef, useState } from 'react';

import { shouldEscapeTerminal } from '../../services/keybindings/use-keybindings';
import { useTerminalStore } from './terminal-store';
import { useTerminalIpc } from './use-terminal-ipc';

/**
 * One session's xterm.
 *
 * Adapted from midnite's web terminal; the transport is IPC rather than a
 * WebSocket, but the two hard-won parts are the same.
 *
 * 1. **Deferred open.** `term.open()` on a 0x0 element leaves xterm's render
 *    service without valid dimensions, and a later scroll or fit throws
 *    "Cannot read properties of undefined (reading 'dimensions')", killing the
 *    panel. Open is deferred to the first ResizeObserver callback that reports
 *    real dimensions.
 *
 * 2. **safeFit.** Same reasoning for every subsequent fit: bail out unless the
 *    element is measurable, and swallow the throw if it stops being so mid-fit.
 *
 * Rendering: the WebGL addon, not the DOM renderer. Powerline prompts
 * (powerlevel10k et al) use private-use glyphs (U+E0B0...) that none of the
 * macOS system monospace fonts contain; only the webgl/canvas renderers honor
 * `customGlyphs` and draw those shapes themselves, which is how VS Code shows
 * them without a Nerd Font installed. The font stack still leads with common
 * Nerd Fonts so users who have one get its full symbol set.
 *
 * Every open session mounts one of these at once, and only the active one is
 * visible. Inactive panes are hidden with `invisible`, never `display: none` —
 * a display-none element measures 0x0, which is exactly the state that breaks
 * xterm above. `visibility: hidden` keeps the layout box, so a background
 * terminal still knows how wide it is and its shell keeps the right column
 * count.
 */
const DARK_THEME = {
  background: '#09090b',
  foreground: '#e4e4e7',
  cursor: '#e4e4e7',
  selectionBackground: '#3f3f46',
} as const;

const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#18181b',
  cursor: '#18181b',
  selectionBackground: '#d4d4d8',
} as const;

const isDark = (): boolean => document.documentElement.classList.contains('dark');

/** Shown under a restored transcript, in place of the prompt that is not there. */
const REVIVE_HINT = '\r\n\x1b[2m[session ended] Press Enter to start a new shell here.\x1b[0m\r\n';

export function TerminalView({
  session,
  active,
  initialInput,
}: {
  session: TerminalSession;
  active: boolean;
  /** Typed in when this session first starts — the agent's command. */
  initialInput?: string | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [ready, setReady] = useState(false);

  const write = useCallback((bytes: Uint8Array) => {
    termRef.current?.write(bytes);
  }, []);

  const { connectionState, error, start, sendInput, sendResize } = useTerminalIpc(session, write);

  // Refs so the mount effect can stay dependency-free and run exactly once.
  const sendInputRef = useRef(sendInput);
  sendInputRef.current = sendInput;
  const sendResizeRef = useRef(sendResize);
  sendResizeRef.current = sendResize;
  const startRef = useRef(start);
  startRef.current = start;
  const initialInputRef = useRef(initialInput);
  initialInputRef.current = initialInput;
  const stateRef = useRef(connectionState);
  stateRef.current = connectionState;

  useEffect(() => {
    const container = containerRef.current;
    if (termRef.current || !container) return;

    const term = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily:
        '"MesloLGS NF", "Hack Nerd Font Mono", "JetBrainsMono Nerd Font Mono", "FiraCode Nerd Font Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
      fontSize: 12,
      // Honored by the WebGL renderer below: box-drawing and powerline glyphs
      // are drawn by xterm itself instead of looked up in the font.
      customGlyphs: true,
      theme: isDark() ? DARK_THEME : LIGHT_THEME,
      // The scrollback a real terminal has; the default 1000 loses the top of a
      // long build log, which is exactly the part you want.
      scrollback: 10_000,
    });

    /**
     * Which keystrokes escape the terminal.
     *
     * Returning false swallows the event for xterm and lets it reach the app's
     * capture-phase handler. The allow-list is tiny by necessity: Ctrl+C, Ctrl+D
     * and friends belong to the shell, and stealing them would make the panel
     * useless.
     */
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      return !shouldEscapeTerminal(event);
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    const safeFit = () => {
      const el = containerRef.current;
      if (!fitRef.current || !termRef.current || !el) return;
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      try {
        fitRef.current.fit();
        sendResizeRef.current(termRef.current.cols, termRef.current.rows);
      } catch {
        // Container stopped being measurable mid-fit.
      }
    };

    let dataSub: { dispose: () => void } | null = null;

    const openWhenSized = () => {
      if (termRef.current) return;
      const el = containerRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;

      term.open(el);
      // Must load after open() - the addon needs the terminal's element. If the
      // GPU says no (context creation fails or is later lost), fall back to the
      // DOM renderer: everything still works, only the drawn glyphs degrade.
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
      } catch {
        // WebGL unavailable; DOM renderer remains active.
      }
      termRef.current = term;
      fitRef.current = fit;
      safeFit();

      /**
       * Replay a restored transcript before anything else is written.
       *
       * Read, not consumed. A remount builds a NEW xterm with an empty screen,
       * so re-writing it is what the transcript is for — the doubling this used
       * to guard against can only happen within one terminal, and each mount
       * writes exactly once. Taking it destructively meant the second mount saw
       * nothing to replay, which under StrictMode is every mount: the pane came
       * up blank, and the auto-start below read "no replay" as "brand new" and
       * revived a shell the user never asked for.
       */
      const replay = useTerminalStore.getState().peekReplay(session.id);
      if (replay && replay.length > 0) {
        term.write(replay);
        term.write(REVIVE_HINT);
      }

      /**
       * Keystrokes reach the shell - or wake a dead session.
       *
       * A restored terminal has no process, so the first keystroke starts one
       * rather than being sent into the void. It is deliberately not forwarded
       * afterwards: the shell is still coming up, and the character that woke
       * it belongs to the gesture, not to the command line.
       */
      dataSub = term.onData((data) => {
        if (stateRef.current === 'open') {
          sendInputRef.current(data);
          return;
        }
        if (stateRef.current === 'starting' || stateRef.current === 'unavailable') return;
        void startRef.current(term.cols, term.rows, initialInputRef.current);
      });

      setReady(true);

      /*
        A brand-new session starts straight away; a restored one waits to be
        asked, which is what makes reopening the app with a dozen of them free.

        Keyed on the connection state rather than on whether a transcript was
        found. `idle` means this session has never had a process in this run;
        a restored one hydrates as `exited`. The transcript is a poor proxy for
        the same question — a session saved before it printed anything restores
        with an empty one, and would then be revived on sight.
      */
      if (stateRef.current === 'idle') {
        void startRef.current(term.cols, term.rows, initialInputRef.current);
      }
    };

    const observer = new ResizeObserver(() => {
      if (!termRef.current) openWhenSized();
      else safeFit();
    });
    observer.observe(container);
    openWhenSized();

    return () => {
      observer.disconnect();
      dataSub?.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      setReady(false);
    };
    // One xterm per session, built once: `session.id` is the only dep that can
    // legitimately rebuild it.
  }, [session.id]);

  // Re-theme in place rather than recreating the terminal - a rebuild would
  // wipe the scrollback and kill the shell.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (termRef.current) termRef.current.options.theme = isDark() ? DARK_THEME : LIGHT_THEME;
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Focus follows selection, so switching sessions leaves you able to type.
  useEffect(() => {
    if (active && ready) termRef.current?.focus();
  }, [active, ready]);

  return (
    <div
      className={`absolute inset-0 flex flex-col ${active ? '' : 'invisible'}`}
      aria-hidden={!active}
    >
      {connectionState === 'unavailable' ? (
        <p className="p-3 text-xs text-destructive">
          {error ?? 'The terminal backend is unavailable.'}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 p-1">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
