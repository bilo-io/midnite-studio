import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  DEFAULT_TOOL_POLICY,
  TOOL_APPROVAL_TIMEOUT_MS,
  ToolPolicyOverridesSchema,
  evaluateToolPolicy,
  extractTaintTokens,
  provenanceFor,
  redactOutbound,
  type NewAgentAuditRecord,
  type TaintedToken,
  type ToolApprovalDecision,
  type ToolApprovalRequest,
  type ToolApprovalResolved,
  type ToolCallContext,
  type ToolDecision,
  type ToolPolicy,
  type ToolPolicyOverrides,
  type ToolRule,
} from '@midnite/studio-shared';

import type { DispatchResult, ScopedDispatch } from '../agent-run/host';

/**
 * The tool-call policy's runtime half — Phase 121 Theme B. Three small pieces over injected seams (no
 * `electron`, no window): the per-repo overrides file, the approval broker that suspends a call until a human
 * answers, and the guard that wraps a dispatcher with both. `shared/src/tool-policy.ts` is the policy itself.
 */

// --- per-repo overrides ------------------------------------------------------

export function toolPolicyFile(userData: string): string {
  return join(userData, 'security', 'tool-policy.json');
}

export interface ToolPolicyStore {
  /** The policies to evaluate for a repo, in order: its overrides (when it has any), then the defaults. */
  policiesFor(repoPath: string | undefined): { source: string; policy: ToolPolicy }[];
  rulesFor(repoPath: string): ToolRule[];
  /** Replaces the repo's override rules (`[]` clears them) and persists. */
  setRules(repoPath: string, rules: ToolRule[]): Promise<void>;
}

/** Reads `tool-policy.json` once; a missing file is no overrides, a torn one is no overrides plus `onError`. */
export async function createToolPolicyStore(options: { file: string; onError?: (error: unknown) => void }): Promise<ToolPolicyStore> {
  let data: ToolPolicyOverrides = { version: 1, repos: {} };
  try {
    const parsed = ToolPolicyOverridesSchema.safeParse(JSON.parse(await readFile(options.file, 'utf8')));
    if (parsed.success) data = parsed.data;
    else options.onError?.(new Error('tool-policy.json did not match its schema; using the default policy'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') options.onError?.(error);
  }

  let chain: Promise<void> = Promise.resolve();
  const persist = (): Promise<void> => {
    const snapshot = `${JSON.stringify(data, null, 2)}\n`;
    const next = chain.then(async () => {
      await mkdir(dirname(options.file), { recursive: true, mode: 0o700 });
      const tmp = `${options.file}.${process.pid}.tmp`;
      await writeFile(tmp, snapshot, { mode: 0o600 });
      await rename(tmp, options.file);
    });
    chain = next.catch((error: unknown) => options.onError?.(error));
    return next;
  };

  return {
    rulesFor: (repoPath) => data.repos[repoPath]?.rules ?? [],
    policiesFor(repoPath) {
      const overrides = repoPath ? data.repos[repoPath] : undefined;
      return [...(overrides && overrides.rules.length > 0 ? [{ source: 'repo', policy: overrides }] : []), { source: 'default', policy: DEFAULT_TOOL_POLICY }];
    },
    async setRules(repoPath, rules) {
      const repos = { ...data.repos };
      if (rules.length === 0) delete repos[repoPath];
      else repos[repoPath] = { rules };
      data = { version: 1, repos };
      await persist();
    },
  };
}

// --- the approval broker -----------------------------------------------------

export interface ToolApprovals {
  /** Raises a card and resolves with the human's answer; `deny` on timeout. Never rejects. */
  request(ctx: ToolCallContext, decision: ToolDecision): Promise<{ allowed: boolean; by: 'user' | 'timeout' | 'session'; scope?: 'once' | 'session' }>;
  /** The card's answer. `false` when the id is unknown or already settled. */
  answer(id: string, decision: ToolApprovalDecision): boolean;
  /** Cards waiting right now. */
  pending(): ToolApprovalRequest[];
}

export interface ToolApprovalsOptions {
  /** Pushes the card to every window. */
  raise: (request: ToolApprovalRequest) => void;
  /** Tells every window to drop a card. */
  resolved?: (resolved: ToolApprovalResolved) => void;
  now?: () => number;
  newId?: () => string;
  timeoutMs?: number;
  /** Extra secret values (the vault) to scrub from the arguments beside the shape patterns. */
  secrets?: () => readonly { name: string; value: string; kind?: 'vault' | 'canary' }[];
}

const ARG_LIMIT = 4000;

/** The call's arguments as the card shows them: pretty-printed, scrubbed, capped. */
export function redactedArgs(input: unknown, secrets: Parameters<typeof redactOutbound>[1] = []): string {
  let text: string;
  try {
    text = JSON.stringify(input ?? {}, null, 2) ?? '{}';
  } catch {
    text = '[unprintable arguments]';
  }
  const scrubbed = redactOutbound(text, secrets).text;
  return scrubbed.length > ARG_LIMIT ? `${scrubbed.slice(0, ARG_LIMIT)}\n… (${scrubbed.length - ARG_LIMIT} more characters)` : scrubbed;
}

/**
 * "Approve for this session" is remembered for the life of this broker, by tool and rule — never per repo and
 * never on disk (Phase 121 Decision 7). A broker is one app run (Studio's global server) or one private run.
 */
export function createToolApprovals(options: ToolApprovalsOptions): ToolApprovals {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? randomUUID;
  const timeoutMs = options.timeoutMs ?? TOOL_APPROVAL_TIMEOUT_MS;
  const sessionAllowed = new Set<string>();
  const waiting = new Map<string, { request: ToolApprovalRequest; settle: (decision: ToolApprovalDecision | 'timeout') => void }>();

  return {
    request(ctx, decision) {
      const key = `${ctx.tool}\u0000${decision.ruleId}`;
      if (sessionAllowed.has(key)) return Promise.resolve({ allowed: true, by: 'session' });
      return new Promise((resolve) => {
        const id = newId();
        const askedAt = now();
        const request: ToolApprovalRequest = {
          id,
          tool: ctx.tool,
          args: redactedArgs(ctx.input, options.secrets?.() ?? []),
          ruleId: decision.ruleId,
          reason: decision.reason,
          provenance: decision.provenance,
          ...(ctx.repoPath ? { repoPath: ctx.repoPath } : {}),
          askedAt,
          expiresAt: askedAt + timeoutMs,
        };
        const timer = setTimeout(() => settle('timeout'), timeoutMs);
        timer.unref?.();
        const settle = (answer: ToolApprovalDecision | 'timeout'): void => {
          if (!waiting.delete(id)) return;
          clearTimeout(timer);
          options.resolved?.({ id, decision: answer });
          if (answer === 'approve-session') sessionAllowed.add(key);
          resolve(
            answer === 'timeout'
              ? { allowed: false, by: 'timeout' }
              : { allowed: answer !== 'deny', by: 'user', scope: answer === 'approve-session' ? 'session' : 'once' },
          );
        };
        waiting.set(id, { request, settle });
        try {
          options.raise(request);
        } catch {
          // A window that cannot be reached leaves the card to time out, which denies.
        }
      });
    },
    answer(id, decision) {
      const entry = waiting.get(id);
      if (!entry) return false;
      entry.settle(decision);
      return true;
    },
    pending: () => [...waiting.values()].map((w) => w.request),
  };
}

// --- taint -------------------------------------------------------------------

/** Tools whose results carry text a stranger wrote: PR and check bodies, commit messages, file contents. */
export const UNTRUSTED_RESULT_TOOLS: ReadonlySet<string> = new Set(['forge.pulls', 'forge.checks', 'graph.log', 'diff.file']);

export interface TaintLedger {
  note(tool: string, value: unknown): void;
  tokens(): TaintedToken[];
}

/** The path and URL tokens an agent has been handed from untrusted results, kept for `ttlMs`. */
export function createTaintLedger(options: { now?: () => number; ttlMs?: number; max?: number; tools?: ReadonlySet<string> } = {}): TaintLedger {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? 30 * 60_000;
  const max = options.max ?? 500;
  const tools = options.tools ?? UNTRUSTED_RESULT_TOOLS;
  let entries: { at: number; token: TaintedToken }[] = [];
  return {
    note(tool, value) {
      if (!tools.has(tool)) return;
      let text: string;
      try {
        text = JSON.stringify(value) ?? '';
      } catch {
        return;
      }
      const provenance = provenanceFor('mcp-result', tool);
      const at = now();
      entries = [...entries, ...extractTaintTokens(text, provenance, 100).map((token) => ({ at, token }))].slice(-max);
    },
    tokens() {
      const cutoff = now() - ttl;
      entries = entries.filter((e) => e.at >= cutoff);
      return entries.map((e) => e.token);
    },
  };
}

// --- the guard ---------------------------------------------------------------

/** `repoPath` is the one field every MCP tool's input shares. */
export function repoPathOfInput(input: unknown): string | undefined {
  if (input && typeof input === 'object' && 'repoPath' in input) {
    const value = (input as { repoPath?: unknown }).repoPath;
    if (typeof value === 'string' && value !== '') return value;
  }
  return undefined;
}

export interface ToolGuardOptions {
  store: Pick<ToolPolicyStore, 'policiesFor'>;
  approvals: ToolApprovals;
  taint?: TaintLedger;
  record?: (record: NewAgentAuditRecord) => void;
  /** The terminal or agent session the calls belong to, for the audit trail. */
  sessionId?: string;
}

export interface ToolGuard {
  /** Judge one call; on `ask`, waits for the human. `allowed: false` carries the message to refuse with. */
  check(tool: string, input: unknown, extra?: Partial<ToolCallContext>): Promise<{ allowed: true; decision: ToolDecision } | { allowed: false; decision: ToolDecision; message: string }>;
  /** Wraps a dispatcher so every call is judged before its handler runs. */
  wrap(dispatch: ScopedDispatch): ScopedDispatch;
  /** The decision a call would get, with no card and no audit record. */
  evaluate(tool: string, input: unknown, extra?: Partial<ToolCallContext>): ToolDecision;
}

export function createToolGuard(options: ToolGuardOptions): ToolGuard {
  const contextFor = (tool: string, input: unknown, extra: Partial<ToolCallContext> = {}): ToolCallContext => {
    const repoPath = extra.repoPath ?? repoPathOfInput(input);
    return { ...extra, tool, input, repoPath, taint: extra.taint ?? options.taint?.tokens() };
  };
  const session = options.sessionId ? { sessionId: options.sessionId } : {};

  const evaluate: ToolGuard['evaluate'] = (tool, input, extra) => {
    const ctx = contextFor(tool, input, extra);
    return evaluateToolPolicy(ctx, options.store.policiesFor(ctx.repoPath));
  };

  const check: ToolGuard['check'] = async (tool, input, extra) => {
    const ctx = contextFor(tool, input, extra);
    const decision = evaluateToolPolicy(ctx, options.store.policiesFor(ctx.repoPath));
    if (decision.effect === 'allow') return { allowed: true, decision };
    const repo = ctx.repoPath ? { repoPath: ctx.repoPath } : {};
    options.record?.({ kind: 'policy-decision', tool, decision: decision.effect, rule: decision.ruleId, ...repo, ...session });
    if (decision.effect === 'deny') return { allowed: false, decision, message: `Refused by policy (${decision.ruleId}): ${decision.reason}` };
    const answer = await options.approvals.request(ctx, decision);
    options.record?.({
      kind: 'approval',
      tool,
      decision: answer.allowed ? 'approved' : 'denied',
      by: answer.by,
      rule: decision.ruleId,
      ...(answer.scope ? { scope: answer.scope } : {}),
      ...session,
    });
    if (answer.allowed) return { allowed: true, decision };
    return {
      allowed: false,
      decision,
      message: answer.by === 'timeout' ? `Denied: nobody answered the approval for "${tool}" in time (${decision.reason})` : `Denied by the user: ${decision.reason}`,
    };
  };

  return {
    check,
    evaluate,
    wrap: (dispatch) => async (tool, input): Promise<DispatchResult> => {
      const verdict = await check(tool, input);
      if (!verdict.allowed) return { ok: false, kind: 'refused', message: verdict.message };
      const result = await dispatch(tool, input);
      if (result.ok) options.taint?.note(tool, result.value);
      return result;
    },
  };
}
