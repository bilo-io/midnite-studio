import { z } from 'zod';

import { GitOpResultOf } from '../domain/result';
import {
  RemediationActionIdSchema,
  RemediationActionSchema,
  SecurityFindingCategorySchema,
  SecurityFindingSchema,
  SecurityFindingSeveritySchema,
  SecurityFindingSourceSchema,
  SecurityFindingStatusSchema,
} from '../security-findings';

export const SecurityFindingsListRequest = z.object({
  status: z.union([SecurityFindingStatusSchema, z.array(SecurityFindingStatusSchema)]).optional(),
  severity: z.union([SecurityFindingSeveritySchema, z.array(SecurityFindingSeveritySchema)]).optional(),
  source: z.union([SecurityFindingSourceSchema, z.array(SecurityFindingSourceSchema)]).optional(),
  category: z.union([SecurityFindingCategorySchema, z.array(SecurityFindingCategorySchema)]).optional(),
  since: z.number().int().nonnegative().optional(),
  sessionId: z.string().optional(),
  repoId: z.string().optional(),
});
export type SecurityFindingsListRequest = z.infer<typeof SecurityFindingsListRequest>;

export const SecurityFindingsListResponse = z.object({
  findings: z.array(SecurityFindingSchema),
});
export type SecurityFindingsListResponse = z.infer<typeof SecurityFindingsListResponse>;

export const SecurityFindingsSetStatusRequest = z.object({
  id: z.string(),
  status: SecurityFindingStatusSchema,
});
export type SecurityFindingsSetStatusRequest = z.infer<typeof SecurityFindingsSetStatusRequest>;

export const SecurityFindingsSetStatusResponse = GitOpResultOf(SecurityFindingSchema);
export type SecurityFindingsSetStatusResponse = z.infer<typeof SecurityFindingsSetStatusResponse>;

export const SecurityFindingsActRequest = z.object({
  findingId: z.string(),
  action: RemediationActionSchema,
  /**
   * The `digest` of the blast radius the user confirmed (Phase 120 Theme H). A confirmed action runs only
   * when main's fresh plan has the same digest, so nothing runs that the dialog did not show.
   */
  confirmed: z.string().optional(),
});
export type SecurityFindingsActRequest = z.infer<typeof SecurityFindingsActRequest>;

/** Why an action cannot run here: a dependency that has not landed, or a seam this app does not have. */
export const RemediationUnavailableSchema = z.object({
  reason: z.string(),
  dependsOn: z.string().optional(),
});
export type RemediationUnavailable = z.infer<typeof RemediationUnavailableSchema>;

export const SecurityFindingsActResultSchema = z.object({
  actionId: RemediationActionIdSchema,
  /** The finding after the outcome was appended to its ledger row. */
  finding: SecurityFindingSchema.optional(),
  /** Set instead of acting when the action cannot run yet (Phase 121's pair) or in this app. Nothing was done. */
  unavailable: RemediationUnavailableSchema.optional(),
  /** `report-issue`: the prefilled midnite-apps issue form; the renderer opens it and the user submits. */
  issueUrl: z.string().optional(),
  /** One line on what happened ("Stopped 3 processes"). */
  detail: z.string().optional(),
});
export const SecurityFindingsActResponse = GitOpResultOf(SecurityFindingsActResultSchema);
export type SecurityFindingsActResponse = z.infer<typeof SecurityFindingsActResponse>;

/**
 * What a response action is about to touch, computed in main against the machine as it is now (Phase 120
 * Theme H). The view puts it in the blast-radius confirm before the action runs; `act` re-checks every
 * target again, so a preview is never a licence.
 */
export const ActionBlastRadiusSchema = z.object({
  actionId: RemediationActionIdSchema,
  /** False only for `mute` and `report-issue`, which change nothing on the machine. */
  confirm: z.boolean(),
  title: z.string(),
  confirmLabel: z.string(),
  /** One sentence on what the action does. */
  summary: z.string(),
  /** What dies: processes stopped, launch items unloaded. */
  dies: z.array(z.string()),
  /** What moves: files quarantined, restored or re-permissioned. */
  moves: z.array(z.string()),
  /** Which agent sessions are interrupted or end. */
  pauses: z.array(z.string()),
  /** Anything else worth reading first (a re-scan that matched, a running process still using a file). */
  warnings: z.array(z.string()),
  unavailable: RemediationUnavailableSchema.optional(),
  /**
   * A hash of everything above plus the exact targets behind any capped list (every member pid, the file's
   * full hash). `act` sends it back as `confirmed`.
   */
  digest: z.string().optional(),
});
export type ActionBlastRadius = z.infer<typeof ActionBlastRadiusSchema>;

export const SecurityFindingsActPreviewResponse = GitOpResultOf(ActionBlastRadiusSchema);
export type SecurityFindingsActPreviewResponse = z.infer<typeof SecurityFindingsActPreviewResponse>;

export const SecurityFindingsChangedPayload = z.void();
