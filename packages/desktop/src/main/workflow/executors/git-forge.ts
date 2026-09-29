import type { Forge, StatusCounts } from '@midnite/studio-shared';
import { currentBranch, readStatusCounts, revParse } from '@midnite/studio-git-engine';

import type { ForgeAdapter } from '../../forge/adapter';
import { resolveAdapter } from '../../ipc/forge-handlers';
import { resolveWorkdir } from '../../repo-registry';
import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { interpolate } from '../interpolate';

/**
 * The Git & forge kinds. Every one addresses a repository by the app's own
 * registered-repo id (`RepoDescriptor.id`) — the addressing `trigger`'s
 * `forge-pr` and `gate`'s `linkedRef` already use — and resolves it at run
 * time, never at save time: a workflow is global, and the repo it names may
 * have been closed since.
 *
 * `git-status` is read-only (git-engine's own readers, nothing through the
 * write queue). The two forge writes go through `resolveAdapter`, the same
 * multi-forge `ForgeAdapter` path `gate-forge-service.ts` posts its approval
 * comment on, so they work on every forge that adapter supports rather than
 * GitHub alone.
 */

export type GitStatusExecutorDeps = {
  resolveWorkdir: (repoId: string) => Promise<string | null>;
  currentBranch: (path: string) => Promise<string | null>;
  revParse: (path: string, rev: string) => Promise<string | null>;
  readStatusCounts: (path: string) => Promise<StatusCounts>;
};

export const defaultGitStatusExecutorDeps: GitStatusExecutorDeps = {
  resolveWorkdir: (repoId) => resolveWorkdir(repoId),
  currentBranch,
  revParse,
  readStatusCounts,
};

export type ForgeExecutorDeps = {
  resolveAdapter: (repoId: string) => Promise<{ forge: Forge; adapter: ForgeAdapter } | null>;
};

export const defaultForgeExecutorDeps: ForgeExecutorDeps = { resolveAdapter };

function unknownRepo(repoId: string): string {
  return `No open repository has the id "${repoId}" — open it in the app first.`;
}

export function createGitStatusExecutor(deps: GitStatusExecutorDeps = defaultGitStatusExecutorDeps): NodeExecutor {
  return async (node): Promise<NodeOutcome> => {
    if (node.kind !== 'git-status') return { ok: false, error: 'Not a git-status node.' };
    const repoId = node.config.repoId.trim();
    if (repoId === '') return { ok: false, error: 'This step has no repository.' };
    try {
      const path = await deps.resolveWorkdir(repoId);
      if (!path) return { ok: false, error: unknownRepo(repoId) };
      const [branch, head, counts] = await Promise.all([
        deps.currentBranch(path),
        deps.revParse(path, 'HEAD'),
        deps.readStatusCounts(path),
      ]);
      return {
        ok: true,
        output: {
          repoId,
          path,
          branch,
          head,
          staged: counts.staged.length,
          unstaged: counts.unstaged.length,
          clean: counts.staged.length === 0 && counts.unstaged.length === 0,
        },
      };
    } catch (err) {
      return { ok: false, error: `Could not read git status: ${err instanceof Error ? err.message : String(err)}` };
    }
  };
}

/** `"42"`, `"#42"` → 42; anything else is `null`. */
export function parseForgeNumber(raw: string): number | null {
  const match = /^#?(\d+)$/.exec(raw.trim());
  if (!match?.[1]) return null;
  const n = Number.parseInt(match[1], 10);
  return n > 0 ? n : null;
}

export function createForgeCommentExecutor(deps: ForgeExecutorDeps = defaultForgeExecutorDeps): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'forge-comment') return { ok: false, error: 'Not a forge-comment node.' };
    const { repoId, target } = node.config;
    const rawNumber = interpolate(node.config.number, context.upstream);
    if (!rawNumber.ok) return rawNumber;
    const number = parseForgeNumber(rawNumber.value);
    if (number === null) return { ok: false, error: `"${rawNumber.value}" is not a ${target === 'pr' ? 'PR' : 'issue'} number.` };
    const body = interpolate(node.config.body, context.upstream);
    if (!body.ok) return body;
    if (body.value.trim() === '') return { ok: false, error: 'The comment body is empty.' };

    const resolved = await deps.resolveAdapter(repoId.trim());
    if (!resolved) return { ok: false, error: `"${repoId}" is not an open repository with a supported forge remote.` };
    const result =
      target === 'pr'
        ? await resolved.adapter.commentPull(resolved.forge, number, body.value)
        : await resolved.adapter.commentIssue(resolved.forge, number, body.value);
    if (!result.ok) return { ok: false, error: result.error ?? 'The forge refused the comment.' };
    return { ok: true, output: { target, number } };
  };
}

export function createForgeIssueExecutor(deps: ForgeExecutorDeps = defaultForgeExecutorDeps): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'forge-issue') return { ok: false, error: 'Not a forge-issue node.' };
    const title = interpolate(node.config.title, context.upstream);
    if (!title.ok) return title;
    if (title.value.trim() === '') return { ok: false, error: 'The issue title is empty.' };
    const body = interpolate(node.config.body, context.upstream);
    if (!body.ok) return body;

    const repoId = node.config.repoId.trim();
    const resolved = await deps.resolveAdapter(repoId);
    if (!resolved) return { ok: false, error: `"${repoId}" is not an open repository with a supported forge remote.` };
    const result = await resolved.adapter.createIssue(resolved.forge, {
      title: title.value.trim(),
      ...(body.value.trim() === '' ? {} : { body: body.value }),
      ...(node.config.labels.length === 0 ? {} : { labels: node.config.labels }),
    });
    if (!result.ok) return { ok: false, error: result.error ?? 'The forge refused to create the issue.' };
    return { ok: true, output: { number: result.issue.number, url: result.issue.url, title: result.issue.title } };
  };
}

export const gitStatusExecutor = createGitStatusExecutor();
export const forgeCommentExecutor = createForgeCommentExecutor();
export const forgeIssueExecutor = createForgeIssueExecutor();
