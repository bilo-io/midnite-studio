import type { TerminalSession } from '@midnite/studio-shared';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useCallback, useEffect, useRef, useState } from 'react';

import { bridge } from '../../services/bridge';
import { shouldEscapeTerminal } from '../../services/keybindings/use-keybindings';
import { openExternal } from '../../services/queries';
import { EndedStrip } from './ended-banner';
import { isXtermFocusReport } from './is-xterm-focus-report';
import { parseOsc7 } from './parse-osc7';
import { createReplayGate } from './replay-gate';
import { attachTerminalLinks } from './terminal-links';
import { agentInput } from './terminal-panel';
import { sessionPhase, useTerminalStore } from './terminal-store';
import { useAgents } from './use-agents';
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
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1004l\x1b[?1005l\x1b[?1006l\x1b[?1015l\x1b[?2004l\x1b[?1049l\x1b[?47l\x1b[?25h';

export function TerminalView({
  session,
  active,
  autoFocus = true,
  initialInput,
  fitSignal,
  layoutClassName,
}: {
  session: TerminalSession;
  active: boolean;
  /**
   * Whether becoming ready should steal keyboard focus (Phase 41 Theme E).
   * Every existing host wants `active` to mean both things at once — the
   * panel and the FAB tabs each show exactly one session and it is always
   * the one the user meant to type into. A Kanban card's mini terminal
   * breaks that: it is genuinely visible (so `active`, not `invisible`)
   * without ever being the thing you clicked, and a card scrolling into
   * view has no business dragging focus out of wherever it actually was.
   */
  autoFocus?: boolean;
  /** Typed in when this session first starts — the agent's command. */
  initialInput?: string | undefined;
  /** Bumped once a reveal tween settles — fits and repaints, once, at the end. */
  fitSignal: number;
  /**
   * The outer box's positioning classes. Defaults to the main panel's stacked
   * layout (`absolute inset-0`, which needs a positioned ancestor); a host
   * that gives the view a box of its own (the FAB pane, Phase 35) passes its
   * own classes instead of fighting the absolute placement.
   */
  layoutClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [ready, setReady] = useState(false);
  /**
   * The last size actually sent to the shell, so `safeFit` can skip a resize
   * that would repeat it.
   *
   * The two-nested-box tween pins this component's own container at its
   * final size for the length of a reveal — only the ANCESTOR's clip region
   * grows — so both the ResizeObserver (on mount) and the settle-triggered
   * `fitSignal` effect below can end up calling `safeFit` for the same
   * dimensions. Sending the SIGWINCH once per genuine size change, not once
   * per caller, is the guardrail this dedupes against.
   */
  const lastSentRef = useRef<{ cols: number; rows: number } | null>(null);

  /**
   * Holds output that arrives while a live-rebind snapshot is in flight.
   *
   * `null` means "nothing to gate" — the ordinary revive/replay path, where
   * every chunk writes straight through. Set to a fresh, closed gate only for
   * the live-rebind branch in `openWhenSized`, and released once that
   * snapshot has been written — see the mount effect below.
   */
  const replayGateRef = useRef<ReturnType<typeof createReplayGate> | null>(null);

  /*
    Phase 30 Theme G: the activity guess itself moved to main, at
    `pty-service.ts`'s single `ptyData` send site — mounting the detector
    inside this view meant it went dark the moment `app.tsx`'s
    `terminalReveal.mounted` unmounted every `TerminalView` on a collapse,
    which is exactly when the status bar's agent count is the only thing
    still looking. `use-terminal-ipc.ts`'s `onActivity` subscription is
    mounted per session and does not unmount with the panel.
  */
  const writeToTerm = useCallback((bytes: Uint8Array) => {
    termRef.current?.write(bytes);
  }, []);

  const write = useCallback(
    (bytes: Uint8Array) => {
      const gate = replayGateRef.current;
      if (gate && !gate.open) {
        gate.hold(bytes);
        return;
      }
      writeToTerm(bytes);
    },
    [writeToTerm],
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

  /**
   * Whether the process probe has EVER named a foreground command for this
   * shell session — not just its current answer, which goes back to `null`
   * at a bare prompt.
   *
   * Read at call-time inside the mount effect's `onTitleChange` handler
   * (below): once the process tree has spoken for a session, a held command
   * name outranks whatever the prompt's own OSC title says next — a title
   * update is only trusted before the probe has ever had anything to say.
   */
  const foregroundCommand = useTerminalStore((s) => s.foregroundCommand[session.id]);
  const sawForegroundCommandRef = useRef(false);
  if (foregroundCommand) sawForegroundCommandRef.current = true;

  /**
   * Fit and send one resize, only if the container currently measures.
   *
   * Hoisted to component scope (rather than declared inside the mount effect)
   * so `fitSignal`'s own effect below can call the same function the mount
   * effect and the `ResizeObserver` use — every fit path in this component is
   * this one function.
   */
  const safeFit = useCallback(() => {
    const el = containerRef.current;
    if (!fitRef.current || !termRef.current || !el) return;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;
    try {
      fitRef.current.fit();
      const { cols, rows } = termRef.current;
      const last = lastSentRef.current;
      if (last && last.cols === cols && last.rows === rows) return;
      lastSentRef.current = { cols, rows };
      sendResizeRef.current(cols, rows);
    } catch {
      // Container stopped being measurable mid-fit.
    }
  }, []);

  /**
   * Fit and repaint once a reveal tween settles.
   *
   * A tween resizes the CONTAINER continuously without a `ResizeObserver`
   * firing per frame (the two-nested-box trick — the outer box animates, the
   * inner one is pinned at its final size throughout), so nothing else calls
   * `safeFit` while the animation runs. This is what tells the shell its new
   * size exactly once, at the end, rather than never.
   */
  useEffect(() => {
    safeFit();
    const term = termRef.current;
    if (term) term.refresh(0, term.rows - 1);
  }, [fitSignal, safeFit]);

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
     * A session's own idea of its name, from the OSC 0/2 "set window title"
     * sequence xterm parses out of the byte stream itself.
     *
     * An agent always trusts it — it is the CLI's own chrome. A shell trusts
     * it only until the process probe has named a real foreground command at
     * least once (Theme E): a held command name is a better answer than
     * whatever a prompt's own title escape says next, and reverting to the
     * title on every bare-prompt repaint would fight the hold.
     */
    const titleSub = term.onTitleChange((title) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      if (session.kind === 'shell' && sawForegroundCommandRef.current) return;
      useTerminalStore.getState().setAutoName(session.id, trimmed);
    });

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

    /**
     * Cmd+click (Ctrl elsewhere) opens a URL in the output.
     *
     * Registered before `open()` on purpose: a link provider is a parser-side
     * concern, and the rows a session replays are already in the buffer by the
     * time anything is hovered. `openExternal` rather than a navigation for the
     * same reason `ExternalLink` uses it — the renderer is a `file://` origin
     * with no browser chrome to come back from.
     */
    const links = attachTerminalLinks(term, openExternal);

    let dataSub: { dispose: () => void } | null = null;
    /**
     * Set once this effect's own cleanup runs, so an in-flight snapshot
     * request from a torn-down instance never writes into (or releases the
     * gate of) a `term` this cleanup already disposed. StrictMode's dev-only
     * mount→cleanup→remount does exactly this to every effect once; without
     * the guard, the throwaway instance's response would land on an already-
     * disposed xterm.
     */
    let cancelled = false;

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
       * A live session replays main's CURRENT ring buffer, not the saved
       * transcript — the reason the pane used to come up blank on reveal. A
       * remount builds a NEW xterm with an empty screen regardless of which
       * branch runs, so re-writing on every mount is correct, not a doubling:
       * each mount writes exactly once.
       *
       * `stateRef.current === 'open'` here means the store already has this
       * session bound to a live pty from BEFORE this mount — a remount after
       * the panel was fully hidden and shown again, or (Theme B) after a
       * renderer reload rebinds `hydrate()` straight to `'open'`. Either way
       * there is a process to ask, and `peekReplay` would answer with the
       * disk-restored transcript from whenever the app last booted, not what
       * that process has printed since.
       */
      if (stateRef.current === 'open') {
        const ptyId = useTerminalStore.getState().ptyIds[session.id];
        const gate = createReplayGate();
        replayGateRef.current = gate;
        const api = bridge();
        if (ptyId && api) {
          void api.pty.snapshot({ ptyId }).then(({ bytes }) => {
            if (cancelled) return;
            if (bytes.length > 0) {
              term.write(bytes);
              term.write(RESET_MODES);
            }
            gate.release(writeToTerm);
          });
        } else {
          gate.release(writeToTerm);
        }
      } else {
        /**
         * Replay a restored transcript before anything else is written.
         *
         * Read, not consumed. Taking it destructively meant a second mount
         * under StrictMode saw nothing to replay, and the auto-start below
         * read "no replay" as "brand new" and revived a shell the user never
         * asked for.
         */
        const replay = useTerminalStore.getState().peekReplay(session.id);
        if (replay && replay.length > 0) {
          term.write(replay);
          term.write(RESET_MODES);
        }
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
          // A shell's name now comes from the process tree (Theme E), not
          // from reconstructing a command line out of keystrokes — zsh's
          // application-cursor mode made that reconstruction wrong by
          // construction (an arrow key's `ESC O A` decoded as literal `A`).
          //
          // `data` also carries xterm's own DEC focus-report bytes
          // (`ESC[I`/`ESC[O]`) whenever the hidden textarea gains or loses
          // DOM focus — including the programmatic `.focus()` below that
          // fires just from selecting this session in the sidebar. Those
          // aren't the user typing, so they must not clear the glyph.
          if (session.kind !== 'shell' && !isXtermFocusReport(data)) {
            // Typing at an agent answers the question the "waiting" glyph is
            // asking, so the glyph drops back to idle on the first keystroke
            // rather than sitting there until the next footer repaint proves
            // it stale. The detector re-arms on the very next chunk of output.
            useTerminalStore.getState().setActivity(session.id, undefined);
          }
          return;
        }
        if (stateRef.current === 'starting' || stateRef.current === 'unavailable') return;
        // A dead pane stays mounted (FAB tabs in particular sit `exited`
        // unattended while the user works elsewhere), and its xterm instance
        // can still have DEC focus-tracking latched on from whatever TUI was
        // running. Switching tabs or Cmd-Tabbing away fires a focus/blur
        // report through this same `onData` stream — that's not the user
        // asking to wake this session, so it must not revive one.
        if (isXtermFocusReport(data)) return;
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
      cancelled = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (cwdTimer) clearTimeout(cwdTimer);
      dataSub?.dispose();
      links.dispose();
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
  const exitCode = useTerminalStore((s) => s.exitCodes[session.id]);
  const { agents } = useAgents();
  const agent = session.kind === 'agent' ? agents.find((a) => a.id === session.agentId) : undefined;
  const phase = sessionPhase(session, connectionState);

  useEffect(() => {
    if (!active || !ready || !autoFocus) return;
    if (useTerminalStore.getState().suppressAutoFocus) {
      useTerminalStore.getState().clearSuppressAutoFocus();
      return;
    }
    termRef.current?.focus();
  }, [active, ready, autoFocus, focusSignal]);

  return (
    <div
      className={`${layoutClassName ?? 'absolute inset-0'} flex flex-col ${active ? '' : 'invisible'}`}
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

      {phase === 'ended' ? (
        <EndedStrip
          exitCode={exitCode}
          resume={agent?.resume}
          onStartShell={() => {
            if (termRef.current) {
              void start(termRef.current.cols, termRef.current.rows, undefined);
            }
          }}
          onResume={() => {
            if (termRef.current && agent && agent.resume) {
              void start(
                termRef.current.cols,
                termRef.current.rows,
                agentInput({ ...agent, args: agent.resume }),
              );
            }
          }}
        />
      ) : null}
    </div>
  );
}
