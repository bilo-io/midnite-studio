import type { TerminalSession } from '@midnite/git-shared';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useCallback, useEffect, useRef, useState } from 'react';

import { bridge } from '../../services/bridge';
import { shouldEscapeTerminal } from '../../services/keybindings/use-keybindings';
import {
  createActivityState,
  createShellLineState,
  detectActivity,
  trackShellCommand,
} from './activity-detect';
import { parseOsc7 } from './parse-osc7';
import { useTerminalStore } from './terminal-store';
import { useTerminalIpc } from './use-terminal-ipc';

/**
 * How long OSC 7 has to stay quiet before the store is told.
 *
 * Short enough that a `cd` re-labels the header before you have finished
 * reading the prompt, long enough that a prompt which re-announces the same
 * directory on every Enter collapses into one write.
 */
const OSC7_QUIET_MS = 80;

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

/**
 * DEC private-mode resets, written after a restored transcript.
 *
 * The replayed bytes are parsed exactly like live output, so if the shell was
 * last showing a full-screen program (vim, an agent's TUI) that had turned on
 * mouse tracking or the alternate screen, that mode survives into the revived
 * pane even though its process is dead. The visible symptom: hovering the
 * inert pane spams mouse-report escape codes at whatever plain shell starts
 * next, which echoes them back as garbage. Force every such mode off after
 * replay so a revived pane always starts in xterm's default, boring state —
 * DECRST of a mode that is already off is a no-op, so this is safe even when
 * nothing needs resetting.
 */
const RESET_MODES =
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l\x1b[?2004l\x1b[?1049l\x1b[?47l\x1b[?25h';

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

  // Output-side state for the activity guess: a persistent decoder because a
  // multi-byte UTF-8 character can land split across two pty chunks, and
  // `{ stream: true }` is what keeps the trailing half from decoding as
  // replacement characters.
  const decoderRef = useRef<TextDecoder>(new TextDecoder());
  // Where in Claude Code's repaint the stream currently is: the detector reads
  // one frame, not one chunk, so it has to remember what it has been handed
  // since the last frame ended.
  const activityRef = useRef(createActivityState());
  // Input-side state for a shell session's last-typed command.
  const shellLineRef = useRef(createShellLineState());

  const write = useCallback(
    (bytes: Uint8Array) => {
      termRef.current?.write(bytes);
      // Only an agent has a status footer worth reading; a plain shell's own
      // output is arbitrary program text and would false-positive constantly.
      if (session.kind !== 'agent') return;
      const text = decoderRef.current.decode(bytes, { stream: true });
      const activity = detectActivity(activityRef.current, text);
      if (activity) useTerminalStore.getState().setActivity(session.id, activity);
    },
    [session.id, session.kind],
  );

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
     * An agent's own idea of its session name, when it sets one.
     *
     * xterm parses the OSC 0/2 "set window title" sequence out of the byte
     * stream itself and fires this regardless of whether anything on screen
     * looks like a terminal tab — it costs nothing to listen for on a session
     * that never sends one, which degrades to the roster label fallback.
     */
    const titleSub =
      session.kind === 'agent'
        ? term.onTitleChange((title) => {
            const trimmed = title.trim();
            if (trimmed) useTerminalStore.getState().setAutoName(session.id, trimmed);
          })
        : null;

    /**
     * Where the shell actually is, from the OSC 7 sequence it emits on `cd`.
     *
     * Registered for every session, shell and agent alike: a shell that never
     * emits the sequence — macOS `zsh` out of the box, or a bare `sh` — simply
     * never fires this, and the header goes on showing the cwd the session was
     * opened at. Handling it costs nothing on a session that has nothing to
     * say.
     *
     * Returning false leaves the sequence for any other handler and for
     * xterm's default, which is to ignore an OSC 7 it was not asked about.
     *
     * Debounced, because a shell configured to emit OSC 7 from its prompt
     * re-announces the same directory on every Enter. The timer is cleared on
     * teardown alongside the handler that arms it — an unmounted session must
     * not write to the store a beat later.
     */
    let cwdTimer: ReturnType<typeof setTimeout> | null = null;
    const oscSub = term.parser.registerOscHandler(7, (payload) => {
      const next = parseOsc7(payload, bridge()?.hostname);
      if (next === null) return false;

      if (cwdTimer) clearTimeout(cwdTimer);
      cwdTimer = setTimeout(() => {
        cwdTimer = null;
        useTerminalStore.getState().setLiveCwd(session.id, next);
      }, OSC7_QUIET_MS);
      return false;
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

      /**
       * Cmd+Enter means "insert a newline, don't submit."
       *
       * xterm has no concept of the Cmd modifier on Enter — left alone it sends
       * a bare '\r', which is indistinguishable from plain Enter and submits
       * whatever the shell (or an agent CLI) is reading. Readline- and
       * Ink-based CLIs, Claude Code included, already treat Meta+Enter
       * (ESC then CR — the same sequence a terminal sends for Option+Enter) as
       * a literal newline, so sending that sequence ourselves gets Cmd+Enter
       * to mean the same thing without the CLI needing to know anything about
       * Cmd specifically.
       */
      if (event.key === 'Enter' && event.metaKey && !event.ctrlKey && !event.altKey) {
        if (stateRef.current === 'open') sendInputRef.current('\x1b\r');
        return false;
      }

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
        term.write(RESET_MODES);
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
          // A plain shell has no title escape of its own, so the best guess
          // at what it is doing is the last thing the user typed at it.
          if (session.kind === 'shell') {
            const command = trackShellCommand(shellLineRef.current, data);
            if (command) useTerminalStore.getState().setAutoName(session.id, command);
          } else {
            // Typing at an agent answers the question the "waiting" glyph is
            // asking, so the glyph drops back to idle on the first keystroke
            // rather than sitting there until the next footer repaint proves
            // it stale. The detector re-arms on the very next chunk of output.
            useTerminalStore.getState().setActivity(session.id, undefined);
          }
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

    /**
     * Force a repaint when the window comes back from being minimized.
     *
     * Minimizing changes nothing about the panel's own dimensions, so the
     * ResizeObserver above never fires — but Chromium can leave the WebGL
     * canvas showing stale or blank pixels once the window is unminimized,
     * since nothing told it to redraw. `visibilitychange` catches exactly
     * that transition (Electron ties `document.hidden` to the window's
     * minimized state) and `refresh` forces every row to redraw regardless of
     * whether the size actually changed — which is why an actual resize,
     * which does go through `safeFit`, has always been enough to fix it.
     */
    const onVisibilityChange = () => {
      if (document.hidden || !termRef.current) return;
      safeFit();
      termRef.current.refresh(0, termRef.current.rows - 1);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (cwdTimer) clearTimeout(cwdTimer);
      dataSub?.dispose();
      titleSub?.dispose();
      oscSub.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      setReady(false);
    };
    // One xterm per session, built once: `session.id` is the only dep that can
    // legitimately rebuild it. `session.kind` is read here too, but it never
    // changes for a session's lifetime, so it needs no entry of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // `focusSignal` also refires this when the session list asks to move focus
  // into an ALREADY-active session — see terminal-store's own comment on it.
  // `suppressAutoFocus` is the one case that skips it: the session list's own
  // arrow-key navigation, which changes the active session but wants to stay
  // in the list until an explicit sideways arrow hands focus over.
  const focusSignal = useTerminalStore((s) => s.focusSignal);
  useEffect(() => {
    if (!active || !ready) return;
    if (useTerminalStore.getState().suppressAutoFocus) {
      useTerminalStore.getState().clearSuppressAutoFocus();
      return;
    }
    termRef.current?.focus();
  }, [active, ready, focusSignal]);

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
