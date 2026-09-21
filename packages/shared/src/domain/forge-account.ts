import { z } from 'zod';

import { ForgeKindSchema, isSupportedForgeKind, type ForgeKind } from './remote';

/**
 * The "who am I" concept this app has never had — see the reversed premise in
 * `forge.ts`'s own header. Grounding for Phase 90 Theme B found the absence
 * total: no `viewer` query, no `currentUser`, no `whoami` anywhere in the repo.
 *
 * Every `ForgeKind` except `unknown` — a NAS path or a Gerrit host has no
 * identity concept for this app to hold an account for.
 */
export const SupportedForgeKindSchema = ForgeKindSchema.refine(isSupportedForgeKind, {
  message: 'not a supported forge kind',
});

/**
 * A logged-in identity for one host, non-secret in every field.
 *
 * `hasToken` is a boolean, never the token — the renderer is told a
 * credential exists, never what it is. Whether the boolean is even
 * meaningful varies by provider: a GitHub account discovered from `gh auth
 * status` is `delegated: 'gh'` and `hasToken: false` always, because `gh`
 * itself is the credential (see the module docblock this phase's header
 * quotes). Every other provider account is `delegated: null` and
 * `hasToken: true` — Theme B never stores an account for a PAT that failed
 * `whoami`.
 */
export const ForgeAccountSchema = z.object({
  /** `forgeAccountId(kind, host, login)` — stable, so re-adding the same
   *  identity replaces rather than duplicates it. */
  id: z.string().min(1),
  kind: SupportedForgeKindSchema,
  /** Hostname only, matching `Forge.host` — no scheme, no port. */
  host: z.string().min(1),
  login: z.string().min(1),
  displayName: z.string(),
  /** `https:`/`http:` only — validated where the account is built, not here;
   *  see `whoami.ts`'s `sanitizeAvatarUrl`. */
  avatarUrl: z.string().nullable(),
  /** Epoch ms. */
  addedAt: z.number(),
  hasToken: z.boolean(),
  delegated: z.enum(['gh']).nullable(),
});
export type ForgeAccount = z.infer<typeof ForgeAccountSchema>;

/**
 * Adding an account is the same call as validating its token: a PAT that
 * cannot answer `whoami` is never stored, so `ok: true` is the only path that
 * produces an `account` at all.
 */
export const ForgeAccountAddResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), account: ForgeAccountSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type ForgeAccountAddResult = z.infer<typeof ForgeAccountAddResultSchema>;

/**
 * The stable id for an identity: same provider, same host, same login is the
 * same account, so adding it again replaces the existing entry (and its
 * vaulted token, if any) instead of creating a second row for it.
 */
export function forgeAccountId(kind: ForgeKind, host: string, login: string): string {
  return `${kind}:${host}:${login}`;
}

/**
 * The forge-account vault's key — constrained, not `z.string()`, so the
 * vault this schema keys into cannot become a general-purpose KV store by
 * accident (Phase 90 Theme B, grounded against the Phase 91 audit). Same
 * `${provider}:${host}:${login}` shape as {@link forgeAccountId} — the two
 * are computed identically today, kept as separate named concepts because one
 * identifies an account record and the other identifies a vault entry, and a
 * future account shape (a per-org token, say) could need more than one vault
 * entry per account id.
 */
export const ForgeAccountVaultKeySchema = z
  .string()
  .regex(/^[a-z]+:[^:]+:[^:]+$/, 'not a well-formed forge-account vault key')
  .brand<'ForgeAccountVaultKey'>();
export type ForgeAccountVaultKey = z.infer<typeof ForgeAccountVaultKeySchema>;

export function forgeAccountVaultKey(
  kind: ForgeKind,
  host: string,
  login: string,
): ForgeAccountVaultKey {
  return ForgeAccountVaultKeySchema.parse(`${kind}:${host}:${login}`);
}

// --- capability matrix -----------------------------------------------------

/**
 * Tri-state, not boolean — "Bitbucket's issue tracker is usually off" and
 * "Bitbucket has no boards at all" are different facts a boolean would
 * flatten into the same "false" (Phase 90 Decisions).
 */
export const ForgeCapabilityLevelSchema = z.enum(['full', 'partial', 'none']);
export type ForgeCapabilityLevel = z.infer<typeof ForgeCapabilityLevelSchema>;

export const ForgeCapabilitySchema = z.object({
  pulls: ForgeCapabilityLevelSchema,
  issues: ForgeCapabilityLevelSchema,
  checks: ForgeCapabilityLevelSchema,
  projects: ForgeCapabilityLevelSchema,
  threadResolution: ForgeCapabilityLevelSchema,
  requestChanges: ForgeCapabilityLevelSchema,
  repoListing: ForgeCapabilityLevelSchema,
});
export type ForgeCapability = z.infer<typeof ForgeCapabilitySchema>;

const FULL_CAPABILITY: ForgeCapability = {
  pulls: 'full',
  issues: 'full',
  checks: 'full',
  projects: 'full',
  threadResolution: 'full',
  requestChanges: 'full',
  repoListing: 'full',
};

const NO_CAPABILITY: ForgeCapability = {
  pulls: 'none',
  issues: 'none',
  checks: 'none',
  projects: 'none',
  threadResolution: 'none',
  requestChanges: 'none',
  repoListing: 'none',
};

/**
 * **A placeholder, not Theme H's matrix.** GitHub reports `full` because its
 * adapter (`gh-*.ts`) already implements every read and write this schema
 * describes. GitLab, Bitbucket and Azure DevOps report `none` — not because
 * they lack the capability, but because Theme B ships *accounts*, not
 * adapters: Themes D through G are what build the readers/writers this
 * matrix will honestly describe once they land. `unknown` also reports
 * `none`, since it is never a supported-account kind.
 *
 * Theme H's `capabilities.test.ts` is what turns this into a real matrix
 * asserted exhaustive over `ForgeKind`; nothing here is that assertion yet.
 */
export function capabilitiesFor(kind: ForgeKind): ForgeCapability {
  return kind === 'github' ? FULL_CAPABILITY : NO_CAPABILITY;
}
