import { z } from 'zod';

/**
 * MCP servers are trusted by hash, not by name — Phase 121 Theme C.
 *
 * Every agent CLI loads whatever `.mcp.json` a repo carries, and a name says nothing about what the entry
 * runs. The allowlist (`<userData>/security/mcp-trust.json`) pins, per `(repoId, serverName)`, a SHA-256 of
 * the canonicalised config entry (an edit after approval is MCPoison) and, once the app has seen the
 * server's `tools/list`, a SHA-256 of that (a change is a rug-pull). The wire types here are what the Tools
 * view shows; the hashing, discovery and the poisoned-description checks live in `runtime/src/security/`.
 */

/** Where a server was found. All read-only: the app never writes any of these files. */
export const MCP_SERVER_SOURCES = ['repo-mcp-json', 'cursor', 'vscode', 'claude-user', 'codex-user'] as const;
export const McpServerSourceSchema = z.enum(MCP_SERVER_SOURCES);
export type McpServerSource = z.infer<typeof McpServerSourceSchema>;

export const MCP_SERVER_SOURCE_LABELS: Record<McpServerSource, string> = {
  'repo-mcp-json': '.mcp.json',
  cursor: '.cursor/mcp.json',
  vscode: '.vscode/mcp.json',
  'claude-user': '~/.claude.json',
  'codex-user': '~/.codex/config.toml',
};

/** Sources a cloned repository controls: the ones MCPoison abused, so they gate a run until approved. */
export const MCP_REPO_SCOPED_SOURCES: ReadonlySet<McpServerSource> = new Set<McpServerSource>(['repo-mcp-json', 'cursor', 'vscode']);

/**
 * Why a server is not approved.
 * - `new`: no allowlist entry.
 * - `config-changed`: the entry was approved, then edited (MCPoison).
 * - `tools-changed`: the config matches, the `tools/list` does not (rug-pull).
 * - `held`: a tool description instructs the model, names another server's tool, or collides with a trusted
 *   server's tool; Approve is refused until it is gone.
 */
export const McpTrustVerdictSchema = z.enum(['approved', 'new', 'config-changed', 'tools-changed', 'held']);
export type McpTrustVerdict = z.infer<typeof McpTrustVerdictSchema>;

export const McpPoisonKindSchema = z.enum(['instruction', 'cross-server', 'name-collision', 'injection-score']);
export type McpPoisonKind = z.infer<typeof McpPoisonKindSchema>;

export const McpPoisonFindingSchema = z.object({
  kind: McpPoisonKindSchema,
  tool: z.string(),
  /** `description`, or `param:<path>` for a parameter description. */
  field: z.string(),
  /** A short excerpt of the offending text, or the other server named. */
  evidence: z.string(),
  message: z.string(),
});
export type McpPoisonFinding = z.infer<typeof McpPoisonFindingSchema>;

/** A before/after pair the card renders as a diff. `before` is `null` for a server never approved. */
export const McpTrustDiffSchema = z.object({
  /** The canonical config with secrets replaced by short hashes. */
  config: z.object({ before: z.string().nullable(), after: z.string() }).nullable(),
  /** One line per tool: `+ name`, `- name`, `~ name` (description changed). */
  tools: z.array(z.string()),
});
export type McpTrustDiff = z.infer<typeof McpTrustDiffSchema>;

export const McpServerStatusSchema = z.object({
  repoId: z.string(),
  serverName: z.string(),
  source: McpServerSourceSchema,
  sourcePath: z.string(),
  transport: z.enum(['stdio', 'http']),
  /** The command line, or the URL: what running it would do. */
  command: z.string(),
  configHash: z.string(),
  /** `null` until the app has started the server and read its `tools/list`. */
  toolsHash: z.string().nullable(),
  verdict: McpTrustVerdictSchema,
  findings: z.array(McpPoisonFindingSchema),
  diff: McpTrustDiffSchema,
  approvedAt: z.number().int().nonnegative().nullable(),
});
export type McpServerStatus = z.infer<typeof McpServerStatusSchema>;

export const McpTrustListRequest = z.object({ repoId: z.string().min(1) });
export type McpTrustListRequest = z.infer<typeof McpTrustListRequest>;
export const McpTrustListResponse = z.object({ servers: z.array(McpServerStatusSchema) });
export type McpTrustListResponse = z.infer<typeof McpTrustListResponse>;

/** `configHash` is what the user was shown; a config edited since then is refused rather than approved blind. */
export const McpTrustApproveRequest = z.object({
  repoId: z.string().min(1),
  serverName: z.string().min(1),
  configHash: z.string().min(1),
});
export type McpTrustApproveRequest = z.infer<typeof McpTrustApproveRequest>;
