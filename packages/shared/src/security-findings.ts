import { z } from 'zod';

/**
 * Security finding source — Phase 120 Theme A.
 *
 * Three suite layers produce findings into the shared ledger:
 * - `vanguard`: always-on sensors watching host, processes, network & filesystem (Phase 120).
 * - `guard`: scheduled security sweeps checking CVEs, lockfiles & visited sites (Phase 122).
 * - `agents`: the agent policy and sandbox enforcement layer (Phase 121).
 */
export const SecurityFindingSourceSchema = z.enum(['vanguard', 'guard', 'agents']);
export type SecurityFindingSource = z.infer<typeof SecurityFindingSourceSchema>;

export const SecurityFindingSeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type SecurityFindingSeverity = z.infer<typeof SecurityFindingSeveritySchema>;

export const SecurityFindingCategorySchema = z.enum([
  'persistence',
  'process',
  'network',
  'integrity',
  'malware',
  'agent',
  'vulnerability',
  'config',
  'secret',
  'supply-chain',
  'site',
]);
export type SecurityFindingCategory = z.infer<typeof SecurityFindingCategorySchema>;

export const SecurityFindingStatusSchema = z.enum(['open', 'acknowledged', 'resolved', 'muted']);
export type SecurityFindingStatus = z.infer<typeof SecurityFindingStatusSchema>;

// --- Typed evidence items ----------------------------------------------------

export const EvidencePathSchema = z.object({
  kind: z.literal('path'),
  path: z.string(),
  hash: z.string().optional(),
  mode: z.number().int().optional(),
});
export type EvidencePath = z.infer<typeof EvidencePathSchema>;

export const EvidencePidSchema = z.object({
  kind: z.literal('pid'),
  pid: z.number().int(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  ppid: z.number().int().optional(),
  uid: z.number().int().optional(),
});
export type EvidencePid = z.infer<typeof EvidencePidSchema>;

export const EvidenceHostSchema = z.object({
  kind: z.literal('host'),
  host: z.string(),
  port: z.number().int().optional(),
  protocol: z.string().optional(),
});
export type EvidenceHost = z.infer<typeof EvidenceHostSchema>;

export const EvidenceHashSchema = z.object({
  kind: z.literal('hash'),
  algorithm: z.enum(['sha256', 'sha1', 'md5']),
  value: z.string(),
  path: z.string().optional(),
});
export type EvidenceHash = z.infer<typeof EvidenceHashSchema>;

export const EvidenceCommandSchema = z.object({
  kind: z.literal('command'),
  command: z.string(),
  args: z.array(z.string()).optional(),
});
export type EvidenceCommand = z.infer<typeof EvidenceCommandSchema>;

export const EvidenceItemSchema = z.discriminatedUnion('kind', [
  EvidencePathSchema,
  EvidencePidSchema,
  EvidenceHostSchema,
  EvidenceHashSchema,
  EvidenceCommandSchema,
]);
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

// --- Closed remediation actions ---------------------------------------------

export const RemediationActionIdSchema = z.enum([
  'pause-session',
  'kill-process-group',
  'bootout-launch-item',
  'quarantine-file',
  'restore-file',
  'revoke-mcp-server',
  'chmod-600',
  'report-issue',
  'open-in-agents',
  'mute',
  'update-package',
  'pin-package',
]);
export type RemediationActionId = z.infer<typeof RemediationActionIdSchema>;

export const PauseSessionActionSchema = z.object({
  id: z.literal('pause-session'),
  sessionId: z.string(),
  description: z.string().optional(),
});
export type PauseSessionAction = z.infer<typeof PauseSessionActionSchema>;

export const KillProcessGroupActionSchema = z.object({
  id: z.literal('kill-process-group'),
  pid: z.number().int(),
  description: z.string().optional(),
});
export type KillProcessGroupAction = z.infer<typeof KillProcessGroupActionSchema>;

export const BootoutLaunchItemActionSchema = z.object({
  id: z.literal('bootout-launch-item'),
  domain: z.string(),
  path: z.string(),
  description: z.string().optional(),
});
export type BootoutLaunchItemAction = z.infer<typeof BootoutLaunchItemActionSchema>;

export const QuarantineFileActionSchema = z.object({
  id: z.literal('quarantine-file'),
  path: z.string(),
  description: z.string().optional(),
});
export type QuarantineFileAction = z.infer<typeof QuarantineFileActionSchema>;

export const RestoreFileActionSchema = z.object({
  id: z.literal('restore-file'),
  findingId: z.string(),
  path: z.string(),
  description: z.string().optional(),
});
export type RestoreFileAction = z.infer<typeof RestoreFileActionSchema>;

export const RevokeMcpServerActionSchema = z.object({
  id: z.literal('revoke-mcp-server'),
  serverName: z.string(),
  description: z.string().optional(),
});
export type RevokeMcpServerAction = z.infer<typeof RevokeMcpServerActionSchema>;

export const Chmod600ActionSchema = z.object({
  id: z.literal('chmod-600'),
  path: z.string(),
  description: z.string().optional(),
});
export type Chmod600Action = z.infer<typeof Chmod600ActionSchema>;

export const ReportIssueActionSchema = z.object({
  id: z.literal('report-issue'),
  title: z.string(),
  body: z.string().optional(),
  description: z.string().optional(),
});
export type ReportIssueAction = z.infer<typeof ReportIssueActionSchema>;

export const OpenInAgentsActionSchema = z.object({
  id: z.literal('open-in-agents'),
  findingId: z.string(),
  prompt: z.string().optional(),
  description: z.string().optional(),
});
export type OpenInAgentsAction = z.infer<typeof OpenInAgentsActionSchema>;

export const MuteActionSchema = z.object({
  id: z.literal('mute'),
  description: z.string().optional(),
});
export type MuteAction = z.infer<typeof MuteActionSchema>;

/** Guard Theme B: bump a dependency to the version that fixes an advisory. Runs through the agent pass (Theme G). */
export const UpdatePackageActionSchema = z.object({
  id: z.literal('update-package'),
  name: z.string(),
  from: z.string(),
  to: z.string(),
  description: z.string().optional(),
});
export type UpdatePackageAction = z.infer<typeof UpdatePackageActionSchema>;

/** Guard Theme B: the fix is only on a newer major, so the action pins an override at that version. */
export const PinPackageActionSchema = z.object({
  id: z.literal('pin-package'),
  name: z.string(),
  from: z.string(),
  to: z.string(),
  description: z.string().optional(),
});
export type PinPackageAction = z.infer<typeof PinPackageActionSchema>;

export const RemediationActionSchema = z.discriminatedUnion('id', [
  PauseSessionActionSchema,
  KillProcessGroupActionSchema,
  BootoutLaunchItemActionSchema,
  QuarantineFileActionSchema,
  RestoreFileActionSchema,
  RevokeMcpServerActionSchema,
  Chmod600ActionSchema,
  ReportIssueActionSchema,
  OpenInAgentsActionSchema,
  MuteActionSchema,
  UpdatePackageActionSchema,
  PinPackageActionSchema,
]);
export type RemediationAction = z.infer<typeof RemediationActionSchema>;

/**
 * Response actions that are part of the closed set but cannot run yet (Phase 120 Theme H). `open-in-agents`
 * needs Phase 121 Theme A's untrusted tagging so the finding can ride into a Chats thread without being read
 * as instructions. Its handler answers with this reason instead of half-working, and the view shows the
 * button disabled with it. Delete an entry when its dependency lands. (`revoke-mcp-server` left this table
 * with Phase 121 Theme C: it runs wherever the composer supplies the MCP allowlist.)
 */
export const REMEDIATION_PENDING: Readonly<Partial<Record<RemediationActionId, { reason: string; dependsOn: string }>>> = {
  'update-package': {
    reason: 'Run from the Guard tab once Phase 122 Theme G lands; until then the finding names the version to move to.',
    dependsOn: 'Phase 122 Theme G',
  },
  'pin-package': {
    reason: 'Run from the Guard tab once Phase 122 Theme G lands; until then the finding names the version to pin.',
    dependsOn: 'Phase 122 Theme G',
  },
  'open-in-agents': {
    reason:
      'Available once Phase 121 lands: a finding goes into a Chats thread only once it can be tagged untrusted (Phase 121 Theme A).',
    dependsOn: 'Phase 121 Theme A',
  },
};

/** Actions that act without a confirm: they change nothing on the machine (Phase 120 Theme H). */
export const REMEDIATION_UNCONFIRMED: ReadonlySet<RemediationActionId> = new Set<RemediationActionId>(['mute', 'report-issue']);

export const FindingActionResultSchema = z.object({
  id: RemediationActionIdSchema,
  at: z.number().int().nonnegative(),
  ok: z.boolean(),
  error: z.string().optional(),
});
export type FindingActionResult = z.infer<typeof FindingActionResultSchema>;

// --- The central SecurityFinding schema --------------------------------------

export const SecurityFindingSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  source: SecurityFindingSourceSchema,
  severity: SecurityFindingSeveritySchema,
  category: SecurityFindingCategorySchema,
  title: z.string(),
  detail: z.string(),
  evidence: z.array(EvidenceItemSchema),
  remediation: z.array(RemediationActionSchema),
  firstSeen: z.number().int().nonnegative(),
  lastSeen: z.number().int().nonnegative(),
  count: z.number().int().positive(),
  status: SecurityFindingStatusSchema,
  sessionId: z.string().optional(),
  repoId: z.string().optional(),
  actions: z.array(FindingActionResultSchema).optional(),
  resolvedBy: z.string().optional(),
});
export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

/** Payload shape when recording a new finding (id, timestamps, count and status defaulted if absent). */
export const NewSecurityFindingSchema = SecurityFindingSchema.partial({
  id: true,
  firstSeen: true,
  lastSeen: true,
  count: true,
  status: true,
});
export type NewSecurityFinding = z.infer<typeof NewSecurityFindingSchema>;

/**
 * Fingerprints for host-configuration findings more than one producer can raise (Vanguard's Apple-signals
 * sensor, Phase 120 D; the Guard loop's host check, Phase 122 D). Both use these, so the ledger dedupes
 * them into one open finding whichever notices first.
 */
export const CONFIG_FINDING_FINGERPRINTS = {
  gatekeeperDisabled: 'config:gatekeeper-disabled',
  sipDisabled: 'config:sip-disabled',
} as const;

// --- Guard sweep record (Phase 122 Theme A) ---------------------------------

export const SeverityCountsSchema = z.object({
  critical: z.number().int().nonnegative().default(0),
  high: z.number().int().nonnegative().default(0),
  medium: z.number().int().nonnegative().default(0),
  low: z.number().int().nonnegative().default(0),
  info: z.number().int().nonnegative().default(0),
});
export type SeverityCounts = z.infer<typeof SeverityCountsSchema>;

export const GuardSweepRecordSchema = z.object({
  id: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative(),
  checksRun: z.array(z.string()),
  inputsSkipped: z.record(z.string(), z.string()),
  counts: SeverityCountsSchema,
  findingsPath: z.string().optional(),
});
export type GuardSweepRecord = z.infer<typeof GuardSweepRecordSchema>;

