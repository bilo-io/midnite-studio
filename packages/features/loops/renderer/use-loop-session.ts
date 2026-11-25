import {
  composeLoopPrompt,
  guardFixPrompt,
  loopEffortArgs,
  loopModelArgs,
  type LoopDefinition,
  type LoopEffort,
  type LoopModel,
  type LoopSchedule,
  type SecurityFinding,
} from '@midnite/studio-shared';
import { useCallback } from 'react';

import { useLoopsHost } from './host';
import { recordLoopStart } from './use-loop-runs';

export type LoopSessionControls = {
  /** Dispatch one session of this loop. Every press is a new session — nothing it started before is touched. */
  start: () => void;
  /** Starts one agent run scoped to a single finding (Guard's *Fix with agent*); never a repeating loop. */
  fixFinding: (
    finding: Pick<SecurityFinding, 'fingerprint' | 'severity' | 'title' | 'detail' | 'evidence'>,
  ) => void;
};

/**
 * Dispatch for one loop tab.
 *
 * The Loops panel is only the form now: a press spawns a session tagged with
 * the loop's id and hands it to the terminal panel, which lists it under its
 * "Loops" group and is where it is watched, slept or closed. So one loop can
 * run several sessions at once, each pointed at a different feature, and there
 * is no Stop here — ending a session is the terminal list's job, as it is for
 * every other session.
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
     */
    agentId: string;
    /** #1699: the custom agent to run as (`agentId` is its base); its own model replaces `model`/`effort`. */
    agentProfileId?: string;
    /** Which Claude to launch — a `--model` flag, never a prompt fragment. */
    model: LoopModel;
    /** `claude --effort`; `'default'` passes no flag. */
    effort?: LoopEffort;
    extras: string;
    /**
     * What the loop's agent is actually typed as at the shell — resolved from
     * the roster by the caller rather than assumed to equal `agentId`
     * (`cursor`'s command is `agent`, and `agents.json` can rename any of them).
     */
    command: string;
    /** modifierId → the skill picked in that option's skill field. */
    skills?: Record<string, string>;
    /** Contributor usernames to restrict PR review to. */
    reviewUsers?: readonly string[];
    /** Rotate subagents at this percentage of their context. */
    autoRotatePercent?: number;
    /** The "Loop" switch — `false` drops `/loop` and runs once. */
    repeat?: boolean;
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
    agentProfileId,
    model,
    effort = 'default',
    extras,
    command,
    skills,
    reviewUsers,
    autoRotatePercent,
    repeat,
  } = options;
  const host = useLoopsHost();

  const start = useCallback(() => {
    if (!repoId || !cwd) return;

    const composedPrompt = composeLoopPrompt(basePrompt, loop, {
      modifierIds: checkedModifierIds,
      choiceIds,
      schedule,
      extras,
      ...(skills !== undefined ? { skills } : {}),
      ...(reviewUsers !== undefined ? { reviewUsers } : {}),
      ...(autoRotatePercent !== undefined ? { autoRotatePercent } : {}),
      ...(repeat !== undefined ? { repeat } : {}),
    });

    /*
      The flag this run actually carries — empty for `'default'`, and empty for
      any provider whose CLI has no `--model` (see `loopModelArgs`). Computed
      once, because the ledger below has to agree with it.
    */
    const modelArgs = agentProfileId ? [] : loopModelArgs(agentId, model);
    const effortArgs = agentProfileId ? [] : loopEffortArgs(agentId, effort);

    void host
      .startAgent({
        repoId,
        cwd,
        title: loop.label,
        prompt: composedPrompt,
        agentId,
        command,
        extraArgs: [...modelArgs, ...effortArgs],
        loopId: loop.id,
        ...(agentProfileId === undefined ? {} : { agentProfileId }),
        ...launchLabel(modelArgs, model, effortArgs, effort),
        // The explicit press IS the confirmation the withheld Return
        // normally collects — see `startAgent`'s own note.
        autoSend: true,
      })
      .then((sessionId) => {
        void recordLoopStart({
          loopId: loop.id,
          sessionId,
          composedPrompt,
          checkedModifierIds,
          // Absent, not `'default'`, when no flag went out.
          ...(modelArgs.length > 0 ? { model } : {}),
        });
      })
      // A start the host refused has already been reported; nothing was dispatched to record.
      .catch(() => undefined);
  }, [
    repoId,
    cwd,
    basePrompt,
    checkedModifierIds,
    choiceIds,
    schedule,
    agentId,
    agentProfileId,
    model,
    effort,
    extras,
    command,
    skills,
    reviewUsers,
    autoRotatePercent,
    repeat,
    loop,
    host,
  ]);

  const fixFinding = useCallback(
    (
      finding: Pick<SecurityFinding, 'fingerprint' | 'severity' | 'title' | 'detail' | 'evidence'>,
    ) => {
      if (!repoId || !cwd) return;
      const composedPrompt = guardFixPrompt(finding);
      const modelArgs = agentProfileId ? [] : loopModelArgs(agentId, model);
      const effortArgs = agentProfileId ? [] : loopEffortArgs(agentId, effort);
      void host
        .startAgent({
          repoId,
          cwd,
          title: `${loop.label}: fix`,
          prompt: composedPrompt,
          agentId,
          command,
          extraArgs: [...modelArgs, ...effortArgs],
          loopId: loop.id,
          ...(agentProfileId === undefined ? {} : { agentProfileId }),
          ...launchLabel(modelArgs, model, effortArgs, effort),
          autoSend: true,
        })
        .then((sessionId) => {
          void recordLoopStart({
            loopId: loop.id,
            sessionId,
            composedPrompt,
            checkedModifierIds: [],
            findingFingerprint: finding.fingerprint,
            ...(modelArgs.length > 0 ? { model } : {}),
          });
        })
        .catch(() => undefined);
    },
    [repoId, cwd, agentId, agentProfileId, model, effort, command, loop, host],
  );

  return { start, fixFinding };
}

/** The model and effort ids the row label shows — only those that actually went out as flags. */
function launchLabel(
  modelArgs: readonly string[],
  model: LoopModel,
  effortArgs: readonly string[],
  effort: LoopEffort,
): { loopModel?: string; loopEffort?: string } {
  return {
    ...(modelArgs.length > 0 ? { loopModel: model } : {}),
    ...(effortArgs.length > 0 ? { loopEffort: effort } : {}),
  };
}
