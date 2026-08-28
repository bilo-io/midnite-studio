import { z } from 'zod';

export const BlameCommitSchema = z.object({
  sha: z.string().length(40),
  authorName: z.string(),
  authorEmail: z.string(),
  authorTime: z.number().int(),
  summary: z.string(),
});
export type BlameCommit = z.infer<typeof BlameCommitSchema>;

export const BlameLineSchema = z.object({
  sha: z.string().length(40),
  finalLine: z.number().int().positive(),
  origLine: z.number().int().positive(),
  text: z.string(),
  previous: z
    .object({
      sha: z.string().length(40),
      path: z.string(),
    })
    .nullable(),
});
export type BlameLine = z.infer<typeof BlameLineSchema>;

export const BlameResultSchema = z.object({
  relPath: z.string(),
  rev: z.string().nullable(),
  commits: z.record(z.string(), BlameCommitSchema),
  lines: z.array(BlameLineSchema),
});
export type BlameResult = z.infer<typeof BlameResultSchema>;
