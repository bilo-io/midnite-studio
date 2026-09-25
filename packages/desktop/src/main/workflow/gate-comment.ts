import { createHash } from 'node:crypto';

import type { ForgeComment, WorkflowGateDecision } from '@midnite/studio-shared';

/**
 * Pure helpers for the PR/issue comment approval channel (Phase 97 Theme D)
 * — no `gh`, no adapter, no run/workflow state, so the parsing rule (which
 * comment counts, whose it has to be) is a plain vitest fixture rather than
 * something only exercisable through a live forge call.
 */

/**
 * A short, stable token naming exactly one gate decision — derived from
 * `runId`/`nodeId` rather than random, so a re-post (the app restarted before
 * the first comment round-tripped) names the SAME token instead of orphaning
 * the first one. Not a secret: it only has to be unguessable enough that two
 * different gates never collide, which eight hex characters of a run/node
 * pair already gives (this is an approval gate behind a forge account, not a
 * capability token).
 */
export function gateApprovalToken(runId: string, nodeId: string): string {
  return createHash('sha1').update(`${runId}:${nodeId}`).digest('hex').slice(0, 8);
}

const COMMAND_PREFIX = '/midnite';

/** The exact comment `gate-forge-service.ts` posts. */
export function gateApprovalCommentBody(input: { title: string; instructions: string; token: string }): string {
  const heading = input.title.trim() || 'A workflow gate is waiting for your approval.';
  const body = input.instructions.trim();
  return [
    `**${heading}**`,
    ...(body ? ['', body] : []),
    '',
    `Reply \`${COMMAND_PREFIX} approve ${input.token}\` or \`${COMMAND_PREFIX} reject ${input.token}\` to decide.`,
  ].join('\n');
}

/** Matches `/midnite approve <token>` / `/midnite reject <token>`, tolerant of surrounding text on the same line — mirrors `WORKFLOW_AGENT_DONE_MARKER_PATTERN`'s own tolerance. */
function decisionPattern(token: string): RegExp {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${COMMAND_PREFIX.replace('/', '\\/')}\\s+(approve|reject)\\s+${escapedToken}\\b`, 'i');
}

export type ParsedGateDecision = { decision: WorkflowGateDecision; note: string; author: string; at: string };

export type ParseGateDecisionResult = {
  /** The first token-matching comment from `ownerLogin`, or `null` if none has decided yet. */
  decided: ParsedGateDecision | null;
  /** Every OTHER author whose comment named this token, in encounter order — what "anyone else's comment is ignored and logged" (the phase doc's own wording) logs. Never includes `ownerLogin` itself, and stops accumulating once `decided` is found (nothing after the real decision matters any more). */
  ignoredAuthors: string[];
};

/**
 * Scans for a token-matching comment, oldest first — `ForgeComment[]` already
 * arrives "newest last" (every `ForgePullCommentsResult`/
 * `ForgeIssueCommentsResult`'s own doc comment), so the first structural
 * match here is chronologically the first real decision, not the most recent
 * edit of one. Only a comment from `ownerLogin` — the account that owns the
 * forge credential the gate posted with — ever decides anything; every other
 * matching comment is reported back for the caller to log, never acted on.
 */
export function parseGateDecisionFromComments(
  comments: readonly ForgeComment[],
  token: string,
  ownerLogin: string,
): ParseGateDecisionResult {
  const pattern = decisionPattern(token);
  const ignoredAuthors: string[] = [];
  for (const comment of comments) {
    const match = pattern.exec(comment.body);
    if (!match) continue;
    if (comment.author !== ownerLogin) {
      ignoredAuthors.push(comment.author);
      continue;
    }
    const decision: WorkflowGateDecision = match[1]!.toLowerCase() === 'approve' ? 'approved' : 'rejected';
    const note = comment.body.replace(pattern, '').trim();
    return { decided: { decision, note, author: comment.author, at: comment.createdAt }, ignoredAuthors };
  }
  return { decided: null, ignoredAuthors };
}
