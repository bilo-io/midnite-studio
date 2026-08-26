import { spawn } from 'node:child_process';

import type { Forge, ForgeCliStatus, ForgePullsResult, ForgeRunsResult } from '@midnite/git-shared';

import { isAuthenticated, parseJsonPayload, parsePullList, parseRunList } from './gh-parse';

/**
 * The `gh` CLI, as the app's read-only window onto GitHub.
 *
 * Spawned through a login+interactive shell (`-lic`) for the same reason
 * `claude-cli.ts` does: a Homebrew or mise-managed `gh` exists only on the
 * PATH a real shell builds, and an app launched from Finder inherits a
 * minimal one. Everything fails soft — a missing or signed-out `gh` produces a
 * reason code the sidebar can render, never a rejection.
 *
 * Strictly reads. There is no merge, approve, rerun or comment path here on
 * purpose: the app links out to the forge for anything that changes state, so
 * no cached listing can ever cause a write.
 */

const PROBE_TIMEOUT_MS = 8_000;
const LIST_TIMEOUT_MS = 20_000;

const loginShell = (): string =>
  process.env['SHELL'] ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');

/**
 * Wrap one argument for a POSIX shell.
 *
 * Load-bearing, not defensive politeness: `owner` and `repo` are parsed out of
 * whatever URL is sitting in the user's `.git/config`, and a remote is a
 * string a repository can carry from anywhere. Single quotes disable every
 * expansion the shell has; the only character that can end the quoting is `'`
 * itself, which is closed, escaped and reopened.
 */
export function shellQuote(argument: string): string {
  return `'${argument.replaceAll("'", `'\\''`)}'`;
}

/** Run one command line in a login shell, capturing combined output. */
function runInShell(
  command: string,
  timeoutMs: number,
): Promise<{ output: string; exitCode: number | null }> {
  return new Promise((resolvePromise) => {
    const child = spawn(loginShell(), ['-lic', command], {
      env: {
        ...process.env,
        // `gh` paginates into a pager when it thinks it has a tty, and the
        // interactive shell is enough to convince it. A pager here would hang
        // until the timeout killed it.
        GH_PAGER: 'cat',
        PAGER: 'cat',
        // Colour codes would land inside the JSON payload.
        NO_COLOR: '1',
        CLICOLOR: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const collect = (data: Buffer): void => {
      output += data.toString('utf8');
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      resolvePromise({ output, exitCode: null });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ output, exitCode: code });
    });
  });
}

/** The last non-empty line that looks like an absolute path — shells print banners. */
export function parseWhichOutput(output: string): string | null {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('/'));
  return lines[lines.length - 1] ?? null;
}

/**
 * Is `gh` installed, and does it hold a credential?
 *
 * Cached for a short window because every sidebar section asks, and the probe
 * costs two shell spawns. The window is deliberately short: `gh auth login`
 * happens in a terminal beside the app, and a user who has just signed in
 * should not have to relaunch to be believed.
 */
const PROBE_CACHE_MS = 30_000;
let probeCache: { at: number; status: ForgeCliStatus } | null = null;

export async function ghStatus(force = false): Promise<ForgeCliStatus> {
  const now = Date.now();
  if (!force && probeCache && now - probeCache.at < PROBE_CACHE_MS) return probeCache.status;

  const which = await runInShell('command -v gh', PROBE_TIMEOUT_MS);
  const binPath = which.exitCode === 0 ? parseWhichOutput(which.output) : null;

  let status: ForgeCliStatus;
  if (!binPath) {
    status = {
      reason: 'not-installed',
      binPath: null,
      hint: 'Install the GitHub CLI — `brew install gh` — to see Actions and Reviews here.',
    };
  } else {
    const auth = await runInShell('gh auth status', PROBE_TIMEOUT_MS);
    status = isAuthenticated(auth.output, auth.exitCode)
      ? { reason: 'ready', binPath, hint: '' }
      : {
          reason: 'not-authenticated',
          binPath,
          hint: 'Run `gh auth login` in a terminal to see Actions and Reviews here.',
        };
  }

  probeCache = { at: now, status };
  return status;
}

/** Drop the probe cache — called after a listing fails on an auth error. */
export function invalidateGhProbe(): void {
  probeCache = null;
}

const slug = (forge: Forge): string => `${forge.owner}/${forge.repo}`;

/**
 * `--hostname` rather than assuming github.com.
 *
 * `gh` supports GitHub Enterprise, and the forge we parsed carries the real
 * host. Passing it means an Enterprise remote works with no extra
 * configuration; omitting it would silently query the wrong server.
 */
const hostFlag = (forge: Forge): string =>
  forge.host === 'github.com' ? '' : ` --hostname ${shellQuote(forge.host)}`;

const RUN_FIELDS = 'databaseId,name,status,conclusion,headBranch,headSha,createdAt,url';
const PULL_FIELDS =
  'number,title,state,isDraft,reviewDecision,headRefName,author,url,statusCheckRollup';

/** A listing failed even though the CLI is ready — say which, in one line. */
function describeFailure(output: string): string {
  const line = output
    .split('\n')
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .find((text) => /error|denied|not found|could not|failed/i.test(text));
  return line ?? 'The GitHub CLI could not complete that request.';
}

export async function listRuns(
  forge: Forge,
  options: { limit: number; branch?: string },
): Promise<ForgeRunsResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, runs: [], error: null };

  const branch = options.branch ? ` --branch ${shellQuote(options.branch)}` : '';
  const command =
    `gh run list --repo ${shellQuote(slug(forge))}${hostFlag(forge)}` +
    `${branch} --limit ${options.limit} --json ${RUN_FIELDS}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  const payload = parseJsonPayload(result.output);
  if (payload === null) {
    // A failure here can mean the token went stale between the probe and now.
    invalidateGhProbe();
    return { cli, runs: [], error: describeFailure(result.output) };
  }
  return { cli, runs: parseRunList(payload), error: null };
}

export async function listPulls(
  forge: Forge,
  options: { limit: number },
): Promise<ForgePullsResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, pulls: [], error: null };

  const command =
    `gh pr list --repo ${shellQuote(slug(forge))}${hostFlag(forge)}` +
    ` --state open --limit ${options.limit} --json ${PULL_FIELDS}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  const payload = parseJsonPayload(result.output);
  if (payload === null) {
    invalidateGhProbe();
    return { cli, pulls: [], error: describeFailure(result.output) };
  }
  return { cli, pulls: parsePullList(payload), error: null };
}
