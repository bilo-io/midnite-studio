import { spawn } from 'node:child_process';

import { type Forge, type ForgeCliStatus } from '@midnite/studio-shared';

import { isAuthenticated } from './gh-parse';

/**
 * How this app talks to `gh` at all — the primitives under every forge module.
 *
 * Extracted from `gh-cli.ts` when Phase 20's write half arrived. The spawn, the
 * quoting, the two host flags, the availability probe and the one-line failure
 * summary are not read-specific: `gh-write.ts` and `gh-graphql.ts` need every
 * one of them, and need them to behave *identically*, because two probe caches
 * would mean the read path and the write path can disagree about whether `gh`
 * holds a credential.
 *
 * Keeping them here rather than importing them out of `gh-cli.ts` is what lets
 * that file's "strictly reads" contract stay literally true — the write module
 * depends on the shell, not on the reader.
 */


const PROBE_TIMEOUT_MS = 8_000;
export const LIST_TIMEOUT_MS = 20_000;
/**
 * Longer than a listing, because a log is not a listing.
 *
 * `gh run view --log` makes the Actions API assemble and stream a zip of every
 * job's output before the first line appears; twenty seconds kills that on a
 * big matrix run and reports it as a failure the user cannot act on.
 */
export const LOG_TIMEOUT_MS = 60_000;

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

/**
 * Run one command line in a login shell.
 *
 * Exported for `gh-write.ts` alone. That module is the one deliberate write
 * surface (Phase 20 Theme E) and it needs the same login shell, the same
 * pager-and-colour environment and the same never-reject contract; giving it a
 * second copy would be two shells that drift, and a `.zshrc` quirk fixed in one
 * of them.
 *
 * `output` is both streams interleaved — what every JSON caller wants, since
 * `parseJsonPayload` seeks past shell banners and `describeFailure` reads
 * whichever stream `gh` complained on. `stdout` and `stderr` are kept apart as
 * well, because `gh run view --log` writes a *payload* that is not JSON: there
 * is no brace to seek to, so a `.zshrc` that prints on stderr would otherwise
 * end up interleaved into the log the user reads.
 */
export function runInShell(
  command: string,
  timeoutMs: number,
  options: { combine?: boolean } = {},
): Promise<{ output: string; stdout: string; stderr: string; exitCode: number | null }> {
  // Every JSON caller reads `output`; the log caller does not, and for it the
  // interleaved copy would be a second full transcript of a payload this file
  // elsewhere describes as "tens of megabytes".
  const combine = options.combine !== false;
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
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString('utf8');
      stdout += text;
      if (combine) output += text;
    });
    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString('utf8');
      stderr += text;
      if (combine) output += text;
    });

    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      resolvePromise({ output, stdout, stderr, exitCode: null });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ output, stdout, stderr, exitCode: code });
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

export const slug = (forge: Forge): string => `${forge.owner}/${forge.repo}`;

/**
 * `--repo [HOST/]OWNER/REPO` — the only way these commands take a host.
 *
 * `gh` supports GitHub Enterprise and the forge we parsed carries the real
 * host, so it has to travel; the mistake to avoid is `--hostname`, which reads
 * like the flag for this and is not one. `gh issue list --hostname x` exits
 * with `unknown flag`, as do `run list`, `run view`, `pr list` and
 * `workflow list` — `--hostname` belongs to `gh auth` and `gh api`. The
 * host-qualified `--repo` form is inherited by every one of them.
 *
 * github.com is left off rather than spelled out, because that is the form a
 * `gh` of any age accepts and the one every existing fixture carries.
 */
export const repoFlag = (forge: Forge): string => {
  const target = forge.host === 'github.com' ? slug(forge) : `${forge.host}/${slug(forge)}`;
  return `--repo ${shellQuote(target)}`;
};

/*
  Every name here is a field this `gh` actually publishes — `gh run list --json`
  with no value prints the legal set, and an unknown one makes the whole call
/** The longest an error message may be before it stops being one. */
const FAILURE_MESSAGE_MAX = 300;

/**
 * A listing failed even though the CLI is ready — say which, in one line.
 *
 * Two guards on what counts as that line, both learned the hard way. `gh
 * --json` prints its whole payload as a *single* line, so a run containing a
 * step named "Upload failed artifacts" would otherwise match the keyword scan
 * and put several hundred KB of JSON into a sidebar note — hence the skip for
 * anything that starts like a payload, and the length cap behind it for
 * whatever still gets through.
 */
export function describeFailure(output: string): string {
  const line = output
    .split('\n')
    .map((text) => text.trim())
    .filter((text) => text.length > 0 && !text.startsWith('{') && !text.startsWith('['))
    .find((text) => /error|denied|not found|could not|failed/i.test(text));

  if (line === undefined) return 'The GitHub CLI could not complete that request.';
  return line.length > FAILURE_MESSAGE_MAX ? `${line.slice(0, FAILURE_MESSAGE_MAX)}…` : line;
}

/**
 * `gh api` takes its host as `--hostname`, and only `gh api` does.
 *
 * The opposite of `repoFlag`'s rule, and the reason both exist: `gh pr view
 * --hostname x` exits with `unknown flag`, while `gh api --repo x` does the
 * same. Getting them the wrong way round fails only on GitHub Enterprise,
 * which is the configuration hardest to notice from here.
 */
export const apiHostFlag = (forge: Forge): string =>
  forge.host === 'github.com' ? '' : ` --hostname ${shellQuote(forge.host)}`;
