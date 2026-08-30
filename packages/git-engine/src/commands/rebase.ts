import * as fs from 'fs';
import * as path from 'path';
import { GitOpResult, RebaseSequencePlan, RebaseStatusState } from '@midnite/studio-shared';
import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { conflictedPaths } from './status';
import { createRebaseSequenceManifest, formatRebaseTodo } from '../exec/rebase-editor';

/**
 * Start an interactive rebase with a sequence plan.
 */
export async function startInteractiveRebase(
  repoPath: string,
  targetRef: string,
  plan: RebaseSequencePlan,
  repoKey: string = repoPath,
): Promise<GitOpResult> {
  return writeQueue.run(repoKey, async () => {
    try {
      const dotGitPath = path.join(repoPath, '.git');
      
      // Step 1: Automated backup ref creation before execution (Phase 31 Theme D)
      const backupRef = `refs/midnite-backup/rebase-${Date.now()}`;
      await execGit(repoPath, ['update-ref', backupRef, 'HEAD'], { write: true });

      // Save plan to .git/midnite-rebase-plan.json
      createRebaseSequenceManifest(dotGitPath, plan);

      // Create a wrapper helper sequence editor script or inline node command
      const todoContent = formatRebaseTodo(plan.entries);
      const helperScriptPath = path.join(dotGitPath, 'midnite-seq-editor.sh');
      
      // Write todoContent directly to sequence file when git editor is invoked
      fs.writeFileSync(
        helperScriptPath,
        `#!/bin/sh\ncat << 'EOF' > "$1"\n${todoContent}EOF\n`,
        { mode: 0o755 },
      );

      const env = {
        ...process.env,
        GIT_SEQUENCE_EDITOR: helperScriptPath,
      };

      const result = await execGit(
        repoPath,
        ['rebase', '-i', targetRef],
        { env, write: true },
      );

      if (result.exitCode !== 0) {
        if (result.stderr.includes('CONFLICT') || result.stdout.includes('CONFLICT')) {
          const files = await conflictedPaths(repoPath);
          return {
            ok: false,
            kind: 'conflict',
            op: 'rebase',
            files,
          };
        }
        return {
          ok: false,
          kind: 'error',
          message: result.stderr || result.stdout || 'Rebase failed',
        };
      }

      return { ok: true };
    } catch (err: unknown) {
      return {
        ok: false,
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

/**
 * Continue an in-progress rebase after resolving conflicts.
 */
export async function continueRebase(
  repoPath: string,
  repoKey: string = repoPath,
): Promise<GitOpResult> {
  return writeQueue.run(repoKey, async () => {
    try {
      const result = await execGit(repoPath, ['rebase', '--continue'], {
        write: true,
        env: { ...process.env, GIT_EDITOR: 'true' },
      });
      if (result.exitCode !== 0) {
        if (result.stderr.includes('CONFLICT') || result.stdout.includes('CONFLICT')) {
          const files = await conflictedPaths(repoPath);
          return {
            ok: false,
            kind: 'conflict',
            op: 'rebase',
            files,
          };
        }
        return {
          ok: false,
          kind: 'error',
          message: result.stderr || result.stdout || 'Rebase continue failed',
        };
      }
      return { ok: true };
    } catch (err: unknown) {
      return {
        ok: false,
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

/**
 * Abort an in-progress rebase.
 */
export async function abortRebase(
  repoPath: string,
  repoKey: string = repoPath,
): Promise<GitOpResult> {
  return writeQueue.run(repoKey, async () => {
    try {
      const result = await execGit(repoPath, ['rebase', '--abort'], { write: true });
      if (result.exitCode !== 0) {
        return {
          ok: false,
          kind: 'error',
          message: result.stderr || result.stdout || 'Rebase abort failed',
        };
      }
      return { ok: true };
    } catch (err: unknown) {
      return {
        ok: false,
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

/**
 * Skip the current commit during rebase.
 */
export async function skipRebase(
  repoPath: string,
  repoKey: string = repoPath,
): Promise<GitOpResult> {
  return writeQueue.run(repoKey, async () => {
    try {
      const result = await execGit(repoPath, ['rebase', '--skip'], { write: true });
      if (result.exitCode !== 0) {
        return {
          ok: false,
          kind: 'error',
          message: result.stderr || result.stdout || 'Rebase skip failed',
        };
      }
      return { ok: true };
    } catch (err: unknown) {
      return {
        ok: false,
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

/**
 * Check current rebase status and progress.
 */
export async function getRebaseStatus(repoPath: string): Promise<RebaseStatusState> {
  const dotGitPath = path.join(repoPath, '.git');
  const rebaseMergeDir = path.join(dotGitPath, 'rebase-merge');
  const rebaseApplyDir = path.join(dotGitPath, 'rebase-apply');

  const inMerge = fs.existsSync(rebaseMergeDir);
  const inApply = fs.existsSync(rebaseApplyDir);

  if (!inMerge && !inApply) {
    return { inProgress: false };
  }

  const activeDir = inMerge ? rebaseMergeDir : rebaseApplyDir;

  let currentStep: number | undefined;
  let totalSteps: number | undefined;
  let headSha: string | undefined;
  let ontoSha: string | undefined;

  try {
    const msgNum = path.join(activeDir, 'msgnum');
    if (fs.existsSync(msgNum)) {
      currentStep = parseInt(fs.readFileSync(msgNum, 'utf-8').trim(), 10);
    }
    const endNum = path.join(activeDir, 'end');
    if (fs.existsSync(endNum)) {
      totalSteps = parseInt(fs.readFileSync(endNum, 'utf-8').trim(), 10);
    }
    const headName = path.join(activeDir, 'stopped-sha');
    if (fs.existsSync(headName)) {
      headSha = fs.readFileSync(headName, 'utf-8').trim();
    }
    const ontoName = path.join(activeDir, 'onto');
    if (fs.existsSync(ontoName)) {
      ontoSha = fs.readFileSync(ontoName, 'utf-8').trim();
    }
  } catch {
    // ignore read errors
  }

  return {
    inProgress: true,
    currentStep,
    totalSteps,
    headSha,
    ontoSha,
    pausedReason: 'conflict',
  };
}

/**
 * Force-push with lease (--force-with-lease) after blast radius check (Phase 22 Theme F).
 */
export async function forcePushWithLease(
  repoPath: string,
  remote: string,
  branch: string,
  repoKey: string = repoPath,
): Promise<GitOpResult> {
  return writeQueue.run(repoKey, async () => {
    try {
      const result = await execGit(repoPath, ['push', '--force-with-lease', remote, branch], { write: true });
      if (result.exitCode !== 0) {
        return {
          ok: false,
          kind: 'error',
          message: result.stderr || result.stdout || 'Force push failed',
        };
      }
      return { ok: true };
    } catch (err: unknown) {
      return {
        ok: false,
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
