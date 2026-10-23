import { z } from 'zod';

/**
 * Where a piece of content came from, and whether to believe it (Phase 121 Theme A).
 *
 * Prompt injection is content that talks to the model as if it were the user. The only structural
 * defence is that every part of a prompt carries a tag saying where it came from, and that the
 * prompt builder fences the parts whose source is not the user (`untrusted-fence.ts`). This module
 * is the tag. It is wire-level (zod only), so a chat attachment, a chat message, an MCP tool result
 * and a council prompt all speak one shape.
 */

export const ContentOriginSchema = z.enum([
  /** The user's own typing. */
  'user',
  /** A file in the open repository. */
  'repo-file',
  /** A file or blob the user attached, dropped or handed over from another surface. */
  'attachment',
  /** A pull request, issue, review or check body fetched from a forge. Anyone can write one. */
  'forge',
  /** Text read out of a web page, including the browser agent's page capture. */
  'web-page',
  /** What an MCP tool returned. */
  'mcp-result',
  /** What another agent or model wrote, replayed into a prompt. */
  'agent-output',
  /** Pasted text. */
  'clipboard',
]);
export type ContentOrigin = z.infer<typeof ContentOriginSchema>;

export const ContentTrustSchema = z.enum(['trusted', 'untrusted']);
export type ContentTrust = z.infer<typeof ContentTrustSchema>;

export const ContentProvenanceSchema = z.object({
  origin: ContentOriginSchema,
  /** A path, URL or tool id naming the source. Shown to the model and the user, so keep it short. */
  ref: z.string().max(2048).default(''),
  /** Defaults to untrusted: a renderer that says nothing gets the cautious answer. */
  trust: ContentTrustSchema.default('untrusted'),
  /** The injection detector's score for the part, 0 to 1, when it was scanned. */
  score: z.number().min(0).max(1).optional(),
});
export type ContentProvenance = z.infer<typeof ContentProvenanceSchema>;

/** The origins whose content is the user's own, or the user's repository. Everything else is data. */
const TRUSTED_ORIGINS: ReadonlySet<ContentOrigin> = new Set(['user', 'repo-file']);

/** The trust an origin earns by default. */
export function defaultTrustFor(origin: ContentOrigin): ContentTrust {
  return TRUSTED_ORIGINS.has(origin) ? 'trusted' : 'untrusted';
}

/**
 * Tags a part. Trust is derived from the origin here, never taken from the caller, so a forge body
 * is untrusted whether or not whoever built the part said so.
 */
export function provenanceFor(origin: ContentOrigin, ref = '', score?: number): ContentProvenance {
  return { origin, ref, trust: defaultTrustFor(origin), ...(score !== undefined ? { score } : {}) };
}

/**
 * The provenance a part is treated as having. A part with none (a chat saved before this phase, a
 * renderer that never set it) is `fallback`, which is untrusted for anything but typing. A claim of
 * `trusted` on an origin that cannot be trusted is ignored.
 */
export function resolveProvenance(
  given: Partial<ContentProvenance> | undefined,
  fallback: ContentOrigin = 'attachment',
): ContentProvenance {
  const origin = given?.origin ?? fallback;
  // A caller may downgrade a part to untrusted, never upgrade one past what its origin earns.
  const trust: ContentTrust = defaultTrustFor(origin) === 'trusted' && given?.trust !== 'untrusted' ? 'trusted' : 'untrusted';
  return { origin, ref: given?.ref ?? '', trust, ...(given?.score !== undefined ? { score: given.score } : {}) };
}

export function isUntrusted(given: Partial<ContentProvenance> | undefined, fallback: ContentOrigin = 'attachment'): boolean {
  return resolveProvenance(given, fallback).trust === 'untrusted';
}
