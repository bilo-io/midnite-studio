import { homedir } from 'node:os';

import {
  WORKFLOW_AGENT_DONE_MARKER_PATTERN,
  agentInteractiveArgs,
  agentNodeDonePrompt,
  formatLoopFailuresBlock,
  isOllamaCloudModelName,
  resolveAgentLaunch,
  shellQuote,
  toAgentPrompt,
  type WorkflowLoopFailure,
} from '@midnite/studio-shared';

import { appendCapped, cleanCapturedOutput } from '../../council-output';
import { readOllamaApiKey } from '../../ipc/secrets-handlers';
import { resolveOllamaBaseUrl } from '../../ollama/client';
import { currentSettings } from '../../settings-mirror';
import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { defaultNodePtyDeps, NODE_PTY_POLL_MS, type NodePtyDeps } from './node-pty-deps';

/**
 * The `agent` node (Phase 95 Theme J) — runs a roster agent **interactively**
 * (not headless, unlike `companion/ask.ts`'s one-shot question) in a real pty,
 * auto-sent, exactly like `script.ts`.
 *
 * **"Done" is activity-idle plus an explicit marker** — the phase doc's own
 * resolved decision, because activity-idle alone is ambiguous for an agent
 * paused on a question of its own (an option sheet, a permission prompt also
 * reads as "not thinking"). `agentNodeDonePrompt` appends the instruction to
 * print {@link WORKFLOW_AGENT_DONE_MARKER_PATTERN} to the node's own prompt;
 * this executor watches every chunk of output for that marker AND polls
 * `activityFor(ptyId)` for `'idle'`, settling only once both are true — so a
 * marker printed mid-turn (quoted by the agent, say) settles nothing on its
 * own, and an agent that goes idle waiting on a permission prompt is not
 * mistaken for done.
 *
 * **Unlike `script.ts`, the shell is never asked to `exit`** — an agent
 * session stays open and interactive after the node completes, exactly like
 * any other agent session in this app (Play, drag-to-skill, Auto-mate): the
 * node's own completion is a judgement this executor makes by watching the
 * transcript, not the pty's own exit. A pty that DOES exit early (the user
 * killed the session, the shell crashed) still settles the node — as a
 * failure, via `onExit` — so a closed session can never leave a node stuck
 * `running` until the outer per-node deadline.
 */

const AGENT_OUTPUT_CAP_BYTES = 200_000;

export type AgentNodeOutput = {
  output: string;
  truncated: boolean;
};

export function createAgentExecutor(deps: NodePtyDeps = defaultNodePtyDeps): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'agent') return { ok: false, error: 'Not an agent node.' };
    const config = node.config;
    if (config.agentId.trim() === '') return { ok: false, error: 'This node has no agent selected.' };
    if (config.prompt.trim() === '') return { ok: false, error: 'This node has no prompt.' };

    const roster = await deps.listAgents();
    const agent = roster.find((a) => a.id === config.agentId);
    if (!agent) return { ok: false, error: `Agent "${config.agentId}" is not in the roster.` };

    // Phase 96 Theme H: an agent node whose agent id is bound to Ollama in
    // Settings ▸ Agent resolves through the same table every other launch
    // path does. When bound, the recipe's own `--model` (or `ollama
    // launch`'s config-file selection) replaces the node's native `--model`
    // field — the two select a model on two different backends, and only
    // one backend is actually running.
    const binding = currentSettings().agentBackends?.[agent.id];
    // Phase 96 Theme F: main-side already, so a cloud-model binding resolves
    // the vault key straight into `authToken` — see the identical comment in
    // `council-runner.ts`.
    const authToken =
      binding?.model && isOllamaCloudModelName(binding.model) ? await readOllamaApiKey() : null;
    const launch = resolveAgentLaunch(agent, binding, resolveOllamaBaseUrl(), authToken ?? undefined);

    // Phase 97 Theme C — "failure carried forward": `{{loop.failures}}` is
    // injected by `workflow-engine.ts`'s `runNode` only for a node sitting
    // inside an active loop body, so this is a no-op for every agent node
    // outside one (which is every agent node in a non-looping workflow).
    const loopContext = context.upstream.loop as { failures?: WorkflowLoopFailure[] } | undefined;
    const promptWithLoopFailures = config.prompt + formatLoopFailuresBlock(loopContext?.failures ?? []);

    const prompt = agentNodeDonePrompt(promptWithLoopFailures);
    const words = [
      launch.command,
      ...(launch.backend === 'ollama' ? launch.argsBefore : config.model ? ['--model', config.model] : []),
      ...agentInteractiveArgs(agent.id),
      shellQuote(toAgentPrompt(prompt, agent.id)),
    ];
    const invocation = words.join(' ');

    const started = await deps.startSession({
      workflowId: context.workflowId,
      runId: context.runId,
      nodeId: node.id,
      kind: 'agent',
      agentId: agent.id,
      nodeLabel: node.label,
      cwd: homedir(),
      initialInput: `${invocation}\r`,
      ...(Object.keys(launch.env).length > 0 ? { env: launch.env } : {}),
      ...(launch.backend === 'ollama' ? { backend: launch.backend, ollamaModel: launch.model } : {}),
    });
    if (!started.ok) return { ok: false, error: started.message };
    await context.reportSessionId(started.session.id);

    return new Promise((resolve) => {
      let buffer = new Uint8Array(0);
      let truncated = false;
      let markerResult: 'ok' | 'fail' | null = null;
      let settled = false;

      const finish = (outcome: NodeOutcome) => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        deps.offPty(started.ptyId);
        resolve(outcome);
      };

      const maybeSettle = () => {
        if (markerResult === null || settled) return;
        if (deps.activityFor(started.ptyId) !== 'idle') return;
        const output: AgentNodeOutput = {
          output: cleanCapturedOutput(new TextDecoder().decode(buffer), invocation),
          truncated,
        };
        finish(
          markerResult === 'ok'
            ? { ok: true, output, truncated }
            : { ok: false, error: 'The agent reported it could not complete this task.' },
        );
      };

      const poll = setInterval(() => {
        if (context.signal.cancelled()) {
          deps.killPty(started.ptyId);
          finish({ ok: false, error: 'Cancelled.' });
          return;
        }
        maybeSettle();
      }, NODE_PTY_POLL_MS);
      poll.unref?.();

      deps.onPty(
        started.ptyId,
        (bytes) => {
          const capped = appendCapped(buffer, bytes, AGENT_OUTPUT_CAP_BYTES);
          buffer = capped.buffer as Uint8Array<ArrayBuffer>;
          truncated = truncated || capped.truncated;

          if (markerResult === null) {
            const match = WORKFLOW_AGENT_DONE_MARKER_PATTERN.exec(new TextDecoder().decode(buffer));
            if (match) markerResult = match[1] === 'fail' ? 'fail' : 'ok';
          }
          maybeSettle();
        },
        () => {
          // The shell ended before this executor decided the node was done —
          // whatever killed it (the accordion group's kill switch, a crash),
          // the node did not finish, so it did not succeed.
          finish({ ok: false, error: 'The session ended before this node finished.' });
        },
      );
    });
  };
}

export const agentExecutor = createAgentExecutor();
