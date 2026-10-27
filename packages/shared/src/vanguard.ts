import { z } from 'zod';

import { SecurityFindingSeveritySchema } from './security-findings';

/**
 * Vanguard's wire contract beyond the findings ledger (Phase 120 Theme B): the view's tabs, what a
 * sensor reports to the Sensors tab, and the persisted settings. zod only.
 *
 * A sensor id is a plain string, not an enum: each sensor theme (C-F) registers its own with the
 * sensor host, so adding one touches no shared list.
 */

/** The Vanguard view's tabs; the launcher tile's three features land on one each. */
export const VANGUARD_TABS = ['findings', 'sensors', 'network'] as const;
export type VanguardTab = (typeof VANGUARD_TABS)[number];

/** Where a sensor is in its lifecycle. `disabled` = switched off (or Studio awaiting first open). */
export const SensorRunStateSchema = z.enum(['disabled', 'idle', 'running', 'error']);
export type SensorRunState = z.infer<typeof SensorRunStateSchema>;

export const SensorStatusSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** One line on what it watches; static text from the sensor's definition. */
  description: z.string(),
  state: SensorRunStateSchema,
  /** The user's switch (Settings > Vanguard), regardless of whether the host has started it. */
  enabled: z.boolean(),
  /** Epoch ms of the last completed run; null before the first. */
  lastRunAt: z.number().int().nonnegative().nullable(),
  lastDurationMs: z.number().int().nonnegative().nullable(),
  /** Findings recorded by the last run. */
  lastFindings: z.number().int().nonnegative(),
  /** Set when `state` is `error`; a sentence, never a stack. */
  error: z.string().optional(),
});
export type SensorStatus = z.infer<typeof SensorStatusSchema>;

export const VanguardSensorsResponse = z.object({
  sensors: z.array(SensorStatusSchema),
  /** True once the host has started the enabled sensors (false in Studio before the first open). */
  active: z.boolean(),
});
export type VanguardSensorsResponse = z.infer<typeof VanguardSensorsResponse>;

export const VanguardSettingsSchema = z.object({
  version: z.literal(1),
  /** Per-sensor switch by sensor id; a sensor absent here follows `defaultEnabled`. */
  sensors: z.record(z.string(), z.boolean()),
  /** Seconds between sensor runs, for sensors that poll. */
  cadenceSeconds: z.number().int().min(5).max(3600),
  /** Days a quarantined file is kept before it is purged (Theme H). */
  quarantineRetentionDays: z.number().int().min(1).max(365),
  /**
   * Studio only: the user has opened the Vanguard view once. Until then no sensor starts, so a user who
   * never looked at Vanguard never has `lsof` polled. Vanguard's own app ignores it.
   */
  viewOpened: z.boolean(),
  /**
   * Phase 120 Theme G: the finding severities that pause an agent's session by themselves (Ctrl+C to its pty,
   * then a modal to resume or kill). `critical` only unless the user opts more in. A file written before this
   * field existed reads as the default.
   */
  autoPauseSeverities: z.array(SecurityFindingSeveritySchema).default(['critical']),
  /**
   * The persistence sensor reads login items with `sfltool dumpbtm`, which on current macOS raises an
   * administrator password prompt on every scan rather than failing quietly. Off unless the user opts in;
   * a file written before this field existed reads as off.
   */
  scanLoginItems: z.boolean().default(false),
});
export type VanguardSettings = z.infer<typeof VanguardSettingsSchema>;

export const DEFAULT_VANGUARD_SETTINGS: VanguardSettings = {
  version: 1,
  sensors: {},
  cadenceSeconds: 30,
  quarantineRetentionDays: 30,
  viewOpened: false,
  autoPauseSeverities: ['critical'],
  scanLoginItems: false,
};

export const VanguardSettingsGetResponse = VanguardSettingsSchema;

/** A partial update: only the keys present change; `sensors` merges per id. */
export const VanguardSettingsSetRequest = z.object({
  sensors: z.record(z.string().max(64), z.boolean()).optional(),
  cadenceSeconds: VanguardSettingsSchema.shape.cadenceSeconds.optional(),
  quarantineRetentionDays: VanguardSettingsSchema.shape.quarantineRetentionDays.optional(),
  autoPauseSeverities: z.array(SecurityFindingSeveritySchema).max(5).optional(),
  scanLoginItems: z.boolean().optional(),
});
export type VanguardSettingsSetRequest = z.infer<typeof VanguardSettingsSetRequest>;

/** Ask one sensor to run now (the Sensors tab's "Run now"). */
export const VanguardSensorRunRequest = z.object({ id: z.string().max(64) });
export type VanguardSensorRunRequest = z.infer<typeof VanguardSensorRunRequest>;

// --- Malware scanning (Phase 120 Theme F) -------------------------------------------------------------

/** What an on-demand scan covers. `full` is the whole home folder, behind its own button and estimate. */
export const MALWARE_SCAN_TARGETS = ['downloads', 'repo', 'folder', 'full'] as const;
export type MalwareScanTarget = (typeof MALWARE_SCAN_TARGETS)[number];

/** Start one on-demand scan. `repo` needs `repoId`, `folder` needs an absolute `path`. */
export const VanguardScanRequest = z.object({
  target: z.enum(MALWARE_SCAN_TARGETS),
  repoId: z.string().max(256).optional(),
  path: z.string().max(4096).optional(),
});
export type VanguardScanRequest = z.infer<typeof VanguardScanRequest>;

/** Which scan engines exist on this machine. `builtin` is the bundled matcher and is always installed. */
export const MalwareEngineStatusSchema = z.object({
  id: z.enum(['yara', 'clamscan', 'builtin']),
  label: z.string(),
  installed: z.boolean(),
});
export type MalwareEngineStatus = z.infer<typeof MalwareEngineStatusSchema>;

export const MalwareScanSummarySchema = z.object({
  /** What was scanned, as a sentence fragment ("Downloads", "a repo", "a download"). */
  target: z.string(),
  at: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  /** Files the built-in matcher examined; null when only an external engine ran. */
  files: z.number().int().nonnegative().nullable(),
  detections: z.number().int().nonnegative(),
  /** Ids of the engines that ran. */
  engines: z.array(z.string()),
  /** Things that went wrong that are not detections (a timeout, an unreadable path). */
  errors: z.array(z.string()),
  /** The user stopped the scan; `detections` and `files` cover what was examined before that. */
  cancelled: z.boolean().optional(),
});
export type MalwareScanSummary = z.infer<typeof MalwareScanSummarySchema>;

export const VanguardMalwareStatus = z.object({
  engines: z.array(MalwareEngineStatusSchema),
  running: z.boolean(),
  /** Paths waiting for the sensor's next run (new downloads, flagged files). */
  queued: z.number().int().nonnegative(),
  last: MalwareScanSummarySchema.nullable(),
});
export type VanguardMalwareStatus = z.infer<typeof VanguardMalwareStatus>;

// --- Response and quarantine (Phase 120 Theme H) ------------------------------------------------------

/**
 * `<quarantineDir>/<findingId>/manifest.json`, written when a file is quarantined. The file itself sits beside
 * it under `data/` at mode 0000. `realParent` is the original parent directory's real path at quarantine
 * time: a restore refuses when it no longer resolves there, so a symlink swapped in meanwhile cannot redirect
 * the file. `allowRules` are the malware rules the finding itself named, which a restore's re-scan may match.
 */
export const QuarantineManifestSchema = z.object({
  version: z.literal(1),
  findingId: z.string(),
  findingTitle: z.string(),
  originalPath: z.string(),
  realParent: z.string(),
  fileName: z.string(),
  sha256: z.string(),
  size: z.number().int().nonnegative(),
  mode: z.number().int().nonnegative(),
  uid: z.number().int(),
  /** Extended attributes as `xattr -px` printed them (hex), re-applied on restore if a copy dropped them. */
  xattrs: z.array(z.object({ name: z.string(), hex: z.string() })),
  quarantinedAt: z.number().int().nonnegative(),
  allowRules: z.array(z.string()),
});
export type QuarantineManifest = z.infer<typeof QuarantineManifestSchema>;

export const QuarantineEntrySchema = QuarantineManifestSchema.pick({
  findingId: true,
  findingTitle: true,
  originalPath: true,
  fileName: true,
  sha256: true,
  size: true,
  quarantinedAt: true,
}).extend({
  /** When retention purges it (Settings ▸ Vanguard ▸ Quarantine). */
  expiresAt: z.number().int().nonnegative(),
});
export type QuarantineEntry = z.infer<typeof QuarantineEntrySchema>;

/** The quarantine list and which response actions this app cannot run (with why), for the view. */
export const VanguardResponseStateResponse = z.object({
  quarantineDir: z.string(),
  quarantine: z.array(QuarantineEntrySchema),
  unavailable: z.record(z.string(), z.object({ reason: z.string(), dependsOn: z.string().optional() })),
});
export type VanguardResponseStateResponse = z.infer<typeof VanguardResponseStateResponse>;

// --- Rogue agent behaviour (Phase 120 Theme G) --------------------------------------------------------

/** The finding severities the Settings switches cover (`info` never pauses anything). */
export const AUTO_PAUSE_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

/**
 * Shown in every suite window when a finding paused an agent: which session, why, and the two ways out. The
 * session has already been interrupted by the time this arrives; `findingId` is the ledger row that did it.
 */
export const AgentPausePromptSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  findingId: z.string().optional(),
  severity: SecurityFindingSeveritySchema,
  title: z.string(),
  detail: z.string(),
  at: z.number().int().nonnegative(),
});
export type AgentPausePrompt = z.infer<typeof AgentPausePromptSchema>;

/** The modal's answer: carry on, or end the session. */
export const AgentPauseResolveRequest = z.object({
  id: z.string().max(128),
  action: z.enum(['resume', 'kill']),
});
export type AgentPauseResolveRequest = z.infer<typeof AgentPauseResolveRequest>;
