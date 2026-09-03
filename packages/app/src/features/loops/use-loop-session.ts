import {
  composeLoopPrompt,
  loopModelArgs,
  type LoopDefinition,
  type LoopModel,
  type LoopSchedule,
} from '@midnite/studio-shared';
import { useCallback } from 'react';

import { recordLoopStart, recordLoopStop } from './use-loop-runs';
import { bridge } from '../../services/bridge';
import { startAgent } from '../terminal/start-agent';
import { sessionPhase, useTerminalStore } from '../terminal/terminal-store';
import { useUiStore, type FabTab } from '../../store/ui-store';

/**
 * How long a stopped loop is given to notice the interrupt before the pty is
 * killed. Long enough for a `claude` mid-write to unwind its own turn, short
 * enough that Stop still feels like a button and not a request.
 */
const INTERRUPT_GRACE_MS = 300;

/** Ctrl+C, as the bytes a pty actually reads. */
const INTERRUPT = '\x03';

export type LoopSessionControls = {
  start: () => void;
  stop: () => void;
};

/**
 * Start and Stop for one loop tab.
 *
 * The stale-closure bug this phase exists to fix is gone by construction:
 * `startAgent` *returns* the session it created, so the tab records that id
 * directly instead of guessing at `sessions[length - 1]` from a snapshot taken
 * before the call. Nothing here reads the session list, so nothing here can
 * read a stale one.
 */
export function useLoopSession(
  loop: LoopDefinition,
  options: {
    repoId: string | null;
    cwd: string | null;
    basePrompt: string;
    checkedModifierIds: string[];
    /** choiceId → optionId, for this loop's radio groups. */
    choiceIds: Record<string, string>;
    /** The working window, or `null` when the loop is not scheduled. */
    schedule: LoopSchedule | null;
    /**
     * Which provider actually runs: the composer's pick, resolved against the
     * live roster by the caller, or the loop's own declared `agentId`.
     *
     * Passed in rather than read off `loop` — the tab's provider select is
     * exactly the "per-tab agent picker" `LoopDefinition.agentId`'s own
     * comment says the field exists to allow, and a launcher that kept reading
     * the declaration would ignore it.
     */
    agentId: string;
    /** Which Claude to launch — a `--model` flag, never a prompt fragment. */
    model: LoopModel;
    extras: string;
    /**
     * What the loop's agent is actually typed as at the shell.
     *
     * Resolved from the roster by the caller rather than assumed to equal
     * `agentId`: they coincide for `claude`, which is the only agent this
     * phase runs, but not in general — `cursor`'s command is `agent` — and
     * `agents.json` lets a user rename any of them. Assuming the id would
     * have shipped a bug that only appears once the deferred agent picker
     * lands, which is the worst time to find it.
     */
    command: string;
  },
): LoopSessionControls {
  const {
    repoId,
    cwd,
    basePrompt,
    checkedModifierIds,
    choiceIds,
    schedule,
    agentId,
    model,
    extras,
    command,
  } = options;
  const tab = loop.id as FabTab;

  const start = useCallback(() => {
    if (!repoId || !cwd) return;
    const ui = useUiStore.getState();

    /*
      The session this tab is leaving behind, if any. It is NOT closed here:
      whoever is reading its transcript would have it yanked mid-sentence.
      It parks in `fabPrevSessions` — invisible to every surface — and the tab
      strip closes it when the user navigates away. One slot per tab, so this
      cannot accumulate.
    */
    const outgoing = ui.fabSessions[tab];
    if (outgoing !== undefined) {
      const stale = ui.fabPrevSessions[tab];
      if (stale !== undefined && stale !== outgoing) {
        useTerminalStore.getState().closeSession(stale);
      }
      ui.setFabPrevSession(tab, outgoing);
    }

    const composedPrompt = composeLoopPrompt(basePrompt, loop, {
      modifierIds: checkedModifierIds,
      choiceIds,
      schedule,
      extras,
    });

    const session = startAgent({
      repoId,
      cwd,
      title: loop.label,
      prompt: composedPrompt,
      agentId,
      command,
      // Empty for `'default'`, and empty for any agent whose CLI has no
      // `--model` — see `loopModelArgs`.
      extraArgs: loopModelArgs(agentId, model),
      surface: 'fab',
      // The explicit Start press IS the confirmation the withheld Return
      // normally collects — see `startAgent`'s own note.
      autoSend: true,
    });

    ui.setFabSession(tab, session.id);
    void recordLoopStart({
      loopId: loop.id,
      sessionId: session.id,
      composedPrompt,
      checkedModifierIds,
      model,
    });
  }, [
    repoId,
    cwd,
    basePrompt,
    checkedModifierIds,
    choiceIds,
    schedule,
    agentId,
    model,
    extras,
    command,
    loop,
    tab,
  ]);

  const stop = useCallback(() => {
    const sessionId = useUiStore.getState().fabSessions[tab];
    if (sessionId === undefined) return;

    /*
      Interrupt, then sleep. The kill `sleepSession` does is honest but abrupt;
      a loop part-way through a `git` write deserves the chance to unwind that
      Ctrl+C gives it.

      The ledger row is finalised as `stopped` and AWAITED before the interrupt
      goes out. Main finalises off the pty's own exit, so an agent that dies
      immediately on Ctrl+C would otherwise win the race and history would say
      the loop died rather than that you stopped it. `stopLoopRun` and the exit
      hook share one mutation lock in main, so whichever arrives second finds
      the record already finalised and does nothing.
    */
    void (async () => {
      await recordLoopStop(sessionId);

      /*
        Straight at the pty, not through `queueInput`: pending input is only
        read when a pty STARTS (see `use-terminal-ipc.ts`), and this one is
        already running. A session with no bound pty has nothing to interrupt
        and falls through to the sleep below.
      */
      const ptyId = useTerminalStore.getState().ptyIds[sessionId];
      if (ptyId !== undefined) bridge()?.pty.input({ ptyId, data: INTERRUPT });

      await new Promise((resolve) => setTimeout(resolve, INTERRUPT_GRACE_MS));

      /*
        Re-read, and ask the phase rather than the flag. A loop that took the
        interrupt and exited inside the grace window has `asleep` UNDEFINED and
        a state of `exited` — checking `asleep !== true` would wave it through
        and persist `asleep: true` over a session that genuinely ended, which
        is the exact outcome sleeping-the-dead is meant to avoid.
      */
      const current = useTerminalStore.getState();
      const session = current.sessions.find((s) => s.id === sessionId);
      if (session && sessionPhase(session, current.states[sessionId]) === 'live') {
        current.sleepSession(sessionId);
      }
    })();
  }, [tab]);

  return { start, stop };
}
