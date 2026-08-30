import type { TerminalSession } from '@midnite/studio-shared';
import { useCallback, useEffect, useRef } from 'react';

import { bridge } from '../../services/bridge';
import { useTerminalStore, type ConnectionState } from './terminal-store';

export type { ConnectionState };

/**
 * One session's pty.
 *
 * Keyed by `sessionId` rather than owning "the" terminal: several of these run
 * at once now, one per mounted xterm, and each filters the shared `pty:data`
 * stream down to its own id.
 *
 * There is no longer a kill-on-cwd-change effect. A session is created against
 * a directory explicitly and stays there; the old effect not only killed the
 * shell when the selected worktree changed, it never restarted one — `start()`
 * is reached only from the panel's deferred-open path, which early-returns once
 * the terminal exists. The visible symptom was a dead pane after switching
 * worktree.
 */
export function useTerminalIpc(session: TerminalSession, onData: (bytes: Uint8Array) => void) {
  const ptyId = useTerminalStore((s) => s.ptyIds[session.id]);
  const connectionState = useTerminalStore((s) => s.states[session.id] ?? 'idle');
  const error = useTerminalStore((s) => s.errors[session.id]);

  // The data handler changes identity on every render of the consumer; keeping
  // it in a ref means the IPC subscription is created once and never churns.
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  // Read the live pty id inside callbacks without making them change identity.
  const ptyIdRef = useRef<string | undefined>(ptyId);
  ptyIdRef.current = ptyId;

  useEffect(() => {
    const api = bridge();
    if (!api) return;

    const offData = api.pty.onData(({ ptyId: id, data }) => {
      if (ptyIdRef.current === id) onDataRef.current(data);
    });
    const offExit = api.pty.onExit(({ ptyId: id, exitCode }) => {
      if (ptyIdRef.current !== id) return;
      const store = useTerminalStore.getState();
      store.setExitCode(session.id, exitCode);
      store.unbindPty(session.id);
      store.setState(session.id, 'exited');
      /*
        The dead shell's directory dies with it. A revive respawns at
        `session.cwd` (below), so a `liveCwd` left over from the last process
        would have the header naming a directory the new shell is not in — and,
        through `resolveRepoForPath`, a repository it was never in.
      */
      store.setLiveCwd(session.id, undefined);
      /*
        And so does what was running in it. `undefined` restores *never probed*
        rather than asserting `null`: a revived session re-runs its agent, and a
        stale `null` would have the row show a terminal glyph over it until the
        next probe landed.
      */
      store.setLiveAgentId(session.id, undefined);
    });
    /*
      What is actually running in this pty, from main's process probe. Arrives
      only on a change, so there is nothing to throttle here.
    */
    const offAgent = api.pty.onAgentChanged(({ ptyId: id, agentId }) => {
      if (ptyIdRef.current !== id) return;
      useTerminalStore.getState().setLiveAgentId(session.id, agentId);
    });
    /*
      What the shell's foreground process is, from main's `ps stat` probe
      (Theme E) — replacing the keystroke-reconstruction naming that got
      arrow-key sequences wrong. A non-null command also names a SHELL
      session; an agent's name comes from its own OSC title instead, so this
      never touches `autoNames` for one. `null` updates only `foregroundCommand`
      (read by the row's close-confirm) — a bare-prompt answer holds the
      session's displayed name rather than clearing it.
    */
    const offCommand = api.pty.onCommandChanged(({ ptyId: id, command }) => {
      if (ptyIdRef.current !== id) return;
      const store = useTerminalStore.getState();
      store.setForegroundCommand(session.id, command);
      if (command && session.kind === 'shell') store.setAutoName(session.id, command);
    });
    /*
      The activity guess itself, from main's single `ptyData` send site
      (Theme G) — never computed here. `activity: null` is the detector's
      explicit "nothing to say" (no marker set, or one disabled after
      tripping its time budget); `setActivity`'s own `undefined` clears it
      back to that same "not spoken" state the row draws as the unknown mark.
    */
    const offActivity = api.pty.onActivity(({ ptyId: id, activity }) => {
      if (ptyIdRef.current !== id) return;
      useTerminalStore.getState().setActivity(session.id, activity ?? undefined);
    });

    return () => {
      offData();
      offExit();
      offAgent();
      offCommand();
      offActivity();
    };
  }, [session.id, session.kind]);

  /**
   * Start a shell for this session. Safe to call repeatedly — a live one wins.
   *
   * For an agent session the command is handed to main as `initialInput` rather
   * than spawned directly: a login shell resolves nvm- and asdf-managed
   * binaries the way the user's own terminal does, and leaves them at a prompt
   * when the agent exits instead of at a dead pane.
   */
  const start = useCallback(
    async (cols: number, rows: number, initialInput?: string) => {
      const api = bridge();
      if (!api) return;

      const store = useTerminalStore.getState();
      if (store.ptyIds[session.id]) return;
      /*
        `ptyIds` alone is not enough: it is only written once `pty.create` has
        RESOLVED, so two calls in the same tick both see it empty and both spawn
        a shell. The second `bindPty` then overwrites the first, orphaning a
        live process nothing holds an id for — it is never killed, and it never
        appears in the session list.
        `starting` is set synchronously below, so it is the marker that covers
        the await. StrictMode's double-invoked mount effect made this happen on
        every single terminal opened under the dev server, which is how the app
        is run day to day.
      */
      if (store.states[session.id] === 'starting') return;

      store.awakeSession(session.id);
      store.setState(session.id, 'starting');
      const result = await api.pty.create({
        sessionId: session.id,
        kind: session.kind,
        ...(session.agentId === undefined ? {} : { agentId: session.agentId }),
        repoId: session.repoId,
        cwd: session.cwd,
        cols,
        rows,
        ...(initialInput === undefined ? {} : { initialInput }),
      });

      if (!result.ok) {
        // node-pty failing to load is not a crash — the pane says so and the
        // rest of the app is untouched.
        useTerminalStore.getState().setState(session.id, 'unavailable', result.message);
        return;
      }

      const next = useTerminalStore.getState();
      next.bindPty(session.id, result.ptyId);
      next.setState(session.id, 'open');
      // A queued paste (the Agent page's uninstall command) is spent the
      // moment a pty has received it. Without this, reviving the session
      // after an `exit` would re-type a destructive command at the fresh
      // prompt. Agent commands are different on purpose: they come from
      // `agentInput`, not this map, and SHOULD re-run on revive.
      next.clearPendingInput(session.id);
    },
    [session.id, session.kind, session.agentId, session.repoId, session.cwd],
  );

  const sendInput = useCallback((data: string) => {
    const id = ptyIdRef.current;
    if (id) bridge()?.pty.input({ ptyId: id, data });
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    const id = ptyIdRef.current;
    if (id) bridge()?.pty.resize({ ptyId: id, cols, rows });
  }, []);

  return { connectionState, error, start, sendInput, sendResize, hasPty: Boolean(ptyId) };
}
