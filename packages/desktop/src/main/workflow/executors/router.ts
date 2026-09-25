import {
  WORKFLOW_AGENT_DONE_MARKER,
  WORKFLOW_ROUTER_DEFAULT_PORT_ID,
  type WorkflowRouterCase,
} from '@midnite/studio-shared';

import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { evaluateWorkflowCondition } from './condition';
import { defaultNodePtyDeps, type NodePtyDeps } from './node-pty-deps';
import { runAgentToDoneMarker } from './agent';

/**
 * The `route=<id>` extension of the agent node's own done marker (Phase 97
 * Theme F) — the same sentinel line (`WORKFLOW_AGENT_DONE_MARKER`), a
 * different suffix grammar than the plain `agent` node's `ok`/`fail`,
 * because a router's classifier answers "which case", not "did it work".
 * `\S+` rather than a closed alternation: the set of valid ids is a runtime
 * fact about this node's own `config.cases`, checked against after the
 * match (an id naming no configured case routes to `default` — see
 * `createRouterExecutor` below), not something a regex can enumerate.
 */
export const WORKFLOW_ROUTER_DONE_MARKER_PATTERN = new RegExp(`${WORKFLOW_AGENT_DONE_MARKER}:\\s*route=(\\S+)`);

/**
 * The instruction appended to an agent-label router's own prompt — mirrors
 * `agentNodeDonePrompt`'s shape, but names the closed set of case ids the
 * agent may choose from instead of a bare `ok`/`fail`. Exported for a test to
 * assert the exact wording, once, the same reason `agentNodeDonePrompt` is
 * its own function rather than inlined.
 */
export function routerAgentLabelPrompt(prompt: string, cases: readonly WorkflowRouterCase[]): string {
  const options = cases.map((routerCase) => `"${routerCase.id}" (${routerCase.label})`).join(', ');
  return `${prompt}\n\nChoose exactly one of these routes: ${options}. When you have decided, print a line containing exactly "${WORKFLOW_AGENT_DONE_MARKER}: route=<id>", using exactly one of those ids, then stop.`;
}

/**
 * The `router` node (Phase 97 Theme F) — one comparison-driven or
 * agent-driven pick among named out-ports, plus the always-present
 * `default` (`WORKFLOW_ROUTER_DEFAULT_PORT_ID`).
 *
 * **Expression mode** is synchronous and reuses `condition.ts`'s own
 * evaluator (`evaluateWorkflowCondition`) case by case, in declared array
 * order — first `when` that holds wins, exactly the phase doc's own
 * "first-match" rule. A case with no `when` (an in-progress edit, or an
 * agent-label-only case wired into an expression-mode router by mistake)
 * never matches; it is `validateWorkflow`'s job to flag that as unrunnable,
 * not this executor's to guess at.
 *
 * **Agent-label mode** reuses `agent.ts`'s `runAgentToDoneMarker` — the same
 * roster-lookup/pty-launch/idle-poll/cancel machinery a plain `agent` node
 * uses, watching for `WORKFLOW_ROUTER_DONE_MARKER_PATTERN` instead of
 * `ok`/`fail`. An id the agent prints that names no configured case routes
 * to `default` rather than the nearest guess — the deterministic half of
 * "the classifier is probabilistic, the allowed routes are deterministic".
 */
export function createRouterExecutor(deps: NodePtyDeps = defaultNodePtyDeps): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'router') return { ok: false, error: 'Not a router node.' };
    const config = node.config;

    if (config.cases.length === 0) return { ok: false, error: 'This router has no cases.' };

    if (config.mode === 'expression') {
      for (const routerCase of config.cases) {
        if (!routerCase.when) continue;
        const result = evaluateWorkflowCondition(routerCase.when, context.upstream);
        if (!result.ok) return { ok: false, error: result.error };
        if (result.passed) {
          return {
            ok: true,
            output: {
              case: routerCase.id,
              reason: {
                mode: 'expression',
                when: { left: result.left, op: routerCase.when.op, right: result.right },
              },
            },
            port: routerCase.id,
          };
        }
      }
      return {
        ok: true,
        output: { case: WORKFLOW_ROUTER_DEFAULT_PORT_ID, reason: { mode: 'default' } },
        port: WORKFLOW_ROUTER_DEFAULT_PORT_ID,
      };
    }

    // 'agent-label'
    const agent = config.agent;
    if (!agent || agent.agentId.trim() === '') return { ok: false, error: 'This router has no agent selected.' };
    if (agent.prompt.trim() === '') return { ok: false, error: 'This router has no prompt.' };

    const knownCaseIds = new Set(config.cases.map((routerCase) => routerCase.id));

    return runAgentToDoneMarker(
      { agentId: agent.agentId, prompt: agent.prompt, model: agent.model },
      node,
      context,
      deps,
      {
        buildPrompt: (prompt) => routerAgentLabelPrompt(prompt, config.cases),
        parseMarker: (bufferText) => {
          const match = WORKFLOW_ROUTER_DONE_MARKER_PATTERN.exec(bufferText);
          return match ? (match[1] as string) : null;
        },
        toOutcome: (label, output) => {
          const settledCase = knownCaseIds.has(label) ? label : WORKFLOW_ROUTER_DEFAULT_PORT_ID;
          return {
            ok: true,
            output: { ...output, case: settledCase, reason: { mode: 'agent-label', label } },
            truncated: output.truncated,
            port: settledCase,
          };
        },
      },
    );
  };
}

export const routerExecutor = createRouterExecutor();
