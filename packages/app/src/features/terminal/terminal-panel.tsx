import { X } from 'lucide-react';

import { IconButton } from '../../components/icon-button';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

import { shouldEscapeTerminal } from '../../services/keybindings/use-keybindings';
import { useUiStore } from '../../store/ui-store';
import { useTerminalIpc } from './use-terminal-ipc';

/**
 * The integrated terminal.
 *
 * Adapted from midnite's web terminal; the transport is IPC rather than a
 * WebSocket, but the two hard-won parts are the same.
 *
 * 1. **Deferred open.** `term.open()` on a 0×0 element leaves xterm's render
 *    service without valid dimensions, and a later scroll or fit throws
 *    "Cannot read properties of undefined (reading 'dimensions')", killing the
 *    panel. The container is 0-height whenever the terminal starts collapsed —
 *    which is always, since it opens on a keystroke — so open is deferred to
 *    the first ResizeObserver callback that reports real dimensions.
 *
 * 2. **safeFit.** Same reasoning for every subsequent fit: bail out unless the
 *    element is measurable, and swallow the throw if it stops being so mid-fit.
 *
 * Rendering: the WebGL addon, not the DOM renderer. Powerline prompts
 * (powerlevel10k et al) use private-use glyphs (U+E0B0…) that none of the
 * macOS system monospace fonts contain; only the webgl/canvas renderers honor
 * `customGlyphs` and draw those shapes themselves, which is how VS Code shows
 * them without a Nerd Font installed. The font stack still leads with common
 * Nerd Fonts so users who have one get its full symbol set.
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

export function TerminalPanel({ cwd }: { cwd: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [ready, setReady] = useState(false);

  const write = useCallback((bytes: Uint8Array) => {
    termRef.current?.write(bytes);
  }, []);

  const { connectionState, error, start, sendInput, sendResize } = useTerminalIpc(cwd, write);

  // Refs so the mount effect can stay dependency-free and run exactly once.
  const sendInputRef = useRef(sendInput);
  sendInputRef.current = sendInput;
  const sendResizeRef = useRef(sendResize);
  sendResizeRef.current = sendResize;
  const startRef = useRef(start);
  startRef.current = start;

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
      // Must load after open() — the addon needs the terminal's element. If the
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
      dataSub = term.onData((data) => sendInputRef.current(data));
      setReady(true);
      void startRef.current(term.cols, term.rows);
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
  }, []);

  // Re-theme in place rather than recreating the terminal — a rebuild would
  // wipe the scrollback and kill the shell.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (termRef.current) termRef.current.options.theme = isDark() ? DARK_THEME : LIGHT_THEME;
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1 text-xs text-muted-foreground">
        <span>Terminal</span>
        <span className="truncate" title={cwd ?? undefined}>
          {cwd ?? 'no worktree selected'}
        </span>
        <StateChip state={connectionState} />
        <IconButton
          icon={X}
          label="Hide terminal"
          size="sm"
          className="ml-auto"
          onClick={() => useUiStore.getState().setTerminalOpen(false)}
        />
      </div>

      {connectionState === 'unavailable' ? (
        <p className="p-3 text-xs text-destructive">
          {error ?? 'The terminal backend is unavailable.'}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 p-1">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {!ready && connectionState !== 'unavailable' ? (
        <p className="shrink-0 px-3 pb-1 text-xs text-muted-foreground">Starting shell…</p>
      ) : null}
    </div>
  );
}

function StateChip({ state }: { state: string }) {
  if (state === 'open') return null;
  const label = state === 'exited' ? 'shell exited' : state;
  return <span className="rounded bg-muted px-1.5 py-px text-[10px] uppercase">{label}</span>;
}
