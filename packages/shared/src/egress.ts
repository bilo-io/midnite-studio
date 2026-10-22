import { z } from 'zod';

export const EgressHostSchema = z.object({
  host: z.string().min(1),
  sends: z.string().min(1),
  trigger: z.enum(['user', 'automatic', 'feed']),
  description: z.string().optional(),
});

export type EgressHost = z.infer<typeof EgressHostSchema>;

export const EGRESS_HOSTS: Record<string, EgressHost> = {
  'api.pwnedpasswords.com': {
    host: 'api.pwnedpasswords.com',
    sends: 'the first five hex characters of a SHA-1 of the password; never the password, never the hash',
    trigger: 'user',
    description: 'Have I Been Pwned Pwned Passwords k-anonymity breach check',
  },
};
