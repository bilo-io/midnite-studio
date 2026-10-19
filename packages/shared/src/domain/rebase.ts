import { z } from 'zod';

export const RebaseActionSchema = z.enum([
  'pick',
  'reword',
  'edit',
  'squash',
  'fixup',
  'drop',
  'break',
]);

export type RebaseAction = z.infer<typeof RebaseActionSchema>;

export const RebaseEntrySchema = z.object({
  id: z.string(),
  action: RebaseActionSchema,
  sha: z
    .string()
    .regex(/^[0-9a-f]{4,40}$/)
    .optional(),
  subject: z
    .string()
    .max(512)
    .refine((s) => !/[\r\n\0]/.test(s), 'subject must be a single line')
    .optional(),
});

export type RebaseEntry = z.infer<typeof RebaseEntrySchema>;

export const RebaseSequencePlanSchema = z.object({
  targetRef: z.string(),
  entries: z.array(RebaseEntrySchema).max(1000),
});

export type RebaseSequencePlan = z.infer<typeof RebaseSequencePlanSchema>;
