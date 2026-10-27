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
  /*
   * Phase 117 Theme C's reputation feeds. Pulled whole on a schedule and matched on this Mac, so a
   * visited URL never leaves it. Each is off by default behind its own Settings ▸ Privacy switch.
   */
  'urlhaus.abuse.ch': {
    host: 'urlhaus.abuse.ch',
    sends: 'nothing about the user — a plain GET of the public online-URL list (CC0)',
    trigger: 'feed',
    description: 'URLhaus malware URL feed for the Browser app (Settings ▸ Privacy, off by default)',
  },
  'openphish.com': {
    host: 'openphish.com',
    sends: 'nothing about the user — a plain GET of the public community feed',
    trigger: 'feed',
    description: 'OpenPhish community phishing feed for the Browser app (Settings ▸ Privacy, off by default)',
  },
};
