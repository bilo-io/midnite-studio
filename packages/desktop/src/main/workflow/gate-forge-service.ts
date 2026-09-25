import type { Forge, WorkflowGateDecision, WorkflowNode } from '@midnite/studio-shared';

import { activeAccountFor } from '../forge/forge-accounts';
import { resolveAdapter } from '../ipc/forge-handlers';
import { githubWhoami } from '../forge/whoami';
import { defaultLogger, type Logger } from '../log';
import { gateApprovalCommentBody, gateApprovalToken, parseGateDecisionFromComments } from './gate-comment';

/**
 * The PR/issue comment approval channel (Phase 97 Theme D), wired to the
 * existing multi-forge write layer (`registry.ts`'s `adapterFor`, Phase 90
 * Theme D) rather than a fresh GitHub-only path — a gate's own doc bullet
 * says "the forge poller watches that thread", but the actual watch here is
 * a standalone poll (`pollGateApprovals`) rather than a new subscription kind
 * on `forge-poller.ts`'s `ForgePoller`: that class polls *listings* a window
 * has expressed interest in, keyed by `{repoId, kind}`; a waiting gate is
 * interesting regardless of whether any window has a matching view open; and
 * a gate has no `ForgeSubscriptionKind` of its own to project a hash from.
 * `workflow-service.ts` is what calls `pollGateApprovals` on a timer,
 * because it is the one module that already holds every run and workflow in
 * memory — this file never imports it, which is what keeps this an ordinary
 * dependency edge from `executors/index.ts` rather than an import cycle (see
 * `executors/gate.ts`'s own doc comment on `postApprovalComment`).
 */

/**
 * Fire-and-forget: a posting failure must never block a gate from its other
 * three decide channels. Silently does nothing for a `linkedRef.repoId` this
 * app has not opened, or a repository with no recognised forge remote — the
 * same "not a failure, nothing to report" posture `resolveAdapter` already
 * gives every other forge write in this app.
 */
export function postGateApprovalComment(
  input: { runId: string; workflowId: string; node: WorkflowNode },
  log: Logger = defaultLogger,
): void {
  if (input.node.kind !== 'gate') return;
  const config = input.node.config;
  const linkedRef = config.linkedRef;
  if (!linkedRef) return;

  void (async () => {
    try {
      const resolved = await resolveAdapter(linkedRef.repoId);
      if (!resolved) return;
      const token = gateApprovalToken(input.runId, input.node.id);
      const body = gateApprovalCommentBody({ title: config.title, instructions: config.instructions, token });
      const result =
        linkedRef.kind === 'pr'
          ? await resolved.adapter.commentPull(resolved.forge, linkedRef.number, body)
          : await resolved.adapter.commentIssue(resolved.forge, linkedRef.number, body);
      if (!result.ok) log(`[gate] failed to post approval comment: ${result.error ?? 'unknown error'}`);
    } catch (err) {
      log(`[gate] failed to post approval comment: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
}

/**
 * The account that owns the forge credential a gate's comment was posted
 * with (Decision 10) — an explicit `ForgeAccount` when one is active for this
 * host, or, for GitHub with none (the `gh`-delegated common case —
 * `CLAUDE.md`'s own forge-account-vault note), whoever `gh` itself is
 * currently authenticated as. `null` means "cannot tell who owns this" —
 * every caller treats that as "decide nothing", never as "anyone may decide".
 */
export async function resolveGateCommentOwnerLogin(forge: Forge): Promise<string | null> {
  const account = await activeAccountFor(forge);
  if (account) return account.login;
  if (forge.kind === 'github') return (await githubWhoami(forge.host))?.login ?? null;
  return null;
}

export type WaitingLinkedGate = {
  runId: string;
  workflowId: string;
  nodeId: string;
  node: WorkflowNode;
};

/**
 * One poll pass over every currently-waiting, `linkedRef`-carrying gate —
 * `workflow-service.ts` builds the `gates` list from its own in-memory
 * `runs`, and `decide` closes over `decideWorkflowGate` (`workflow-engine.ts`),
 * so this module never imports either. Zero gates costs zero forge calls,
 * the same "nothing subscribed, nothing polled" rule `forge-poller.ts`
 * already follows.
 */
export async function pollGateApprovals(
  gates: readonly WaitingLinkedGate[],
  decide: (runId: string, nodeId: string, decision: WorkflowGateDecision, note: string | undefined) => Promise<void>,
  log: Logger = defaultLogger,
): Promise<void> {
  for (const gate of gates) {
    if (gate.node.kind !== 'gate') continue;
    const linkedRef = gate.node.config.linkedRef;
    if (!linkedRef) continue;

    try {
      const resolved = await resolveAdapter(linkedRef.repoId);
      if (!resolved) continue;
      const ownerLogin = await resolveGateCommentOwnerLogin(resolved.forge);
      if (!ownerLogin) continue;

      const commentsResult =
        linkedRef.kind === 'pr'
          ? await resolved.adapter.pullComments(resolved.forge, linkedRef.number)
          : await resolved.adapter.issueComments(resolved.forge, linkedRef.number);
      if (commentsResult.error !== null) continue;

      const token = gateApprovalToken(gate.runId, gate.nodeId);
      const { decided, ignoredAuthors } = parseGateDecisionFromComments(commentsResult.comments, token, ownerLogin);
      for (const author of ignoredAuthors) {
        log(`[gate] ignored a decision comment from "${author}" — not the account this gate posted with`);
      }
      if (!decided) continue;
      log(`[gate] ${gate.runId}/${gate.nodeId} decided "${decided.decision}" by ${decided.author} via PR comment`);
      await decide(gate.runId, gate.nodeId, decided.decision, decided.note || undefined);
    } catch (err) {
      log(`[gate] approval poll failed for ${gate.runId}/${gate.nodeId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
