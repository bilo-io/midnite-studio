import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useState } from 'react';

import { bridge } from '@midnite/studio-frame';

/**
 * A terminal attached to a session another app's broker serves (Phase 113 Theme O slice 4) — what an
 * app with no pty server of its own (Coder) shows for a live row. Studio never mounts it: its own
 * terminal pane hands a session off between the panel and the Sessions view.
 *
 * Attach, never spawn: it subscribes this window to the pty, writes the broker's snapshot, then streams
 * output and sends keystrokes and resizes. Bytes that arrive while the snapshot is in flight are held
 * and written after it, so nothing shows twice or out of order. Closing the pane only detaches — the
 * session belongs to the app that started it and keeps running. DOM renderer, no WebGL.
 */
export function GuestTerminal({ ptyId, title }: { ptyId: string; title: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [exited, setExited] = useState<number | null>(null);

  useEffect(() => {
    const el = container.current;
    const api = bridge();
    if (!el || !api) return undefined;
    const term = new Terminal({ convertEol: false, cursorBlink: true, fontSize: 12, scrollback: 5000 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);

    let replayed = false;
    const held: Uint8Array[] = [];
    api.pty.subscribe({ ptyId });
    const offData = api.pty.onData((event) => {
      if (event.ptyId !== ptyId) return;
      if (replayed) term.write(event.data);
      else held.push(event.data);
    });
    const offExit = api.pty.onExit((event) => {
      if (event.ptyId === ptyId) setExited(event.exitCode);
    });
    void api.pty.snapshot({ ptyId }).then(({ bytes }) => {
      term.write(bytes);
      replayed = true;
      for (const chunk of held.splice(0)) term.write(chunk);
    });

    const input = term.onData((data) => api.pty.input({ ptyId, data }));
    const resize = () => {
      try {
        fit.fit();
      } catch {
        return; // Not laid out yet (a hidden pane, jsdom): the next resize fits it.
      }
      if (term.cols > 0 && term.rows > 0) api.pty.resize({ ptyId, cols: term.cols, rows: term.rows });
    };
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(el);

    return () => {
      observer?.disconnect();
      input.dispose();
      offData();
      offExit();
      api.pty.unsubscribe({ ptyId });
      term.dispose();
    };
  }, [ptyId]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="guest-terminal" aria-label={`Terminal: ${title}`}>
      <div ref={container} className="min-h-0 flex-1 bg-black p-1" />
      {exited !== null ? (
        <p role="status" className="shrink-0 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          This session ended (exit {exited}).
        </p>
      ) : null}
    </div>
  );
}
