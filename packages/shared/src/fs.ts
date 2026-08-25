import { z } from 'zod';

/**
 * The read-only filesystem browser contract (Phase 16).
 *
 * Two scopes exist and only two: a repository checkout, and `~/.claude` for the
 * Agent settings page. The renderer never sends an absolute path — every
 * request is `scope + relPath` and main joins, resolves and confines it. There
 * is deliberately no write/rename/delete channel: "read-only" is a property of
 * this contract, not of whichever buttons the UI happens to render.
 */

/** Where a browse request is rooted. `repo` resolves through the repo registry. */
export const FsScopeSchema = z.enum(['repo', 'claude-home']);
export type FsScope = z.infer<typeof FsScopeSchema>;

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
 * The custom protocol media bytes stream through. Registered in main with the
 * same path jail as the fs channels; images/video/PDF never cross IPC as
 * payloads (no base64, and the protocol keeps range requests so video seeks).
 */
export const MGIT_FILE_SCHEME = 'mgit-file';

/**
 * Build a jailed media URL: `mgit-file://<scope>/<repoId|->/<relPath>[?wt=…]`.
 *
 * The repoId slot is `-` for the claude-home scope so the URL shape stays
 * fixed-width and the protocol handler parses one format, not two. Segments
 * are individually encoded — file names contain spaces, `#`, `?`. A linked
 * worktree's checkout rides in `?wt=` and is validated in main against the
 * repo's real worktree list, exactly like the fs channels' `worktreePath`.
 */
export const mgitFileUrl = (
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
  return `${MGIT_FILE_SCHEME}://${scope}/${encodeURIComponent(repoId ?? '-')}/${segments}${query}`;
};

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
