import { useCallback, useEffect, useRef, useState } from 'react';

import { bridge } from '../../services/bridge';

export type ConnectionState = 'idle' | 'starting' | 'open' | 'exited' | 'unavailable';

/**
 * Owns one pty session for the terminal panel.
 *
 * The `{ connectionState, sendInput, sendResize }` shape is deliberate — it is
 * the same contract midnite's web terminal uses, so the xterm component below
 * is a straight adaptation rather than a rewrite, and the transport (IPC here,
 * a WebSocket there) stays the only difference.
 */
export function useTerminalIpc(cwd: string | null, onData: (bytes: Uint8Array) => void) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const ptyIdRef = useRef<string | null>(null);

  // The data handler changes identity on every render of the consumer; keeping
  // it in a ref means the IPC subscription is created once and never churns.
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    const api = bridge();
    if (!api) return;

    const offData = api.pty.onData(({ ptyId, data }) => {
      if (ptyIdRef.current === ptyId) onDataRef.current(data);
    });
    const offExit = api.pty.onExit(({ ptyId }) => {
      if (ptyIdRef.current !== ptyId) return;
      ptyIdRef.current = null;
      setConnectionState('exited');
    });

    return () => {
      offData();
      offExit();
    };
  }, []);

  /** Start a shell. Safe to call repeatedly — a live session is reused. */
  const start = useCallback(
    async (cols: number, rows: number) => {
      const api = bridge();
      if (!api || !cwd) return;
      if (ptyIdRef.current) return;

      setConnectionState('starting');
      const result = await api.pty.create({ cwd, cols, rows });

      if (!result.ok) {
        // node-pty failing to load is not a crash — the panel says so and the
        // rest of the app is untouched.
        setConnectionState('unavailable');
        setError(result.message);
        return;
      }

      ptyIdRef.current = result.ptyId;
      setError(null);
      setConnectionState('open');
    },
    [cwd],
  );

  const sendInput = useCallback((data: string) => {
    const id = ptyIdRef.current;
    if (id) bridge()?.pty.input({ ptyId: id, data });
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    const id = ptyIdRef.current;
    if (id) bridge()?.pty.resize({ ptyId: id, cols, rows });
  }, []);

  const kill = useCallback(() => {
    const id = ptyIdRef.current;
    if (!id) return;
    ptyIdRef.current = null;
    bridge()?.pty.kill({ ptyId: id });
    setConnectionState('idle');
  }, []);

  /**
   * A shell is bound to the directory it was started in, so switching worktree
   * has to start a new one rather than `cd` behind the user's back — they may
   * be mid-command, and rewriting their shell's state under them is worse than
   * a fresh prompt.
   */
  useEffect(() => {
    if (ptyIdRef.current) kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on cwd only
  }, [cwd]);

  return { connectionState, error, start, sendInput, sendResize, kill };
}
