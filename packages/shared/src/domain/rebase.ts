import { z } from 'zod';

export const RebaseActionSchema = z.enum([
  'pick',
  'reword',
  'edit',
  'squash',
  'fixup',
  'drop',
  'break',
  'exec',
]);

export type RebaseAction = z.infer<typeof RebaseActionSchema>;

export const RebaseEntrySchema = z.object({
  id: z.string(),
  action: RebaseActionSchema,
  sha: z.string().optional(),
  subject: z.string().optional(),
  execCommand: z.string().optional(),
});

export type RebaseEntry = z.infer<typeof RebaseEntrySchema>;

export const RebaseSequencePlanSchema = z.object({
  targetRef: z.string(),
  entries: z.array(RebaseEntrySchema),
});

export type RebaseSequencePlan = z.infer<typeof RebaseSequencePlanSchema>;
