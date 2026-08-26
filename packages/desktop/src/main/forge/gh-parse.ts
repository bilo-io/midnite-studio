import {
  ForgeIssueSchema,
  ForgeJobSchema,
  ForgePullSchema,
  ForgeStepSchema,
  ForgeRunSchema,
  ForgeWorkflowSchema,
  type ForgeChecksRollup,
  type ForgeIssue,
  type ForgeJob,
  type ForgePull,
  type ForgeRun,
  type ForgeRunDetail,
  type ForgeRunLog,
  type ForgeStep,
  type ForgeWorkflow,
} from '@midnite/git-shared';

/**
 * Turning `gh --json` output into the app's own shapes.
 *
 * Kept pure and separate from the process spawning so it can be tested under
 * bare vitest against captured fixtures — the same split `claude-cli.ts` makes
 * between `runInShell` and `parseClaudeVersion`.
 *
 * Every parser is total: `gh` is a moving target, and a field that changed
 * name in a release must degrade one row rather than blank the section. A row
 * that cannot be understood is dropped, never guessed at.
 */

/**
 * Parse `gh`'s stdout as JSON, tolerating the noise a login shell prepends.
 *
 * The probe runs through `$SHELL -lic`, so motd banners, version-update
 * notices and direnv chatter all land on the same stream before the payload.
 * Seeking to the first `[` or `{` is what makes the difference between a
 * working section and an empty one on a machine with a chatty `.zshrc`.
 */
export function parseJsonPayload(output: string): unknown {
  const start = output.search(/[[{]/);
  if (start === -1) return null;
  try {
    return JSON.parse(output.slice(start));
  } catch {
    // A banner containing a brace defeats the seek. Fall back to the last line
    // that parses on its own — `gh` prints its payload as a single line.
    for (const line of output.split('\n').reverse()) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) continue;
      try {
        return JSON.parse(trimmed);
      } catch {
        continue;
      }
    }
    return null;
  }
}

/** `gh` returns numbers for run ids; ours is a string so 2^53 cannot bite. */
const asId = (value: unknown): string | null => {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

/**
 * A timestamp, with GitHub's zero-time treated as absent.
 *
 * A job that never started carries `0001-01-01T00:00:00Z` rather than null,
 * and rendering that as a date puts the year 1 in the UI. It means "not yet",
 * which is exactly what null already means here.
 */
const asTimestamp = (value: unknown): string | null => {
  const text = asString(value);
  if (text === null) return null;
  return text.startsWith('0001-01-01') ? null : text;
};

/** `gh` sends `""` for an unfinished conclusion; the enum must not see it. */
const asConclusion = (value: unknown): string | null => asString(value);

/**
 * `gh run list --json databaseId,name,status,conclusion,headBranch,headSha,createdAt,url`
 *
 * `conclusion` arrives as `""` — not `null` — for a run still in flight, which
 * is why the empty string is normalised away before the enum sees it.
 */
export function parseRunList(payload: unknown): ForgeRun[] {
  if (!Array.isArray(payload)) return [];

  const runs: ForgeRun[] = [];
  for (const raw of payload) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const id = asId(row['databaseId'] ?? row['id']);
    const createdAt = asString(row['createdAt']);
    const url = asString(row['url']);
    if (id === null || createdAt === null || url === null) continue;

    const parsed = ForgeRunSchema.safeParse({
      id,
      name: asString(row['name'] ?? row['workflowName']) ?? 'workflow',
      status: row['status'],
      conclusion: asConclusion(row['conclusion']),
      headBranch: asString(row['headBranch']),
      headSha: asString(row['headSha']),
      createdAt,
      url,
      event: asString(row['event']),
      // The id, not the name, is what runs group by — see ForgeRun's own note.
      workflowId: asId(row['workflowDatabaseId']),
      workflowName: asString(row['workflowName']),
      startedAt: asTimestamp(row['startedAt']),
      updatedAt: asTimestamp(row['updatedAt']),
      displayTitle: asString(row['displayTitle']),
      number: asInt(row['number']),
      attempt: asInt(row['attempt']),
    });
    if (parsed.success) runs.push(parsed.data);
  }
  return runs;
}

/**
 * `gh issue list --json number,title,state,author,labels,assignees,updatedAt,createdAt,url`
 *
 * `state` arrives uppercase (`OPEN`/`CLOSED`), like every other `gh` enum.
 * `labels` is an array of objects and `assignees` an array of objects with a
 * `login` — both are flattened here so the renderer never has to know `gh`'s
 * nesting.
 */
export function parseIssueList(payload: unknown): ForgeIssue[] {
  if (!Array.isArray(payload)) return [];

  const issues: ForgeIssue[] = [];
  for (const raw of payload) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const parsed = ForgeIssueSchema.safeParse({
      number: row['number'],
      title: asString(row['title']) ?? '(no title)',
      state: asString(row['state'])?.toLowerCase(),
      author: asLogin(row['author']),
      labels: asLabels(row['labels']),
      assignees: Array.isArray(row['assignees'])
        ? row['assignees'].map(asLogin).filter((login) => login.length > 0)
        : [],
      updatedAt: asString(row['updatedAt']) ?? asString(row['createdAt']),
      createdAt: asString(row['createdAt']),
      url: asString(row['url']) ?? '',
    });
    if (parsed.success && parsed.data.url.length > 0) issues.push(parsed.data);
  }
  return issues;
}

/** `{login: 'x'}`, or a bare string, or a forge that withheld it. */
function asLogin(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    return asString((value as Record<string, unknown>)['login']) ?? '';
  }
  return '';
}

/** `[{name, color}]`, dropping anything without a name. */
function asLabels(value: unknown): { name: string; color: string }[] {
  if (!Array.isArray(value)) return [];
  const labels: { name: string; color: string }[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const name = asString((raw as Record<string, unknown>)['name']);
    if (name === null) continue;
    labels.push({ name, color: asString((raw as Record<string, unknown>)['color']) ?? '' });
  }
  return labels;
}

/**
 * Whether `gh` is telling us the repository has issues switched off.
 *
 * `gh issue list` exits non-zero for such a repo with a message naming it, and
 * that exit is the *only* signal — there is no JSON payload and no distinct
 * exit code. Matching the sentence is therefore load-bearing rather than
 * cosmetic, which is also why the fallback is to report an ordinary error: a
 * reworded message degrades to "something went wrong", never to a silent empty
 * list that would look like a repo with no issues.
 */
export function isIssuesDisabled(output: string): boolean {
  return /issues?\s+(?:are\s+)?disabled|has\s+disabled\s+issues|not\s+have\s+issues\s+enabled/i.test(
    output,
  );
}

/**
 * `gh run view <id> --json jobs,…`
 *
 * Returns null rather than a half-built detail when the run itself cannot be
 * understood: a job tree with no run above it has nothing to render against.
 * Individual jobs and steps still degrade one row at a time, as everywhere else.
 */
export function parseRunDetail(payload: unknown): ForgeRunDetail | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;

  // The run half of the payload has exactly the run-list shape, so it is parsed
  // by the run-list parser rather than by a second copy of the same field map.
  const [run] = parseRunList([row]);
  if (!run) return null;

  return { run, jobs: parseJobs(row['jobs']) };
}

function parseJobs(payload: unknown): ForgeJob[] {
  if (!Array.isArray(payload)) return [];

  const jobs: ForgeJob[] = [];
  for (const raw of payload) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const id = asId(row['databaseId'] ?? row['id']);
    if (id === null) continue;

    const parsed = ForgeJobSchema.safeParse({
      id,
      name: asString(row['name']) ?? 'job',
      status: row['status'],
      conclusion: asConclusion(row['conclusion']),
      startedAt: asTimestamp(row['startedAt']),
      completedAt: asTimestamp(row['completedAt']),
      url: asString(row['url']) ?? '',
      // `steps: []` is the normal shape for a job an `if:` skipped, not a
      // parse failure — see ForgeJob's own note.
      steps: parseSteps(row['steps']),
    });
    if (parsed.success) jobs.push(parsed.data);
  }
  return jobs;
}

/**
 * Steps, validated one at a time.
 *
 * Handing an unvalidated array to `ForgeJobSchema.safeParse` would let zod fail
 * the whole object over a single bad element — so one step in a status this
 * contract had not seen would delete the entire job from the tree, and the
 * sidebar would say a run with jobs has none. Each step is parsed on its own so
 * a row degrades a row, which is the rule everywhere else in this file.
 */
function parseSteps(payload: unknown): ForgeStep[] {
  if (!Array.isArray(payload)) return [];

  const steps: ForgeStep[] = [];
  for (const raw of payload) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const parsed = ForgeStepSchema.safeParse({
      number: row['number'],
      name: asString(row['name']) ?? 'step',
      status: row['status'],
      conclusion: asConclusion(row['conclusion']),
      startedAt: asTimestamp(row['startedAt']),
      completedAt: asTimestamp(row['completedAt']),
    });
    if (parsed.success) steps.push(parsed.data);
  }
  return steps;
}

/** `gh workflow list --json id,name,path,state` — the lazy file-path lookup. */
export function parseWorkflowList(payload: unknown): ForgeWorkflow[] {
  if (!Array.isArray(payload)) return [];

  const workflows: ForgeWorkflow[] = [];
  for (const raw of payload) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const parsed = ForgeWorkflowSchema.safeParse({
      id: asId(row['id']),
      name: asString(row['name']) ?? '',
      path: asString(row['path']),
      state: asString(row['state']),
    });
    if (parsed.success) workflows.push(parsed.data);
  }
  return workflows;
}

/** Bytes kept from the start and the end of an over-long log. */
export const LOG_HEAD_BYTES = 200_000;
export const LOG_TAIL_BYTES = 600_000;
/**
 * The ceiling even `full: true` will not go past.
 *
 * `full` exists so a user who needs the middle can have it; it does not exist
 * to let a 400MB log through a structured-clone across IPC and take the window
 * with it. Past this, the head/tail window stands and the UI keeps pointing at
 * GitHub.
 */
export const LOG_FULL_MAX_BYTES = 8_000_000;

/**
 * Cap a job log to a head-and-tail window, split into lines.
 *
 * The failure is at the end and the setup context is at the start; the middle
 * of a matrix job is the part nobody reads. Both windows are kept, the count of
 * what fell out is reported, and the byte size of the whole log travels with it
 * so the UI can offer the un-truncated fetch and say what it would cost.
 *
 * The split is on bytes, not lines: a log's line count says nothing about its
 * size, and a single line of minified webpack output can be megabytes on its own.
 */
export function parseRunLog(output: string, options: { full?: boolean } = {}): ForgeRunLog {
  // `gh` writes the log through the Actions API, which prefixes it with a BOM.
  const text = output.replace(/^\uFEFF/, '');
  const totalBytes = Buffer.byteLength(text, 'utf8');
  const ceiling = options.full === true ? LOG_FULL_MAX_BYTES : LOG_HEAD_BYTES + LOG_TAIL_BYTES;

  if (totalBytes <= ceiling) {
    return {
      lines: splitLines(text),
      truncated: false,
      omittedLines: 0,
      totalBytes,
      complete: true,
    };
  }

  /*
    Past the ceiling the head/tail split stands, `full` or not.

    `full` widens the window; it does not change which end of a log matters.
    Returning the first 8MB of a 20MB matrix log would take the failure — the
    reason the log was opened — and drop it, which is a worse answer than the
    capped view the user clicked away from.
  */
  const scale = options.full === true ? LOG_FULL_MAX_BYTES / (LOG_HEAD_BYTES + LOG_TAIL_BYTES) : 1;
  const head = Math.floor(LOG_HEAD_BYTES * scale);
  const tail = Math.floor(LOG_TAIL_BYTES * scale);

  const buffer = Buffer.from(text, 'utf8');
  const headLines = splitLines(buffer.subarray(0, head).toString('utf8'));
  const tailLines = splitLines(buffer.subarray(buffer.length - tail).toString('utf8'));

  // The boundary lines are almost certainly cut mid-line; dropping the partial
  // halves is better than showing half a stack frame as if it were whole.
  if (headLines.length > 0) headLines.pop();
  if (tailLines.length > 0) tailLines.shift();

  // Counted rather than split: `text` is by definition over the cap here, and
  // allocating an array of every line of an 8MB log purely to read its length
  // is the kind of work main should not be doing while the renderer waits.
  const omittedLines = Math.max(0, countLines(text) - headLines.length - tailLines.length);

  return {
    lines: [...headLines, logGapMarker(omittedLines), ...tailLines],
    truncated: true,
    omittedLines,
    totalBytes,
    complete: false,
  };
}

/** The one line the UI is guaranteed to find in place of what was dropped. */
export const logGapMarker = (omitted: number): string =>
  `··· ${omitted.toLocaleString('en-US')} lines omitted — open the run on GitHub for the full log ···`;

/** How many lines `splitLines` would produce, without producing them. */
function countLines(text: string): number {
  if (text.length === 0) return 0;
  let lines = 0;
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) lines += 1;
  // A trailing newline is punctuation, not a blank last line — the same rule
  // `splitLines` applies, and the two must agree or the omitted count is off.
  return text.endsWith('\n') ? lines : lines + 1;
}

function splitLines(text: string): string[] {
  const lines = text.split('\n');
  // A trailing newline is punctuation, not a blank last line.
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Reduce `gh`'s per-check array to one traffic light.
 *
 * Worst-wins, with "still running" beating "all green": a PR whose lint has
 * passed and whose tests are mid-flight is pending, not passing. Only a set
 * where every check has finished and none failed earns `passing`.
 */
export function rollupChecks(payload: unknown): ForgeChecksRollup | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;

  let pending = false;
  for (const raw of payload) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;
    // `gh pr list --json statusCheckRollup` mixes two shapes: check runs carry
    // `status`/`conclusion`, legacy commit statuses carry `state`.
    const state = asString(row['conclusion']) ?? asString(row['state']);
    const status = asString(row['status']);

    if (
      state === 'FAILURE' ||
      state === 'ERROR' ||
      state === 'TIMED_OUT' ||
      state === 'CANCELLED'
    ) {
      return 'failing';
    }
    if (status !== null && status !== 'COMPLETED') pending = true;
    else if (state === null || state === 'PENDING' || state === 'EXPECTED') pending = true;
  }
  return pending ? 'pending' : 'passing';
}

/**
 * `gh pr list --json number,title,state,isDraft,reviewDecision,headRefName,author,url,statusCheckRollup`
 *
 * `state` arrives uppercase (`OPEN`); `reviewDecision` is `""` when nobody has
 * reviewed and no rule demands one — distinct from `REVIEW_REQUIRED`.
 */
export function parsePullList(payload: unknown): ForgePull[] {
  if (!Array.isArray(payload)) return [];

  const pulls: ForgePull[] = [];
  for (const raw of payload) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const parsed = ForgePullSchema.safeParse({
      number: row['number'],
      title: asString(row['title']) ?? '(no title)',
      state: asString(row['state'])?.toLowerCase(),
      isDraft: row['isDraft'] === true,
      reviewDecision: asString(row['reviewDecision']),
      checks: rollupChecks(row['statusCheckRollup']),
      headBranch: asString(row['headRefName']) ?? '',
      author: asLogin(row['author']),
      url: asString(row['url']) ?? '',
    });
    if (parsed.success && parsed.data.url.length > 0) pulls.push(parsed.data);
  }
  return pulls;
}

/**
 * Whether `gh auth status` reports a usable credential.
 *
 * Read from the output rather than the exit code alone: `gh auth status`
 * exits 1 both when signed out and when one of several configured hosts has a
 * bad token, and the second case still leaves github.com working.
 */
export function isAuthenticated(output: string, exitCode: number | null): boolean {
  if (exitCode === 0) return true;
  return /logged in to \S+ (?:account|as)/i.test(output);
}
