import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import type { GitOpResult } from '@midnite/studio-shared';
import { failure, ok } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';

/** Marker identifying Midnite Studio's installed pre-commit secret scanning hook. */
export const PRE_COMMIT_HOOK_MARKER = '# --- Midnite Studio Pre-Commit Secret Scanner ---';

/**
 * `core.hooksPath`, resolved relative to the repo when it is set and relative
 * (git's own rule — an absolute value is used as-is).
 *
 * `null` — never `''` — when the key is unset, so a caller can `??` a default
 * (`.git/hooks`) without mistaking "not configured" for "configured to the
 * repo root" (Phase 78 Theme E's installer does exactly that).
 */
export async function getHooksPath(repoPath: string): Promise<string | null> {
  const res = await execGit(repoPath, ['config', '--get', 'core.hooksPath']);
  // Exit 1 means the key is unset — a normal repo, not a failure.
  if (res.exitCode !== 0) return null;
  const value = res.stdout.replace(/\r?\n$/, '');
  return value.length > 0 ? value : null;
}

/**
 * Resolves the directory where git hooks reside for the repository.
 */
export async function resolveHooksDir(repoPath: string): Promise<string> {
  const configured = await getHooksPath(repoPath);
  if (!configured) {
    return join(repoPath, '.git', 'hooks');
  }
  return isAbsolute(configured) ? configured : join(repoPath, configured);
}

/**
 * Resolves the absolute path to the repository's pre-commit hook.
 */
export async function getPreCommitHookPath(repoPath: string): Promise<string> {
  const dir = await resolveHooksDir(repoPath);
  return join(dir, 'pre-commit');
}

/**
 * Checks whether the Midnite Studio pre-commit secret scanner is currently installed.
 */
export async function isPreCommitHookInstalled(repoPath: string): Promise<boolean> {
  const hookPath = await getPreCommitHookPath(repoPath);
  if (!existsSync(hookPath)) return false;
  try {
    const content = await readFile(hookPath, 'utf8');
    return content.includes(PRE_COMMIT_HOOK_MARKER);
  } catch {
    return false;
  }
}

/**
 * Shell script snippet for the pre-commit secret scan.
 * Works portably across macOS and Linux sh environments.
 */
export const PRE_COMMIT_HOOK_SCRIPT = `
${PRE_COMMIT_HOOK_MARKER}
# Scans staged git diff additions for common secret tokens and keys
if command -v midnite >/dev/null 2>&1; then
  midnite scan-staged || exit 1
else
  # Fast fallback regex check if midnite CLI is not in PATH
  DIFF_OUT=$(git diff --cached --unified=0 | grep -E '^\\+[^+]' || true)
  if echo "$DIFF_OUT" | grep -Eq 'gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{16,}|(?:AKIA|ASIA)[0-9A-Z]{16}|npm_[A-Za-z0-9]{36}'; then
    echo "[midnite] Commit rejected: potential secret detected in staged changes." >&2
    echo "[midnite] Run with '--no-verify' to bypass if this is intentional." >&2
    exit 1
  fi
fi
# --- End Midnite Studio Pre-Commit Secret Scanner ---
`.trim();

/**
 * Installs or appends the pre-commit secret scanner hook into the repository.
 */
export async function installPreCommitHook(repoPath: string): Promise<GitOpResult> {
  try {
    const dir = await resolveHooksDir(repoPath);
    await mkdir(dir, { recursive: true });
    const hookPath = join(dir, 'pre-commit');

    if (existsSync(hookPath)) {
      const existing = await readFile(hookPath, 'utf8');
      if (existing.includes(PRE_COMMIT_HOOK_MARKER)) {
        return ok(); // already installed
      }
      const updated = `${existing.trimEnd()}\n\n${PRE_COMMIT_HOOK_SCRIPT}\n`;
      await writeFile(hookPath, updated, { mode: 0o755 });
    } else {
      const content = `#!/bin/sh\n\n${PRE_COMMIT_HOOK_SCRIPT}\n`;
      await writeFile(hookPath, content, { mode: 0o755 });
    }

    try {
      await chmod(hookPath, 0o755);
    } catch {
      // Best-effort permissions
    }

    return ok();
  } catch (err) {
    return failure(`Could not install pre-commit hook: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Removes the Midnite Studio pre-commit secret scanner hook from the repository.
 */
export async function uninstallPreCommitHook(repoPath: string): Promise<GitOpResult> {
  try {
    const hookPath = await getPreCommitHookPath(repoPath);
    if (!existsSync(hookPath)) return ok();

    const content = await readFile(hookPath, 'utf8');
    if (!content.includes(PRE_COMMIT_HOOK_MARKER)) return ok();

    const startIdx = content.indexOf(PRE_COMMIT_HOOK_MARKER);
    const endMarker = '# --- End Midnite Studio Pre-Commit Secret Scanner ---';
    const endIdx = content.indexOf(endMarker);

    if (startIdx !== -1 && endIdx !== -1) {
      const before = content.slice(0, startIdx).trimEnd();
      const after = content.slice(endIdx + endMarker.length).trimStart();
      const remaining = [before, after].filter(Boolean).join('\n\n').trim();

      if (!remaining || remaining === '#!/bin/sh') {
        await unlink(hookPath);
      } else {
        await writeFile(hookPath, `${remaining}\n`, { mode: 0o755 });
      }
    } else {
      await unlink(hookPath);
    }

    return ok();
  } catch (err) {
    return failure(`Could not uninstall pre-commit hook: ${err instanceof Error ? err.message : String(err)}`);
  }
}
