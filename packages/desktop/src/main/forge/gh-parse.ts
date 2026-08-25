import {
  ForgePullSchema,
  ForgeRunSchema,
  type ForgeChecksRollup,
  type ForgePull,
  type ForgeRun,
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
      conclusion: asString(row['conclusion']),
      headBranch: asString(row['headBranch']),
      headSha: asString(row['headSha']),
      createdAt,
      url,
    });
    if (parsed.success) runs.push(parsed.data);
  }
  return runs;
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

    const author = row['author'];
    const login =
      typeof author === 'object' && author !== null
        ? (asString((author as Record<string, unknown>)['login']) ?? '')
        : (asString(author) ?? '');

    const parsed = ForgePullSchema.safeParse({
      number: row['number'],
      title: asString(row['title']) ?? '(no title)',
      state: asString(row['state'])?.toLowerCase(),
      isDraft: row['isDraft'] === true,
      reviewDecision: asString(row['reviewDecision']),
      checks: rollupChecks(row['statusCheckRollup']),
      headBranch: asString(row['headRefName']) ?? '',
      author: login,
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
