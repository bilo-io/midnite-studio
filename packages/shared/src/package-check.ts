import { z } from 'zod';

/**
 * Package ecosystems checked by Phase 121 Theme H.
 */
export const PACKAGE_ECOSYSTEMS = ['npm', 'pypi', 'cargo', 'rubygems', 'homebrew', 'go'] as const;
export const PackageEcosystemSchema = z.enum(PACKAGE_ECOSYSTEMS);
export type PackageEcosystem = z.infer<typeof PackageEcosystemSchema>;

/**
 * A package candidate discovered from a command line or lockfile diff (Phase 121 Theme H).
 */
export const InstallCandidateSchema = z.object({
  ecosystem: PackageEcosystemSchema,
  name: z.string().min(1).max(256),
  version: z.string().max(128).optional(),
  source: z.enum(['command', 'lockfile']),
  command: z.string().optional(),
  lockfile: z.string().optional(),
});
export type InstallCandidate = z.infer<typeof InstallCandidateSchema>;

export const PackageCheckSeveritySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);
export type PackageCheckSeverity = z.infer<typeof PackageCheckSeveritySchema>;

export const PackageCheckKindSchema = z.enum([
  'registry-age', // published < 7 days ago (slopsquatting window)
  'typosquat', // edit distance <= 2 from top package
  'install-script', // pre/install/postinstall present
  'suspicious-script', // install script reads ~/.npmrc, env, or .git/config
  'osv-advisory', // OSV vulnerability hit
  'poisoned-version', // matched on known poisoned versions list
]);
export type PackageCheckKind = z.infer<typeof PackageCheckKindSchema>;

export const PackageCheckFindingSchema = z.object({
  kind: PackageCheckKindSchema,
  severity: PackageCheckSeveritySchema,
  candidate: InstallCandidateSchema,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type PackageCheckFinding = z.infer<typeof PackageCheckFindingSchema>;

export const SkillAuditFindingKindSchema = z.enum([
  'prompt-injection',
  'suspicious-network',
  'binary-file',
]);
export type SkillAuditFindingKind = z.infer<typeof SkillAuditFindingKindSchema>;

export const SkillAuditFindingSchema = z.object({
  kind: SkillAuditFindingKindSchema,
  severity: PackageCheckSeveritySchema,
  skillPath: z.string(),
  skillName: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type SkillAuditFinding = z.infer<typeof SkillAuditFindingSchema>;
