import { z } from 'zod';

/**
 * The filesystem browser contract (Phase 16 reads, Phase 24 writes).
 *
 * Two scopes exist for browsing: a repository checkout, and `~/.claude` for
 * the Agent settings page. The renderer never sends an absolute path — every
 * request is `scope + relPath` and main joins, resolves and confines it.
 *
 * Writing is narrower on purpose (`FsWriteScopeSchema` below): repo only,
 * relative paths only, and the jail confines the *parent* of a write rather
 * than the write's own target — a create has no existing target to confine.
 * A stale write (the file moved since it was read) is reported through
 * `GitOpResult`'s ordinary error arm with `code: 'stale-write'`, not a
 * fs-shaped failure arm of its own; see `domain/result.ts`.
 */

/** Where a browse request is rooted. `repo` resolves through the repo registry. */
export const FsScopeSchema = z.enum(['repo', 'claude-home']);
export type FsScope = z.infer<typeof FsScopeSchema>;

/**
 * Where a WRITE request may be rooted. Narrower than {@link FsScopeSchema} —
 * `claude-home` is not a member, so a write naming it fails zod parsing at the
 * IPC boundary rather than being refused by a handler someone could later
 * "fix". Every fs write channel's request schema is built on this scope.
 */
export const FsWriteScopeSchema = z.literal('repo');
export type FsWriteScope = z.infer<typeof FsWriteScopeSchema>;

export const FsEntrySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['file', 'dir', 'symlink']),
  /** Bytes, for files; 0 for directories (a dir's disk size is not its meaning). */
  size: z.number().int().nonnegative(),
  /**
   * Matched by `.gitignore` (repo scope only — `~/.claude` is not a repo).
   * The tree dims these and never auto-expands them: `node_modules` must cost
   * nothing until the user opens it on purpose.
   */
  isIgnored: z.boolean(),
});
export type FsEntry = z.infer<typeof FsEntrySchema>;

/**
 * Cap on text file bytes crossing IPC. Past it the preview shows a fallback
 * card instead — the preview is for reading, and 1.5 MB is already far beyond
 * what anyone reads in a side pane.
 */
export const FS_TEXT_CAP_BYTES = 1.5 * 1024 * 1024;

/**
 * Cap on bytes a write may cross IPC with. Same ceiling as the read cap,
 * deliberately: if the editor could load a file for editing, it can save it
 * back at the same size, rather than tracking two numbers that can drift.
 */
export const FS_WRITE_CAP_BYTES = FS_TEXT_CAP_BYTES;

/**
 * Ceiling on entries a directory-stats walk will count for a delete confirm's
 * blast radius. A `node_modules`-sized tree exists to be deleted quickly, not
 * counted exactly — past the cap the walk stops and reports `truncated: true`
 * rather than costing the confirm dialog a multi-second stat pass.
 */
export const FS_DIR_STATS_WALK_CAP = 10_000;

/**
 * `git grep` mode and result caps for the Files view's find-in-files panel
 * (Phase 24 Theme E). Tracked content only — `git grep` never sees an
 * untracked file, and the empty state says so explicitly rather than reading
 * as an ordinary no-match.
 */
export const FsSearchModeSchema = z.enum(['fixed', 'regex']);
export type FsSearchMode = z.infer<typeof FsSearchModeSchema>;

/** Per-file cap, enforced natively by git's own `-m`. */
export const FS_SEARCH_MAX_MATCHES_PER_FILE = 50;

/** Total-response cap, enforced after parsing — `-m` only bounds one file. */
export const FS_SEARCH_MAX_MATCHES = 2000;

export const GrepMatchSchema = z.object({
  path: z.string().min(1),
  line: z.number().int().positive(),
  text: z.string(),
});
export type GrepMatch = z.infer<typeof GrepMatchSchema>;

/**
 * A cheap version token for optimistic-concurrency writes: `mtimeMs` and
 * `size` from the read that preceded the edit. `fsWriteFile` sends it back,
 * and main refuses when a `fstat` at write time disagrees — the guard against
 * a `git checkout` or an external editor landing between load and save.
 *
 * A content hash was considered and rejected: it costs a pass over every read
 * up to `FS_TEXT_CAP_BYTES` to catch touch-without-change, a case that loses
 * nothing, while `mtimeMs`/`size` already catch the case that does (something
 * else wrote the file).
 */
export const FsVersionSchema = z.object({
  mtimeMs: z.number(),
  size: z.number().int().nonnegative(),
});
export type FsVersion = z.infer<typeof FsVersionSchema>;

/**
 * The custom protocol media bytes stream through. Registered in main with the
 * same path jail as the fs channels; images/video/PDF never cross IPC as
 * payloads (no base64, and the protocol keeps range requests so video seeks).
 */
export const MSTUDIO_FILE_SCHEME = 'mstudio-file';

/**
 * Build a jailed media URL: `mstudio-file://<scope>/<repoId|->/<relPath>[?wt=…]`.
 *
 * The repoId slot is `-` for the claude-home scope so the URL shape stays
 * fixed-width and the protocol handler parses one format, not two. Segments
 * are individually encoded — file names contain spaces, `#`, `?`. A linked
 * worktree's checkout rides in `?wt=` and is validated in main against the
 * repo's real worktree list, exactly like the fs channels' `worktreePath`.
 */
export const mstudioFileUrl = (
  scope: FsScope,
  repoId: string | null,
  relPath: string,
  worktreePath?: string | null,
): string => {
  const segments = relPath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const query = worktreePath ? `?wt=${encodeURIComponent(worktreePath)}` : '';
  return `${MSTUDIO_FILE_SCHEME}://${scope}/${encodeURIComponent(repoId ?? '-')}/${segments}${query}`;
};


/**
 * Build a jailed URL for a file as it exists AT A REVISION, rather than in the
 * checkout: `mstudio-file://repo/<repoId>/<relPath>?rev=<rev>[&wt=…]`.
 *
 * Why the same scheme rather than an IPC payload: an image diff needs the
 * *pre-image* bytes, which are not on disk anywhere. Streaming them through the
 * protocol keeps the rule the Files preview already follows — media never
 * crosses IPC as base64 — and `<img src>` needs a URL either way.
 *
 * `rev` is a git revision as git itself spells it, and the object main asks for
 * is `<rev>:<relPath>`. A rev ending in `:` addresses the index, which is git's
 * own syntax (`:path` is stage 0), so `MSTUDIO_INDEX_REV` reads as the index side
 * of an unstaged diff without a second URL shape.
 */
export const mstudioBlobUrl = (
  repoId: string,
  rev: string,
  relPath: string,
  worktreePath?: string | null,
): string => {
  const base = mstudioFileUrl('repo', repoId, relPath, worktreePath);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}rev=${encodeURIComponent(rev)}`;
};

/** The index side of a diff — `git cat-file blob :path` is stage 0 of the index. */
export const MSTUDIO_INDEX_REV = ':';

/**
 * Ceiling on blob bytes the protocol will read out of git for one request.
 *
 * Higher than the text cap because this is what an image viewer displays, not
 * something anyone reads in a pane, and a 20 MB PSD-sized PNG in a diff is
 * unusual but not pathological. Past it the request 404s and the viewer says
 * the file is too large rather than buffering it.
 */
export const MSTUDIO_BLOB_MAX_BYTES = 32 * 1024 * 1024;

/**
 * Revisions the protocol will accept, as a whitelist rather than a blacklist.
 *
 * Everything the app actually asks for is a sha, `HEAD`, `<sha>^` or the index,
 * so the permitted alphabet is narrow on purpose. A leading `-` is refused
 * outright: `git cat-file` takes its object as a bare argument with no `--`
 * terminator, so a rev that looks like a flag must never reach it.
 */
export const isSafeBlobRev = (rev: string): boolean =>
  rev.length > 0 &&
  rev.length <= 256 &&
  !rev.startsWith('-') &&
  !rev.includes('..') &&
  /^[A-Za-z0-9._/^~@{}:-]+$/.test(rev);

// --- Claude CLI (Agent settings page) ---------------------------------------

/**
 * How the Claude CLI got onto this machine — decides which update/uninstall
 * command the Agent page offers. Detected best-effort from `which claude`.
 */
export const ClaudeInstallMethodSchema = z.enum(['npm', 'brew', 'native', 'unknown']);
export type ClaudeInstallMethod = z.infer<typeof ClaudeInstallMethodSchema>;

export const ClaudeInfoSchema = z.object({
  installed: z.boolean(),
  /** e.g. "2.1.34" — null when not installed or the output didn't parse. */
  version: z.string().nullable(),
  method: ClaudeInstallMethodSchema,
  /** Resolved binary path, for display; null when not installed. */
  binPath: z.string().nullable(),
});
export type ClaudeInfo = z.infer<typeof ClaudeInfoSchema>;

/**
 * The method-matched maintenance commands. Update runs in main with streamed
 * output; uninstall is only ever PASTED into the terminal (no trailing newline
 * — pressing Enter is the confirmation), never executed by the app.
 */
export const CLAUDE_COMMANDS: Record<
  ClaudeInstallMethod,
  { update: string; uninstall: string; install: string }
> = {
  npm: {
    update: 'npm install -g @anthropic-ai/claude-code',
    uninstall: 'npm uninstall -g @anthropic-ai/claude-code',
    install: 'npm install -g @anthropic-ai/claude-code',
  },
  brew: {
    update: 'brew upgrade claude-code',
    uninstall: 'brew uninstall claude-code',
    install: 'brew install claude-code',
  },
  native: {
    update: 'claude update',
    uninstall: 'rm -f ~/.local/bin/claude && rm -rf ~/.local/share/claude',
    install: 'curl -fsSL https://claude.ai/install.sh | bash',
  },
  unknown: {
    update: 'claude update',
    uninstall: 'npm uninstall -g @anthropic-ai/claude-code',
    install: 'npm install -g @anthropic-ai/claude-code',
  },
};
