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
});
export type SecurityFindingsActRequest = z.infer<typeof SecurityFindingsActRequest>;

export const SecurityFindingsActResultSchema = z.object({
  actionId: RemediationActionIdSchema,
  finding: SecurityFindingSchema.optional(),
});
export const SecurityFindingsActResponse = GitOpResultOf(SecurityFindingsActResultSchema);
export type SecurityFindingsActResponse = z.infer<typeof SecurityFindingsActResponse>;

export const SecurityFindingsChangedPayload = z.void();
