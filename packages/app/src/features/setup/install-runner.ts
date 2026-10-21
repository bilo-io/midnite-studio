import { useCallback, useEffect, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { SetupProbeResult } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import { submitCommand } from '../terminal/submit-command';
import { useTerminalStore } from '../terminal/terminal-store';
import { useSetupStore } from './setup-store';

/**
 * The setup overlay's probe and install runner (Phase 98 Theme D).
 *
 * Installs are never run by main. The runner types one line into a fresh,
 * visible integrated-terminal session (`submitCommand`, the same path Settings
 * ▸ Health's Install buttons use), steps the overlay aside so a sudo prompt
 * can be answered, and re-probes when that command is done — and, through the
 * probe query, whenever the window regains focus, which covers an install
 * finished in some other terminal.
 */

// --- probe ------------------------------------------------------------------

export type SetupProbeMap = Readonly<Record<string, SetupProbeResult>>;

export const SETUP_PROBE_KEY = 'setup-probe';

/** Catalogue ids → their probe rows, re-probed on window focus. Empty without a bridge. */
export function useSetupProbe(ids: readonly string[]) {
  return useQuery({
    queryKey: [SETUP_PROBE_KEY, ...ids],
    queryFn: async (): Promise<SetupProbeMap> => {
      const setup = window.midniteStudio?.setup;
      if (!setup || ids.length === 0) return {};
      const { results } = await setup.probe({ ids: [...ids] });
      return Object.fromEntries(results.map((result) => [result.id, result]));
    },
    staleTime: 0,
    // The app-wide default is off; a tool installed in another terminal while
    // setup was in the background is exactly what focus should pick up.
    refetchOnWindowFocus: true,
  });
}

// --- when an install is done --------------------------------------------------

export type InstallWatch = { sawCommand: boolean };

export type InstallSnapshot = {
  /** Whether the session still exists — closing its tab ends the watch. */
  present: boolean;
  /** `pty:command-changed`'s foreground command: `undefined` before the first report, `null` at a bare prompt. */
  command: string | null | undefined;
  /** Set once the session's shell itself has exited. */
  exitCode: number | undefined;
};

/**
 * One step of "is the install command done yet?", fed from the terminal store.
 *
 * Done once the shell went from running something back to a bare prompt, or
 * the shell exited, or its tab was closed. A `null` command before anything
 * was seen running is the prompt the queued line has not reached yet, not a
 * finish — so it takes a non-null command first.
 */
export function stepInstallWatch(
  watch: InstallWatch,
  snapshot: InstallSnapshot,
): { watch: InstallWatch; done: boolean } {
  if (!snapshot.present || snapshot.exitCode !== undefined) return { watch, done: true };
  if (snapshot.command) return { watch: { sawCommand: true }, done: false };
  return { watch, done: watch.sawCommand && snapshot.command === null };
}

/** Open the terminal on the install's session and move the overlay out of its way. */
export function revealInstallTerminal(sessionId: string | null): void {
  useUiStore.getState().setTerminalOpen(true);
  if (sessionId) useTerminalStore.getState().setActive(sessionId);
  useSetupStore.getState().stepAside();
}

/**
 * Run an install line in a visible terminal and call `onFinished` when it is
 * done. One install at a time per caller: `running` is true from `run` until
 * the watch reports done.
 */
export function useInstallRunner(onFinished: () => void) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  useEffect(() => {
    if (!sessionId) return;
    let watch: InstallWatch = { sawCommand: false };
    const check = (state: ReturnType<typeof useTerminalStore.getState>): void => {
      const step = stepInstallWatch(watch, {
        present: state.sessions.some((session) => session.id === sessionId),
        command: state.foregroundCommand[sessionId],
        exitCode: state.exitCodes[sessionId],
      });
      watch = step.watch;
      if (!step.done) return;
      unsubscribe();
      setSessionId(null);
      onFinishedRef.current();
    };
    const unsubscribe = useTerminalStore.subscribe(check);
    check(useTerminalStore.getState());
    return unsubscribe;
  }, [sessionId]);

  const run = useCallback((command: string, title: string): void => {
    const id = submitCommand(command, title);
    if (!id) return;
    setSessionId(id);
    revealInstallTerminal(id);
  }, []);

  return {
    run,
    running: sessionId !== null,
    sessionId,
    reveal: () => revealInstallTerminal(sessionId),
  };
}
