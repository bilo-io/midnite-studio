import type { BranchStatus, ConflictOp } from '@midnite/git-shared';

import type { SyncStep } from './sync-availability';

/**
 * What to offer when a sync stops halfway.
 *
 * A failed pull is the moment a git client is least useful and most needed: the
 * repository is in a state the user did not ask for, and the way out is a
 * sequence of commands they have to remember under pressure. The app already
 * knows which step failed, what git said about it, and which files are
 * unmerged — enough to name the repair rather than report the failure.
 *
 * So the dialog's primary button never says "Fix it" or "Ask Claude". It says
 * the operation: *Resolve the 3 merge conflicts*, *Rebase onto origin/main and
 * push*. Agreeing to an agent editing your working tree is only meaningful if
 * you were told what it is about to do, and a generic label makes every failure
 * look like the same button.
 *
 * Nothing here runs anything. It maps a failure to copy and to the prompt the
 * terminal session opens with — the click that starts Claude is the user's.
 */
export type SyncFailure =
  | { step: SyncStep; kind: 'conflict'; op: ConflictOp; files: string[] }
  | { step: SyncStep; kind: 'error'; message: string; stderr?: string };

export type SyncResolution = {
  title: string;
  body: string;
  /** The primary button. Names the repair, never the helper. */
  confirmLabel: string;
  /** Conflicted paths, or git's own words. Rendered in the dialog's alert box. */
  warnings: string[];
  /**
   * Typed into a fresh Claude session in the failing checkout.
   *
   * Written as an instruction with the constraint attached, because the model
   * on the other end has the same force-push footgun the UI refuses to give the
   * user (docs/INITIAL_PLAN.md → Risks). Saying it in the prompt is the only
   * place that rule can survive the handover.
   *
   * Single-line by construction. It becomes one shell word in a pty, and a
   * newline inside an open quote leaves the user staring at a `>` continuation
   * prompt wondering what they are being asked.
   */
  prompt: string;
};

const STEP_VERB: Record<SyncStep, string> = { fetch: 'fetch', pull: 'pull', push: 'push' };

const NEVER_FORCE = 'Never force-push, and never rewrite a commit that is already on the remote.';

export function syncResolution(failure: SyncFailure, branch: BranchStatus): SyncResolution {
  if (failure.kind === 'conflict') return conflictResolution(failure, branch);

  const said = `${failure.message}\n${failure.stderr ?? ''}`;

  // A rejected push is the single most common sync failure, and the one with
  // the most dangerous folk remedy: `--force`. Naming the safe repair in the
  // button is how the dialog competes with the thing the user already half
  // remembers from Stack Overflow.
  if (failure.step === 'push' && /rejected|non-fast-forward|fetch first/i.test(said)) {
    const upstream = branch.upstream ?? 'the upstream';
    return {
      title: 'The push was rejected',
      body: `${upstream} has commits your branch does not, so git refused to overwrite them. Rebasing your ${count(branch.ahead, 'commit')} on top of it makes the push a fast-forward.`,
      confirmLabel: `Rebase onto ${upstream} and push, with Claude`,
      warnings: gitSaid(failure),
      prompt: `A \`git push\` was rejected because ${upstream} has commits my branch does not. Rebase my ${count(branch.ahead, 'local commit')} onto ${upstream}, resolve any conflicts that come up, then push. ${NEVER_FORCE}`,
    };
  }

  if (failure.step === 'pull' && /local changes|would be overwritten|unstaged/i.test(said)) {
    return {
      title: 'The pull would overwrite your changes',
      body: 'Git stopped rather than discard uncommitted work. The changes have to be put somewhere — stashed or committed — before the pull can land.',
      confirmLabel: 'Stash, pull, then restore, with Claude',
      warnings: gitSaid(failure),
      prompt:
        'A `git pull` refused to run because it would overwrite my uncommitted changes. Stash them, pull, then restore the stash and resolve any conflicts that surface. Show me what was stashed before you touch anything. ' +
        NEVER_FORCE,
    };
  }

  // Credentials and DNS are the two failures an agent cannot repair by editing
  // the repository, so the button promises a diagnosis rather than a fix. It is
  // still worth offering: `remote -v`, the SSH config and the credential helper
  // are exactly the things nobody remembers where to look at.
  if (/authenticat|permission denied|publickey|could not read Username|403|401/i.test(said)) {
    return {
      title: `The ${STEP_VERB[failure.step]} could not authenticate`,
      body: 'Git reached the remote but was refused. That is a credential or an access problem, not something in your working tree.',
      confirmLabel: 'Diagnose the credentials with Claude',
      warnings: gitSaid(failure),
      prompt: `\`git ${STEP_VERB[failure.step]}\` failed to authenticate against the remote. Work out why — check the remote URL, the SSH agent and the git credential helper — and tell me what to change. Do not change any credentials yourself.`,
    };
  }

  if (/could not resolve host|network|timed out|connection refused/i.test(said)) {
    return {
      title: `The ${STEP_VERB[failure.step]} could not reach the remote`,
      body: 'Nothing in the repository changed. This is worth retrying once the network is back.',
      confirmLabel: 'Investigate the connection with Claude',
      warnings: gitSaid(failure),
      prompt: `\`git ${STEP_VERB[failure.step]}\` could not reach the remote. Check the remote URL and whether the host is reachable, and tell me what you find.`,
    };
  }

  return {
    title: `The ${STEP_VERB[failure.step]} failed`,
    body: 'The sync stopped here, so no later step ran. Git’s own words are below.',
    confirmLabel: `Investigate the failed ${STEP_VERB[failure.step]} with Claude`,
    warnings: gitSaid(failure),
    prompt: `\`git ${STEP_VERB[failure.step]}\` failed in this repository with: "${oneLine(`${failure.message} ${failure.stderr ?? ''}`)}". Work out why and fix it. Tell me what you are going to do before you change anything. ${NEVER_FORCE}`,
  };
}

function conflictResolution(
  failure: Extract<SyncFailure, { kind: 'conflict' }>,
  branch: BranchStatus,
): SyncResolution {
  // `op` is what git ACTUALLY started — a pull is a merge or a rebase depending
  // on how it was invoked — so the button names that rather than "the pull".
  // Continuing the wrong one is its own confusing error.
  const op = failure.op;
  const n = failure.files.length;

  return {
    title: `The pull left ${count(n, 'file')} conflicted`,
    body: `The ${op} is still in progress. Every conflicted file has to be resolved and staged before it can continue.${branch.ahead > 0 ? ' Nothing was pushed.' : ''}`,
    confirmLabel: `Resolve the ${n} ${op} conflict${n === 1 ? '' : 's'} with Claude`,
    warnings: failure.files.slice(0, 8),
    prompt: `A \`git pull\` left this repository mid-${op} with ${count(n, 'conflicted file')}: ${failure.files.join(', ')}. Resolve every conflict, keeping both sides' intent rather than picking one wholesale, stage the results and complete the ${op}. Explain each resolution you are unsure about instead of guessing. ${NEVER_FORCE}`,
  };
}

/**
 * Git's message, then its stderr, minus the duplicate.
 *
 * The mapped `message` is often a sentence we wrote, and the stderr underneath
 * it is what actually happened; showing both is the difference between "the
 * push failed" and a line the user can search for.
 */
function gitSaid(failure: Extract<SyncFailure, { kind: 'error' }>): string[] {
  const lines = [failure.message, ...(failure.stderr ?? '').split('\n')]
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return [...new Set(lines)].slice(0, 6);
}

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** Git's multi-line stderr, collapsed so the prompt stays one shell word. */
const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();
