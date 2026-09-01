import { collapseCarriageReturns, stripAnsi } from '@midnite/studio-shared';
import { useEffect, useRef, useState } from 'react';

import { bridge } from '../../services/bridge';

/**
 * A running council member (or the synthesizer) has no interactive terminal
 * panel of its own — Q3's scope decision keeps it out of the Terminal/Sessions
 * sidebar entirely — so this is a plain, read-only, append-only text view over
 * the same raw `pty.onData`/`pty.onExit` stream `TerminalView` subscribes to,
 * filtered by `ptyId`. Not a terminal emulator: the cleanup here is the same
 * best-effort ANSI-strip/carriage-return-collapse `council-output.ts` applies
 * server-side, done again client-side for a live preview, while the settled
 * value (returned once the run reaches a terminal member status) is always
 * the server's own cleaned text, not this component's guess.
 */
export function CouncilLiveOutput({ ptyId }: { ptyId: string }) {
  const [text, setText] = useState('');
  const bufferRef = useRef('');
  const decoderRef = useRef(new TextDecoder());
  const containerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const api = bridge();
    if (!api) return;

    bufferRef.current = '';
    decoderRef.current = new TextDecoder();
    setText('');

    void api.pty.snapshot({ ptyId }).then(({ bytes }) => {
      if (bytes.length === 0) return;
      bufferRef.current += decoderRef.current.decode(bytes, { stream: true });
      setText(collapseCarriageReturns(stripAnsi(bufferRef.current)));
    });

    const offData = api.pty.onData(({ ptyId: id, data }) => {
      if (id !== ptyId) return;
      bufferRef.current += decoderRef.current.decode(data, { stream: true });
      setText(collapseCarriageReturns(stripAnsi(bufferRef.current)));
    });

    return () => {
      offData();
    };
  }, [ptyId]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <pre
      ref={containerRef}
      className="h-full min-h-0 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs text-foreground/90"
    >
      {text.length > 0 ? text : <span className="text-muted-foreground">Waiting for output…</span>}
    </pre>
  );
}
