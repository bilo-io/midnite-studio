import {
  createTaintLedger,
  createToolApprovals,
  createToolGuard,
  createToolPolicyStore,
  hookCallToPolicyCall,
  toolPolicyFile,
  type HookInput,
  type ToolApprovals,
  type ToolGuard,
  type ToolPolicyStore,
} from '@midnite/studio-runtime';
import { DEFAULT_TOOL_POLICY, EVENT_CHANNELS, type ToolApprovalAnswerRequest } from '@midnite/studio-shared';

import { recordAudit } from './agent-audit';
import { defaultLogger } from './log';
import { outboundSecrets } from './outbound-secrets';

/**
 * Studio's tool-call policy (Phase 121 Theme B): the runtime's guard over `<userData>/security/tool-policy.json`,
 * with approval cards pushed to every window and the answers coming back through `answerToolApproval`.
 *
 * The overrides file loads asynchronously; until it has, a call is judged by the built-in policy alone (which is
 * the stricter reading: overrides can only add rules). Every private run (Models, Games) gets its own broker so
 * "Approve for this session" means that run; the answer path tries each live broker.
 */

/** The one name the CLI hook script calls over the MCP socket. Not an MCP tool: never listed, never in `MCP_TOOLS`. */
export const POLICY_EVALUATE_TOOL = 'policy.evaluate';

/** Set at boot to `broadcastToAllWindows`; injected so this module (and the MCP server that imports it) never loads `electron`. */
let broadcast: (channel: string, payload: unknown) => void = () => undefined;
let configured = false;
let store: ToolPolicyStore | null = null;
const brokers = new Set<ToolApprovals>();

const lazyStore = {
  policiesFor: (repoPath: string | undefined) => store?.policiesFor(repoPath) ?? [{ source: 'default', policy: DEFAULT_TOOL_POLICY }],
};

function newBroker(): ToolApprovals {
  const broker = createToolApprovals({
    raise: (request) => broadcast(EVENT_CHANNELS.toolApprovalRequested, request),
    resolved: (resolved) => broadcast(EVENT_CHANNELS.toolApprovalResolved, resolved),
    secrets: () => outboundSecrets(),
  });
  brokers.add(broker);
  return broker;
}

let studioGuard: ToolGuard | null = null;

/** The app-wide guard: the global MCP socket and the CLI hook. */
export function getToolGuard(): ToolGuard {
  studioGuard ??= createToolGuard({ store: lazyStore, approvals: newBroker(), taint: createTaintLedger(), record: recordAudit });
  return studioGuard;
}

/**
 * `dispatch.ts`'s hook: judge one call before its handler. Before `configureToolPolicy` has run there is no window to
 * ask and no overrides to read (a bare test, the first moments of boot), so the call is let through; boot configures the
 * policy ahead of the MCP socket, so nothing a socket client sends meets that gap.
 */
export async function checkToolCall(tool: string, input: unknown): Promise<{ allowed: true } | { allowed: false; message: string }> {
  if (!configured) return { allowed: true };
  const verdict = await getToolGuard().check(tool, input);
  return verdict.allowed ? { allowed: true } : { allowed: false, message: verdict.message };
}

/** What a result handed the agent, for the taint ledger. */
export function noteToolResult(tool: string, value: unknown): void {
  if (configured) getToolGuard().note(tool, value);
}

/** A guard for one private run, with its own session approvals; call `release` when the run's server closes. Passes through before boot configures the policy. */
export function createRunToolGuard(): { wrap: ToolGuard['wrap']; release: () => void } {
  if (!configured) return { wrap: (dispatch) => dispatch, release: () => undefined };
  const approvals = newBroker();
  const guard = createToolGuard({ store: lazyStore, approvals, taint: createTaintLedger(), record: recordAudit });
  return { wrap: guard.wrap, release: () => void brokers.delete(approvals) };
}

/** Loads the per-repo overrides. Total: a failure leaves the built-in policy in force. */
export async function configureToolPolicy(userData: string, send: (channel: string, payload: unknown) => void): Promise<void> {
  broadcast = send;
  configured = true;
  try {
    store = await createToolPolicyStore({ file: toolPolicyFile(userData), onError: (error) => defaultLogger.warn(`tool policy: ${String(error)}`) });
  } catch (error) {
    defaultLogger.warn(`tool policy: ${String(error)}`);
  }
}

/** The card's answer. `false` when no live card has that id (already answered, or timed out). */
export function answerToolApproval(request: ToolApprovalAnswerRequest): boolean {
  for (const broker of brokers) if (broker.answer(request.id, request.decision)) return true;
  return false;
}

/** `policy.evaluate`: judge a CLI's `PreToolUse` hook input, raising a card when it asks. Always answers; never throws. */
export async function evaluateHookCall(input: unknown): Promise<{ ok: true; value: { decision: 'allow' | 'deny'; reason: string } }> {
  const hook = (input && typeof input === 'object' ? input : {}) as HookInput;
  const call = hookCallToPolicyCall(hook);
  try {
    const verdict = await getToolGuard().check(call.tool, call.input, { repoPath: call.repoPath });
    return { ok: true, value: verdict.allowed ? { decision: 'allow', reason: verdict.decision.reason } : { decision: 'deny', reason: verdict.message } };
  } catch (error) {
    // Failing closed on an internal error would brick every CLI session; the hook's contract is "allow and log".
    defaultLogger.warn(`policy.evaluate: ${String(error)}`);
    return { ok: true, value: { decision: 'allow', reason: 'The policy could not be evaluated.' } };
  }
}

/** Test seam: back to the unconfigured state. */
export function resetToolPolicyForTests(): void {
  broadcast = () => undefined;
  configured = false;
  store = null;
  studioGuard = null;
  brokers.clear();
}
