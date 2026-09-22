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
 * Normalise a user-supplied host into the bare hostname `ForgeAccount.host`
 * stores, or `null` if it is not safely one (Phase 90 Theme B's last open
 * item — every URL this app builds from an account's host is a scheme-check).
 *
 * The Settings ▸ Accounts field is a bare host today (`gitlab.com`,
 * `bitbucket.org`, …) but every `whoami`/adapter call this app makes from an
 * account's `host` builds its own `https://` URL by string interpolation
 * (`whoami.ts`'s `gitlabWhoami`, Themes E-G's forthcoming adapters) — so a
 * host smuggling a scheme, a path, userinfo or a fragment through would land
 * unchecked inside that interpolation. Accepting a full base URL for a
 * self-hosted instance is future-proofed for here too, and — per the phase
 * doc — accepted only under `https:`; a bare host is never allowed to carry
 * a scheme, a path, userinfo or a fragment of its own.
 */
export function normalizeForgeAccountHost(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.includes('://')) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.pathname !== '/' && parsed.pathname !== '') return null;
    return parsed.host;
  }

  // A bare host never carries whitespace, userinfo or a path of its own —
  // `new URL('https://' + input)` is the cheapest way to reuse the platform's
  // own hostname grammar rather than hand-rolling one.
  if (/\s/.test(trimmed) || trimmed.includes('@') || trimmed.includes('/')) return null;
  try {
    const parsed = new URL(`https://${trimmed}`);
    if (parsed.pathname !== '/' && parsed.pathname !== '') return null;
    return parsed.host;
  } catch {
    return null;
  }
}

/** True only for a host `normalizeForgeAccountHost` accepts. */
export const isValidForgeAccountHost = (host: string): boolean =>
  normalizeForgeAccountHost(host) !== null;

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
 * The tri-state capability matrix (Phase 90 Theme H), keyed by `ForgeKind`
 * through a `Record` rather than a boolean or an `if`/`else` — so **adding a
 * fifth `ForgeKind` fails the build** until this object grows a matching key,
 * which is the whole point: a provider this app knows the URL grammar for but
 * has never declared a capability record for is a build error, not a runtime
 * surprise a view discovers by rendering `undefined`.
 *
 * GitHub reports `full` because its adapter (`main/forge/github/`, Theme D)
 * already implements every read and write this schema describes. GitLab,
 * Bitbucket and Azure DevOps report `none` — not because they lack the
 * capability, but because no adapter exists yet to serve them: Themes E, F
 * and G are what turn each into a real (frequently `'partial'`) row here.
 * `unknown` reports `none` too, since it is never a supported-account kind.
 * `capabilities.test.ts` is what asserts this exhaustiveness at the value
 * level, not just the type level — a `Record` can still be filled in wrong.
 */
const CAPABILITIES_BY_KIND: Record<ForgeKind, ForgeCapability> = {
  github: FULL_CAPABILITY,
  gitlab: NO_CAPABILITY,
  bitbucket: NO_CAPABILITY,
  azure: NO_CAPABILITY,
  unknown: NO_CAPABILITY,
};

export function capabilitiesFor(kind: ForgeKind): ForgeCapability {
  return CAPABILITIES_BY_KIND[kind];
}

// --- reachable repos (Phase 90 Theme C) -------------------------------------

/**
 * One repository the active account can reach — the repo picker's
 * "clone-or-open" listing. A listing only: nothing lands on disk without the
 * user choosing a destination (Phase 49's settled posture), and
 * `main/forge/reachable-repos.ts` is the one place this is fetched from.
 */
export const ReachableRepoSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  /** `${owner}/${name}` — what the picker displays and what a local repo's
   *  own `Forge.owner`/`Forge.repo` is matched against. */
  fullName: z.string().min(1),
  /** The clone URL the provider itself returned. */
  url: z.string().min(1),
  private: z.boolean(),
});
export type ReachableRepo = z.infer<typeof ReachableRepoSchema>;

/**
 * `unsupported` for a provider whose adapter does not exist yet — the same
 * boundary `capabilitiesFor`'s `repoListing: 'none'` already draws for every
 * kind but `github` until Themes E-G land. Never a thrown error: an
 * unreachable network or an expired token is `error`, with a message a
 * settings page can show as-is.
 */
export const ReachableReposResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), repos: z.array(ReachableRepoSchema) }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['unsupported', 'no-account', 'error']),
    message: z.string().optional(),
  }),
]);
export type ReachableReposResult = z.infer<typeof ReachableReposResultSchema>;
