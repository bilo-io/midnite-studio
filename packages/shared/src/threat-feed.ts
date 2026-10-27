import { z } from 'zod';

/**
 * The threat feed (Phase 122 Theme C): a whole-file, signed list of public indicators that Guard checks locally.
 * Pulled whole, never queried, so nothing about the user's packages leaves the machine. Every entry carries the
 * public write-up it came from in `ref`.
 */
const Ref = z.string().url();

export const ThreatFeedSchema = z.object({
  version: z.number().int().positive(),
  publishedAt: z.string().min(1),
  poisonedPackages: z.array(z.object({ ecosystem: z.string().min(1), name: z.string().min(1), versions: z.array(z.string().min(1)).min(1), campaign: z.string().min(1), ref: Ref })).default([]),
  mcpServers: z.array(z.object({ nameOrUrl: z.string().min(1), configHash: z.string().optional(), toolsHash: z.string().optional(), campaign: z.string().min(1), ref: Ref })).default([]),
  slopsquatNames: z.array(z.object({ ecosystem: z.string().min(1), name: z.string().min(1), ref: Ref })).default([]),
  clickfixDomains: z.array(z.string().min(1)).default([]),
  commandGrammars: z
    .array(
      z.object({
        id: z.string().min(1),
        regex: z.string().refine((r) => {
          try {
            new RegExp(r);
            return true;
          } catch {
            return false;
          }
        }, 'regex must compile'),
        severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
        ref: Ref,
      }),
    )
    .default([]),
  yaraRules: z.array(z.object({ id: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/), url: z.string().url() })).default([]),
});
export type ThreatFeed = z.infer<typeof ThreatFeedSchema>;

/**
 * The Ed25519 public key (SPKI PEM) feed signatures verify against. Empty until the first feed is published
 * from the midnite-apps catalog repo; an empty key means no feed is trusted, so every threat-feed check reports
 * itself skipped rather than reading an unsigned file.
 */
export const THREAT_FEED_PUBLIC_KEY_PEM = '';

// scripts/threat-feed-check.test.mjs pins the standalone script's copy byte-for-byte to it.
// The signature covers `canonicalJson` (keys sorted at every depth), exported from `./vanguard-integrity`.
