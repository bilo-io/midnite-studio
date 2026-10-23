import { z } from 'zod';

import { GitOpResultOf } from './domain/result';

/**
 * The agent audit trail's record — Phase 121 Theme G.
 *
 * One append-only NDJSON line per thing an agent did or was told it may not do:
 * `<userData>/security/audit/agents-<yyyy-mm-dd>.ndjson` (`runtime/src/security/agent-audit.ts`
 * writes it, redacting every record first). This file is the wire contract both sides share: the
 * writer validates against {@link AgentAuditRecordSchema} before a byte reaches disk (an unknown
 * field is stripped, which is how the no-payloads rule holds), and the reader validates every line
 * it returns (a torn or hand-edited line is skipped, never thrown on).
 *
 * Phase 120 Theme G (Vanguard's rogue-agent rules) reads the trail through the runtime reader
 * (`createAgentAuditReader`), so this schema is its input.
 *
 * Records are deliberately **flat** — `redactRecord` follows nesting only eight levels deep, and a
 * record whose secret sits deeper would be written whole.
 *
 * Nine kinds. `mcp-call`, `command`, `chat-turn` and `council-run` have producers from this theme;
 * `policy-decision` and `approval` (Phase 121 B), `install` (H), `limit-trip` (F) and
 * `confine-denial` (E) have their schema and a writer entry point now, and their producers arrive
 * with those themes.
 */

export const AGENT_AUDIT_KINDS = [
  'mcp-call',
  'command',
  'chat-turn',
  'council-run',
  'policy-decision',
  'approval',
  'install',
  'limit-trip',
  'confine-denial',
] as const;
export const AgentAuditKindSchema = z.enum(AGENT_AUDIT_KINDS);
export type AgentAuditKind = z.infer<typeof AgentAuditKindSchema>;

const base = {
  /** A unique id, assigned by the writer. */
  id: z.string(),
  /** Epoch milliseconds. */
  at: z.number().finite(),
  /** The terminal or agent session the record belongs to, when it has one. */
  sessionId: z.string().optional(),
};

/** An MCP tool call. No payloads, ever — the ring's rule: `repoPath` is the caller-supplied root and nothing deeper. */
export const McpCallAuditSchema = z.object({
  ...base,
  kind: z.literal('mcp-call'),
  tool: z.string(),
  repoPath: z.string(),
  ok: z.boolean(),
  ms: z.number(),
});

/** Where a `command` line came from: a shell's OSC 133 / 633 prompt marks, or the keystroke-line heuristic. */
export const AgentAuditCommandSourceSchema = z.enum(['osc-133', 'osc-633', 'heuristic']);
export type AgentAuditCommandSource = z.infer<typeof AgentAuditCommandSourceSchema>;

/** A command line typed into an agent's pty. */
export const CommandAuditSchema = z.object({
  ...base,
  kind: z.literal('command'),
  command: z.string(),
  source: AgentAuditCommandSourceSchema,
  agentId: z.string().optional(),
  cwd: z.string().optional(),
});

/** One chat turn: which engine and model, which thread, and a summary of what was fed in (never the text). */
export const ChatTurnAuditSchema = z.object({
  ...base,
  kind: z.literal('chat-turn'),
  engine: z.string(),
  model: z.string().optional(),
  chatId: z.string(),
  repoPath: z.string().optional(),
  mode: z.string().optional(),
  status: z.enum(['done', 'error', 'cancelled']),
  ms: z.number(),
  attachments: z.number().int().nonnegative(),
  /** Count of inbound text chunks by origin (Phase 121 A's provenance), e.g. `{ attachment: 2 }`. */
  provenance: z.record(z.string(), z.number().int().nonnegative()).optional(),
  /** How many secrets were scrubbed from the turn's outbound text (Phase 121 D); 0 until then. */
  redactions: z.number().int().nonnegative(),
  /** A canary value was in the outbound prompt (Phase 121 D): a `critical` finding. */
  canary: z.boolean().optional(),
});

/** One council run, written when it finishes. */
export const CouncilRunAuditSchema = z.object({
  ...base,
  kind: z.literal('council-run'),
  councilId: z.string(),
  runId: z.string(),
  status: z.enum(['completed', 'failed']),
  members: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  synthProvider: z.string(),
  ms: z.number(),
  /** Secrets scrubbed from the member and synthesis prompts (Phase 121 D). */
  redactions: z.number().int().nonnegative().optional(),
  /** A canary value was in an outbound prompt (Phase 121 D): a `critical` finding. */
  canary: z.boolean().optional(),
});

/** What the tool-call policy decided (Phase 121 Theme B). */
export const PolicyDecisionAuditSchema = z.object({
  ...base,
  kind: z.literal('policy-decision'),
  tool: z.string(),
  decision: z.enum(['allow', 'ask', 'deny']),
  rule: z.string(),
  repoPath: z.string().optional(),
});

/** Who answered an approval card, and when it was asked (Phase 121 Theme B). */
export const ApprovalAuditSchema = z.object({
  ...base,
  kind: z.literal('approval'),
  tool: z.string(),
  decision: z.enum(['approved', 'denied']),
  by: z.string(),
  rule: z.string(),
  scope: z.enum(['once', 'session']).optional(),
});

/** An install an agent ran, with the check's verdict (Phase 121 Theme H). */
export const InstallAuditSchema = z.object({
  ...base,
  kind: z.literal('install'),
  manager: z.string(),
  packages: z.array(z.string()),
  verdict: z.enum(['ok', 'warn', 'block']),
  findings: z.array(z.string()).optional(),
});

/** A rate or spend limit that tripped the breaker (Phase 121 Theme F). */
export const LimitTripAuditSchema = z.object({
  ...base,
  kind: z.literal('limit-trip'),
  limit: z.string(),
  observed: z.number(),
  threshold: z.number(),
  windowMs: z.number().optional(),
});

/** An operation the sandbox profile refused (Phase 121 Theme E). */
export const ConfineDenialAuditSchema = z.object({
  ...base,
  kind: z.literal('confine-denial'),
  operation: z.string(),
  target: z.string(),
});

export const AgentAuditRecordSchema = z.discriminatedUnion('kind', [
  McpCallAuditSchema,
  CommandAuditSchema,
  ChatTurnAuditSchema,
  CouncilRunAuditSchema,
  PolicyDecisionAuditSchema,
  ApprovalAuditSchema,
  InstallAuditSchema,
  LimitTripAuditSchema,
  ConfineDenialAuditSchema,
]);
export type AgentAuditRecord = z.infer<typeof AgentAuditRecordSchema>;

/** The record a producer hands the trail: the writer assigns `id` and, unless given, `at`. */
export type NewAgentAuditRecord = AgentAuditRecord extends infer R
  ? R extends AgentAuditRecord
    ? Omit<R, 'id' | 'at'> & { at?: number }
    : never
  : never;

/** The record of one kind, by name: `AgentAuditRecordOf<'command'>`. */
export type AgentAuditRecordOf<K extends AgentAuditKind> = Extract<AgentAuditRecord, { kind: K }>;

/** Rows the viewer asks for at once, and the most a list call returns. */
export const AGENT_AUDIT_DEFAULT_LIMIT = 200;
export const AGENT_AUDIT_MAX_LIMIT = 1000;
/** The Tools view's last-N (the old memory ring's capacity). */
export const AGENT_AUDIT_RING_TAIL = 50;
/** Retention when Phase 115 B's "Keep local history" setting does not exist yet. */
export const AGENT_AUDIT_DEFAULT_RETENTION_DAYS = 90;

/** The filter the viewer, the export and the runtime reader share. Every field narrows; none is required. */
export const AgentAuditFilterSchema = z.object({
  kinds: z.array(AgentAuditKindSchema).optional(),
  sessionId: z.string().optional(),
  /** Inclusive lower bound on `at`, epoch ms. */
  since: z.number().nonnegative().optional(),
  /** Exclusive upper bound on `at`, epoch ms. */
  until: z.number().nonnegative().optional(),
});
export type AgentAuditFilter = z.infer<typeof AgentAuditFilterSchema>;

export const AgentAuditListRequest = AgentAuditFilterSchema.extend({
  limit: z.number().int().min(1).max(AGENT_AUDIT_MAX_LIMIT).optional(),
});
export type AgentAuditListRequest = z.infer<typeof AgentAuditListRequest>;

/** Newest first. `truncated` is true when more matched than `limit` returned. */
export const AgentAuditListResponse = z.object({
  records: z.array(AgentAuditRecordSchema),
  truncated: z.boolean(),
});
export type AgentAuditListResponse = z.infer<typeof AgentAuditListResponse>;

export const AgentAuditExportRequest = AgentAuditFilterSchema;
export type AgentAuditExportRequest = z.infer<typeof AgentAuditExportRequest>;

/** `path` is `null` when the user dismissed the save dialog (nothing was written). */
export const AgentAuditExportResponse = GitOpResultOf(
  z.object({ path: z.string().nullable(), count: z.number().int().nonnegative() }),
);
export type AgentAuditExportResponse = z.infer<typeof AgentAuditExportResponse>;

/** Where a position in the trail is, so a watcher can read only what was appended since. */
export const AgentAuditCursorSchema = z.object({
  /** The day file, e.g. `agents-2026-10-23.ndjson`. */
  file: z.string(),
  /** Byte offset just past the last complete line already read. */
  offset: z.number().int().nonnegative(),
});
export type AgentAuditCursor = z.infer<typeof AgentAuditCursorSchema>;

/** The day-file name for a timestamp (UTC). */
export function agentAuditFileName(at: number): string {
  const d = new Date(at);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `agents-${d.getUTCFullYear()}-${month}-${day}.ndjson`;
}

const FILE_PATTERN = /^agents-(\d{4})-(\d{2})-(\d{2})\.ndjson$/;

/** The UTC midnight a day file covers, or `null` when the name is not a trail file. */
export function agentAuditFileDay(name: string): number | null {
  const match = FILE_PATTERN.exec(name);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
