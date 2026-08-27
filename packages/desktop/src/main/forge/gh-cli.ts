import { spawn } from 'node:child_process';

import { parseMultiFileDiff } from '@midnite/git-engine';
import {
  DIFF_DEFAULT_CONTEXT,
  PULL_PATCH_BYTE_CAP,
  type Forge,
  type ForgeCliStatus,
  type ForgeIssuesResult,
  type ForgePullCommentsResult,
  type ForgePullDetailResult,
  type ForgePullFilesResult,
  type ForgePullsResult,
  type ForgeRunDetail,
  type ForgeRunDetailResult,
  type ForgeRunLog,
  type ForgeRunLogResult,
  type ForgeRunsResult,
  type ForgeWorkflowsResult,
} from '@midnite/git-shared';

import {
  isAuthenticated,
  isIssuesDisabled,
  mergeConversation,
  parseIssueComments,
  parseIssueList,
  parseJsonPayload,
  parsePullDetail,
  parsePullList,
  parsePullReviews,
  parseRunDetail,
  parseRunList,
  parseRunLog,
  parseWorkflowList,
} from './gh-parse';

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
export const LIST_TIMEOUT_MS = 20_000;
/**
 * Longer than a listing, because a log is not a listing.
 *
 * `gh run view --log` makes the Actions API assemble and stream a zip of every
 * job's output before the first line appears; twenty seconds kills that on a
 * big matrix run and reports it as a failure the user cannot act on.
 */
const LOG_TIMEOUT_MS = 60_000;

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
  exit non-zero rather than degrade. Notably absent, and asked about often:
  there is no `actor` field on a run listing at any version, which is why
  `ForgeRun` has no actor to fill.
*/
const RUN_FIELDS =
  'databaseId,name,status,conclusion,headBranch,headSha,createdAt,url,' +
  'event,workflowDatabaseId,workflowName,startedAt,updatedAt,displayTitle,number,attempt';
const RUN_DETAIL_FIELDS = `${RUN_FIELDS},jobs`;
const ISSUE_FIELDS = 'number,title,state,author,labels,assignees,updatedAt,createdAt,url';
const WORKFLOW_FIELDS = 'id,name,path,state';
const PULL_FIELDS =
  'number,title,state,isDraft,reviewDecision,headRefName,author,url,statusCheckRollup,' +
  'mergedAt,closedAt';
/*
  `gh pr view --json` accepts every `pr list` field plus the ones only a single
  PR has. `headRefOid` is the one that matters most here: it is the head sha the
  Checks tab matches against `ForgeRun.headSha`, and no listing field carries
  it. `body`, `additions`, `deletions` and `changedFiles` are the detail
  header's own facts.
*/
const PULL_DETAIL_FIELDS =
  `${PULL_FIELDS},body,headRefOid,baseRefName,additions,deletions,changedFiles,` +
  'createdAt,updatedAt,mergeable';

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

export async function listRuns(
  forge: Forge,
  options: { limit: number; branch?: string; workflow?: string },
): Promise<ForgeRunsResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, runs: [], error: null };

  const branch = options.branch ? ` --branch ${shellQuote(options.branch)}` : '';
  // `--workflow` takes either the file name or the display name; the caller
  // passes whichever it holds, and `gh` resolves it.
  const workflow = options.workflow ? ` --workflow ${shellQuote(options.workflow)}` : '';
  const command =
    `gh run list ${repoFlag(forge)}` +
    `${branch}${workflow} --limit ${options.limit} --json ${RUN_FIELDS}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  const payload = parseJsonPayload(result.output);
  if (payload === null) {
    // A failure here can mean the token went stale between the probe and now.
    invalidateGhProbe();
    return { cli, runs: [], error: describeFailure(result.output) };
  }
  return { cli, runs: parseRunList(payload), error: null };
}

/**
 * `state` is the caller's choice, not a hardcoded `open` — the Reviews view
 * (Phase 20 B) asks for `all` and filters into status tabs of its own, while
 * every other caller (the sidebar section, the dashboard widget) keeps
 * asking for `open`, exactly as Phase 17 shipped. Filtering `all` down to
 * `open` after the fact would not do the same job: `--limit` counts PRs of
 * whichever state was asked for, so a caller that wants N *open* PRs has to
 * say so before the limit is applied, not after.
 */
export async function listPulls(
  forge: Forge,
  options: { limit: number; state: 'open' | 'closed' | 'merged' | 'all' },
): Promise<ForgePullsResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, pulls: [], error: null };

  const command =
    `gh pr list ${repoFlag(forge)}` +
    ` --state ${options.state} --limit ${options.limit} --json ${PULL_FIELDS}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  const payload = parseJsonPayload(result.output);
  if (payload === null) {
    invalidateGhProbe();
    return { cli, pulls: [], error: describeFailure(result.output) };
  }
  return { cli, pulls: parsePullList(payload), error: null };
}

/**
 * One pull request's own facts — the half a listing row does not carry.
 *
 * Paid only when a PR is opened. Everything the sidebar draws already came with
 * `listPulls`, so this second subprocess buys the body, the head sha and the
 * line counts, and nothing the list could have supplied.
 */
export async function pullDetail(forge: Forge, number: number): Promise<ForgePullDetailResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, detail: null, error: null };

  const command = `gh pr view ${number} ${repoFlag(forge)} --json ${PULL_DETAIL_FIELDS}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  const payload = parseJsonPayload(result.output);
  const detail = payload === null ? null : parsePullDetail(payload);
  if (detail === null) {
    invalidateGhProbe();
    return { cli, detail: null, error: describeFailure(result.output) };
  }
  return { cli, detail, error: null };
}

/**
 * Drop whatever a login shell printed before the patch began.
 *
 * The JSON callers seek to the first brace; a patch has no brace to seek to, so
 * the recognisable boundary is `diff --git`. Like `stripShellPreamble`, this
 * gives up rather than guessing: a patch with no such header is passed through
 * whole, because `parseMultiFileDiff` handles a header-less section and a
 * heuristic that ate output it did not understand would silently lose files.
 */
export function stripPatchPreamble(text: string): string {
  const lines = text.split('\n');
  const first = lines.findIndex((line) => line.startsWith('diff --git '));
  if (first <= 0) return text;
  return lines.slice(first).join('\n');
}

/**
 * Cut a patch down to a byte ceiling, preferring a file boundary.
 *
 * A boundary, because half a hunk is not a diff: the parser reads a truncated
 * tail as ordinary body lines and renders a file whose last change silently
 * vanished. Dropping whole trailing files and counting them is the honest
 * version of the same cap.
 *
 * **But the ceiling is a ceiling.** Two shapes have no boundary to cut at — a
 * one-file patch, and a header-less one, which `stripPatchPreamble` deliberately
 * passes through untouched. For those the text is sliced by lines instead:
 * a truncated diff that says `truncated` is bad, and shipping twenty-eight
 * megabytes of regenerated lockfile through zod and over IPC is worse. The one
 * carve-out kept is the FIRST file of a multi-file patch, which survives whole
 * however large it is — returning nothing at all would report "no changes" for
 * a pull request that has them.
 *
 * Pure, and exported, so the rule can be tested without a subprocess — getting
 * it wrong is invisible in the UI, which is exactly the failure `ForgeRunLog`'s
 * head-and-tail contract was written to rule out for logs.
 */
export function capPatch(
  patch: string,
  byteCap: number,
): { patch: string; truncated: boolean; omittedFiles: number; totalBytes: number } {
  const totalBytes = Buffer.byteLength(patch, 'utf8');
  if (totalBytes <= byteCap) {
    return { patch, truncated: false, omittedFiles: 0, totalBytes };
  }

  const lines = patch.split('\n');
  // Byte cost of each line including the newline that rejoins it, so a prefix
  // sum answers "how big is the patch up to here" without re-measuring.
  const cost = lines.map((line) => Buffer.byteLength(line, 'utf8') + 1);
  const headers: number[] = [];
  lines.forEach((line, index) => {
    if (line.startsWith('diff --git ')) headers.push(index);
  });

  if (headers.length <= 1) {
    return { patch: sliceLinesToBytes(lines, cost, byteCap), truncated: true, omittedFiles: 0, totalBytes };
  }

  let bytes = 0;
  let filesKept = 0;
  for (let index = 0; index < headers.length; index += 1) {
    const start = headers[index]!;
    const end = headers[index + 1] ?? lines.length;
    let size = 0;
    for (let line = start; line < end; line += 1) size += cost[line]!;

    // `index > 0` is the carve-out: the first file is always kept, so a
    // single over-cap file at the head of a patch is still shown.
    if (index > 0 && bytes + size > byteCap) break;
    bytes += size;
    filesKept = index + 1;
  }

  const cutAt = headers[filesKept] ?? lines.length;
  return {
    patch: lines.slice(0, cutAt).join('\n'),
    truncated: true,
    omittedFiles: headers.length - filesKept,
    totalBytes,
  };
}

/**
 * The longest whole-line prefix of `lines` that fits in `byteCap`.
 *
 * Lines, not bytes, so the cut can never land inside a multi-byte character —
 * a patch is arbitrary source text and slicing a UTF-8 sequence in half would
 * produce a replacement character in the middle of somebody's code.
 */
function sliceLinesToBytes(lines: readonly string[], cost: readonly number[], byteCap: number): string {
  let bytes = 0;
  let count = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (bytes + cost[index]! > byteCap) break;
    bytes += cost[index]!;
    count = index + 1;
  }
  return lines.slice(0, count).join('\n');
}

/**
 * A pull request's diff, parsed into per-file hunks here in main.
 *
 * Bare `gh pr diff`, and **not `--patch`.** They are different formats, and the
 * flag that reads like "give me the real patch" is the wrong one: `--patch`
 * requests GitHub's `.patch` media type, which is `git format-patch` output —
 * one mbox entry PER COMMIT, each with its own `From <sha>` header, subject,
 * message, `---` separator and diffstat before its own `diff --git` sections.
 * On a two-commit PR that touches a file twice, the file appears twice, and
 * every mbox header after the first lands inside the previous file's section
 * where the parser reads it as diff body. Bare `gh pr diff` is the combined
 * unified diff — every path exactly once — which is precisely the shape
 * `parseMultiFileDiff` was written for.
 *
 * So it goes through git-engine's parser rather than a second one: renames,
 * combined hunks and `\ No newline` are already solved there and would be
 * re-solved slightly differently anywhere else.
 *
 * Not cached: unlike a finished run's log, an open PR's diff changes every time
 * its author pushes, and a cache keyed on the PR number would show yesterday's
 * patch under today's head sha with nothing saying so.
 */
export async function pullFiles(forge: Forge, number: number): Promise<ForgePullFilesResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, files: null, error: null };

  const command = `gh pr diff ${number} ${repoFlag(forge)}`;

  // `combine: false` for the same reason the log call uses it: this payload is
  // not JSON, so there is no brace to seek past and a `.zshrc` that greets on
  // stderr would land inside the patch.
  const result = await runInShell(command, LIST_TIMEOUT_MS, { combine: false });
  if (result.exitCode !== 0) {
    invalidateGhProbe();
    return { cli, files: null, error: describeFailure(result.stderr) };
  }

  const patch = stripPatchPreamble(result.stdout);
  const capped = capPatch(patch, PULL_PATCH_BYTE_CAP);
  const files = parseMultiFileDiff(capped.patch, {
    contextLines: DIFF_DEFAULT_CONTEXT,
    fallbackPath: `pull-${number}`,
  });

  return {
    cli,
    files: {
      files,
      truncated: capped.truncated,
      omittedFiles: capped.omittedFiles,
      totalBytes: capped.totalBytes,
    },
    error: null,
  };
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

/**
 * How much of a conversation is worth reading in a git client.
 *
 * One page. A PR with more than a hundred comments is one whose discussion
 * belongs on GitHub, and `--paginate` on a thread that long is several
 * sequential API calls for prose nobody scrolls to in this window.
 */
const CONVERSATION_PAGE = 100;

/**
 * A pull request's top-level conversation, from both of GitHub's collections.
 *
 * Two calls, run concurrently. They are separate REST resources — discussion
 * comments hang off the issue, review submissions off the pull — and neither
 * endpoint can return the other's rows. A failure in either is reported rather
 * than silently halving the thread.
 */
export async function pullComments(
  forge: Forge,
  number: number,
): Promise<ForgePullCommentsResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, comments: [], error: null };

  const host = apiHostFlag(forge);
  const api = (path: string): string =>
    `gh api ${shellQuote(`repos/${slug(forge)}/${path}?per_page=${CONVERSATION_PAGE}`)}${host}`;

  const [comments, reviews] = await Promise.all([
    runInShell(api(`issues/${number}/comments`), LIST_TIMEOUT_MS),
    runInShell(api(`pulls/${number}/reviews`), LIST_TIMEOUT_MS),
  ]);

  /*
    Either failing is a failure, and the exit code is the only reliable signal.

    `gh api` prints its ERROR BODY as JSON — `{"message":"Not Found",…}` — so a
    404 parses perfectly well, and the parsers turn a non-array into an empty
    list. Judging success by "did the payload parse" would report a pull request
    the token cannot read as one nobody has commented on, and a rate-limited
    reviews call as a PR with no verdicts. Both are silently wrong in the
    direction that looks normal.
  */
  const failed = [comments, reviews].find((result) => result.exitCode !== 0);
  if (failed !== undefined) {
    invalidateGhProbe();
    return { cli, comments: [], error: describeFailure(failed.output) };
  }

  return {
    cli,
    comments: mergeConversation(
      parseIssueComments(parseJsonPayload(comments.output)),
      parsePullReviews(parseJsonPayload(reviews.output)),
    ),
    error: null,
  };
}

/**
 * Open issues, or the honest news that this repository has none to give.
 *
 * `gh issue list` exits non-zero against a repository with issues switched off.
 * That is a configuration, not a fault: it comes back as `disabled`, which the
 * sidebar states in a sentence and the dashboard uses to drop its Issues widget
 * outright, rather than as an `error` that would paint a red card on a
 * repository behaving exactly as its owner set it up.
 */
export async function listIssues(
  forge: Forge,
  options: { limit: number; state: 'open' | 'closed' | 'all' },
): Promise<ForgeIssuesResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, issues: [], disabled: false, error: null };

  const command =
    `gh issue list ${repoFlag(forge)}` +
    ` --state ${options.state} --limit ${options.limit} --json ${ISSUE_FIELDS}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  const payload = parseJsonPayload(result.output);
  if (payload === null) {
    if (isIssuesDisabled(result.output)) {
      return { cli, issues: [], disabled: true, error: null };
    }
    invalidateGhProbe();
    return { cli, issues: [], disabled: false, error: describeFailure(result.output) };
  }
  return { cli, issues: parseIssueList(payload), disabled: false, error: null };
}

/**
 * Workflow definitions, and the only place a `.yml` path comes from.
 *
 * Runs group by `workflowId`, which the run list already carries, so this is
 * never on the path that renders a list — only on the path that renders a
 * *link*. Cached per repository for the same window as the CLI probe, because
 * a repository's set of workflows changes when someone edits `.github/`, not
 * while you are looking at it.
 */
const workflowCache = new Map<string, { at: number; result: ForgeWorkflowsResult }>();
const WORKFLOW_CACHE_MS = 5 * 60_000;

export async function listWorkflows(forge: Forge): Promise<ForgeWorkflowsResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, workflows: [], error: null };

  const key = `${forge.host}/${slug(forge)}`;
  const cached = workflowCache.get(key);
  if (cached && Date.now() - cached.at < WORKFLOW_CACHE_MS) return cached.result;

  // `--limit` defaults to 50, and this listing exists solely to resolve
  // workflow ids to paths — an overflowing repo would have links that can never
  // resolve, cached for five minutes with no way to ask again.
  const command = `gh workflow list ${repoFlag(forge)} --all --limit 200 --json ${WORKFLOW_FIELDS}`;

  const run = await runInShell(command, LIST_TIMEOUT_MS);
  const payload = parseJsonPayload(run.output);
  if (payload === null) {
    invalidateGhProbe();
    return { cli, workflows: [], error: describeFailure(run.output) };
  }

  const result: ForgeWorkflowsResult = { cli, workflows: parseWorkflowList(payload), error: null };
  workflowCache.set(key, { at: Date.now(), result });
  return result;
}

/**
 * Run detail and logs, cached once — and only once — the run has finished.
 *
 * A completed run is immutable: its job tree and its log will never say anything
 * different, so re-opening yesterday's failure should not cost a subprocess and
 * a rate-limited API call. An in-flight run is the opposite and is never cached
 * at all, so the explicit Refresh the forge sections already have keeps meaning
 * what it says.
 *
 * Bounded rather than unbounded because these are the largest payloads the app
 * holds: an LRU of a few dozen logs is a few megabytes of main-process memory,
 * and a session spent triaging CI would otherwise grow one entry per click for
 * as long as the app is open.
 */
const RUN_CACHE_MAX = 20;
const runDetailCache = new Map<string, ForgeRunDetail>();
const runLogCache = new Map<string, ForgeRunLog>();

function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  // Re-inserting moves the key to the end, which is what makes a plain Map an
  // LRU: `keys().next()` is then always the least recently touched.
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > RUN_CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return value;
}

function recall<T>(cache: Map<string, T>, key: string): T | undefined {
  const hit = cache.get(key);
  if (hit !== undefined) remember(cache, key, hit);
  return hit;
}

/** Drop every cached run payload — for tests, and for a hard refresh. */
export function clearForgeRunCache(): void {
  runDetailCache.clear();
  runLogCache.clear();
  workflowCache.clear();
}

export async function runDetail(forge: Forge, runId: string): Promise<ForgeRunDetailResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, detail: null, error: null };

  const key = `${forge.host}/${slug(forge)}#${runId}`;
  const cached = recall(runDetailCache, key);
  if (cached) return { cli, detail: cached, error: null };

  const command = `gh run view ${shellQuote(runId)} ${repoFlag(forge)} --json ${RUN_DETAIL_FIELDS}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  const payload = parseJsonPayload(result.output);
  const detail = payload === null ? null : parseRunDetail(payload);
  if (detail === null) {
    invalidateGhProbe();
    return { cli, detail: null, error: describeFailure(result.output) };
  }

  if (detail.run.status === 'completed') remember(runDetailCache, key, detail);
  return { cli, detail, error: null };
}

/**
 * Whether `gh` is saying the run has not finished, so there is no log yet.
 *
 * GitHub serves logs only for completed runs; `gh` reports that on stderr and
 * exits non-zero. Rendering it as an error would put a failure card on a run
 * that is simply still going.
 */
export function isLogPending(output: string): boolean {
  return /still\s+in\s+progress|has\s+not\s+completed|logs?\s+will\s+be\s+available/i.test(output);
}

export async function runLog(
  forge: Forge,
  runId: string,
  options: { jobId?: string; full?: boolean } = {},
): Promise<ForgeRunLogResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, log: null, pending: false, error: null };

  const scope = options.jobId ? ` --job ${shellQuote(options.jobId)}` : '';
  const key = `${forge.host}/${slug(forge)}#${runId}${scope}${options.full === true ? '!full' : ''}`;
  const cached = recall(runLogCache, key);
  if (cached) return { cli, log: cached, pending: false, error: null };

  const command = `gh run view ${shellQuote(runId)} ${repoFlag(forge)}${scope} --log`;

  // A log is the one call here that can genuinely take a while: the Actions API
  // streams a zip of every job's output before `gh` prints a line of it.
  const result = await runInShell(command, LOG_TIMEOUT_MS, { combine: false });
  const verdict = logVerdict(result, options.full === true);

  if (verdict.log !== null) {
    // Logs exist only for finished runs, so a log we managed to fetch is by
    // definition immutable — no status check needed before caching it.
    remember(runLogCache, key, verdict.log);
  } else if (verdict.error !== null) {
    invalidateGhProbe();
  }
  return { cli, ...verdict };
}

/**
 * What a finished `gh run view --log` actually told us.
 *
 * Pure, and separate from the spawn, so the rule below can be tested without a
 * subprocess — which matters because getting it wrong is silent.
 *
 * **The exit code is the failure signal, and emptiness is not.** `gh` prints
 * whatever job logs it managed to fetch BEFORE exiting non-zero over the ones
 * it could not, and the 60s timeout kills it mid-stream the same way. Treating
 * non-empty stdout as success would hand that partial transcript to
 * `parseRunLog`, which would call it `truncated: false, complete: true` and
 * cache it — precisely the silently-short log `ForgeRunLog` was shaped to make
 * impossible.
 *
 * The verdict is read off **stderr**, never the combined stream: a login shell
 * that greets on stdout would otherwise be mistaken for a log, and "the run is
 * still going" would be reported as a failure.
 */
export function logVerdict(
  result: { stdout: string; stderr: string; exitCode: number | null },
  full: boolean,
): Omit<ForgeRunLogResult, 'cli'> {
  if (result.exitCode !== 0) {
    if (isLogPending(result.stderr)) return { log: null, pending: true, error: null };
    return { log: null, pending: false, error: describeFailure(result.stderr) };
  }

  // stdout only. Unlike the JSON calls there is no brace to seek past, so a
  // shell that greets on stderr would otherwise be interleaved into the log.
  const text = stripShellPreamble(result.stdout);
  if (text.length === 0) {
    return { log: null, pending: isLogPending(result.stderr), error: null };
  }

  return { log: parseRunLog(text, { ...(full ? { full: true } : {}) }), pending: false, error: null };
}

/**
 * Drop anything printed before the log itself began.
 *
 * Every line `gh run view --log` emits is `job\tstep\ttimestamp message`, so
 * the first tab-bearing line is where the payload starts and anything above it
 * came from the user's shell profile. If no line has a tab there is nothing to
 * recognise and the text is passed through whole — a heuristic that gives up
 * rather than one that eats output it did not understand.
 */
export function stripShellPreamble(text: string): string {
  const lines = text.split('\n');
  const first = lines.findIndex((line) => line.includes('\t'));
  if (first <= 0) return text;
  return lines.slice(first).join('\n');
}
