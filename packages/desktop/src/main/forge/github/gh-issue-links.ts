import type { Forge, ForgeLinkKind, ForgeLinkWriteResult } from '@midnite/studio-shared';

import { issueDetail } from './gh-cli';
import { describeGraphqlFailure } from './gh-graphql';
import { apiHostFlag, ghStatus, invalidateGhProbe, LIST_TIMEOUT_MS, runInShell, shellQuote } from './gh-shell';

/**
 * `addSubIssue`/`addBlockedBy` and their removes (Phase 95 Theme D) — GitHub's
 * own dependency-graph mutations, the write half of the `blockedBy`/`parent`/
 * `subIssues` connections `gh-project.ts`'s `PROJECT_ITEMS_QUERY` already
 * reads (Phase 75 Theme A). Its own module rather than folded into
 * `gh-project-write.ts`: these mutations operate on `Issue` nodes directly,
 * with no ProjectV2 board in the picture at all, so grouping them with the
 * board-write file would mix two unrelated GraphQL surfaces that only happen
 * to share a transport.
 *
 * Every mutation input takes two issue *node ids*, never numbers — `gh issue
 * view <n> --json id` (via `issueDetail`) is the one resolution step both
 * `link`/`unlink` pay before the mutation itself, exactly as
 * `setThreadResolved` (`gh-write.ts`) resolves a thread id before acting on
 * it. A cross-repo target (`targetRepo` set) resolves through a *second*
 * `Forge` built from that owner/name — GraphQL node ids are global, so once
 * both are in hand the mutation itself does not care which repo either issue
 * lives in.
 */

function crossRepoForge(forge: Forge, targetRepo: string): Forge | null {
  const parts = targetRepo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { ...forge, owner: parts[0], repo: parts[1] };
}

async function resolveIssueNodeId(forge: Forge, number: number, targetRepo: string): Promise<string | null> {
  const target = targetRepo ? crossRepoForge(forge, targetRepo) : forge;
  if (target === null) return null;
  const detail = await issueDetail(target, number);
  return detail.issue && detail.issue.id.length > 0 ? detail.issue.id : null;
}

/** The mutation name and input-type name for each kind, in each direction. */
const MUTATION: Record<ForgeLinkKind, { add: string; addInput: string; remove: string; removeInput: string }> = {
  blockedBy: {
    add: 'addBlockedBy',
    addInput: 'AddBlockedByInput',
    remove: 'removeBlockedBy',
    removeInput: 'RemoveBlockedByInput',
  },
  subIssue: {
    add: 'addSubIssue',
    addInput: 'AddSubIssueInput',
    remove: 'removeSubIssue',
    removeInput: 'RemoveSubIssueInput',
  },
};

/** `blockedBy`'s input names its two ids `issueId`/`blockedByIssueId`;
 *  `subIssue`'s names them `issueId`/`subIssueId` — GitHub's own naming for
 *  the two relations, not a convention this app picked. */
function variablesFor(kind: ForgeLinkKind, issueId: string, targetId: string): Record<string, unknown> {
  return kind === 'blockedBy' ? { issueId, blockedByIssueId: targetId } : { issueId, subIssueId: targetId };
}

async function runLinkMutation(
  forge: Forge,
  kind: ForgeLinkKind,
  direction: 'add' | 'remove',
  number: number,
  targetNumber: number,
  targetRepo: string,
): Promise<ForgeLinkWriteResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { ok: false, cli, error: null };

  const [issueId, targetId] = await Promise.all([
    resolveIssueNodeId(forge, number, ''),
    resolveIssueNodeId(forge, targetNumber, targetRepo),
  ]);
  if (issueId === null || targetId === null) {
    return { ok: false, cli, error: 'Could not resolve one of the two issues to link.' };
  }

  const { [direction]: mutationName, [`${direction}Input` as const]: inputName } = MUTATION[kind];
  const query = `mutation($input:${inputName}!){${mutationName}(input:$input){issue{id}}}`;
  const variables = { input: variablesFor(kind, issueId, targetId) };
  const command =
    `printf %s ${shellQuote(JSON.stringify({ query, variables }))} |` +
    ` gh api graphql${apiHostFlag(forge)} --input -`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    invalidateGhProbe();
    return { ok: false, cli, error: describeGraphqlFailure(result.output) };
  }
  return { ok: true, cli, error: null, via: 'api' };
}

export function linkIssues(
  forge: Forge,
  request: { kind: ForgeLinkKind; number: number; targetNumber: number; targetRepo?: string },
): Promise<ForgeLinkWriteResult> {
  return runLinkMutation(forge, request.kind, 'add', request.number, request.targetNumber, request.targetRepo ?? '');
}

export function unlinkIssues(
  forge: Forge,
  request: { kind: ForgeLinkKind; number: number; targetNumber: number; targetRepo?: string },
): Promise<ForgeLinkWriteResult> {
  return runLinkMutation(
    forge,
    request.kind,
    'remove',
    request.number,
    request.targetNumber,
    request.targetRepo ?? '',
  );
}
