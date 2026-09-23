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

/**
 * Per-operation capability (Phase 95 Theme D) — a boolean record beside the
 * tri-state `ForgeCapability` above rather than folded into it: `projects`/
 * `issues` answer "can this provider's surface be *read and shown* at all",
 * which is a coarser question than "can this specific write be attempted".
 * GitLab reads issues fully (`issues: 'full'`) but has no board-item-add
 * mutation this app implements (`ops.addProjectItem: false`) — a single
 * tri-state field cannot carry both facts at once, and the UI's own job here
 * ("hide what a provider cannot do rather than failing on click" — the
 * phase doc's own words) needs the finer one. `linkBlockedBy` is `true` for
 * every supported kind, including the three with no native dependency
 * relation: `linkIssues` never fails for lack of one, it falls back to the
 * `Blocked by #N` body line `parseBlockerRefs` (`forge-graph.ts`) already
 * parses, and reports `via: 'body'` rather than `via: 'api'`. `linkSubIssue`
 * has no such fallback — a parent/child relation has no body-text grammar
 * this app parses — so it is `true` only where a provider adapter implements
 * the native mutation (GitHub today).
 */
export const ForgeCapabilityOpsSchema = z.object({
  createIssue: z.boolean(),
  editIssue: z.boolean(),
  deleteIssue: z.boolean(),
  createProject: z.boolean(),
  editProject: z.boolean(),
  deleteProject: z.boolean(),
  addProjectItem: z.boolean(),
  removeProjectItem: z.boolean(),
  linkBlockedBy: z.boolean(),
  linkSubIssue: z.boolean(),
});
export type ForgeCapabilityOps = z.infer<typeof ForgeCapabilityOpsSchema>;

export const ForgeCapabilitySchema = z.object({
  pulls: ForgeCapabilityLevelSchema,
  issues: ForgeCapabilityLevelSchema,
  checks: ForgeCapabilityLevelSchema,
  projects: ForgeCapabilityLevelSchema,
  threadResolution: ForgeCapabilityLevelSchema,
  requestChanges: ForgeCapabilityLevelSchema,
  repoListing: ForgeCapabilityLevelSchema,
  ops: ForgeCapabilityOpsSchema,
});
export type ForgeCapability = z.infer<typeof ForgeCapabilitySchema>;

/** Every op, on — GitHub's row (Theme D implements every one against a real
 *  `gh`/GraphQL call). */
const FULL_OPS: ForgeCapabilityOps = {
  createIssue: true,
  editIssue: true,
  deleteIssue: true,
  createProject: true,
  editProject: true,
  deleteProject: true,
  addProjectItem: true,
  removeProjectItem: true,
  linkBlockedBy: true,
  linkSubIssue: true,
};

/** Every op, off — `unknown`'s row, and the base a partial row spreads over. */
const NO_OPS: ForgeCapabilityOps = {
  createIssue: false,
  editIssue: false,
  deleteIssue: false,
  createProject: false,
  editProject: false,
  deleteProject: false,
  addProjectItem: false,
  removeProjectItem: false,
  linkBlockedBy: false,
  linkSubIssue: false,
};

/**
 * Issue CRUD, no board CRUD (Theme D implements no board-create/item-add
 * mutation for the three HTTP-backed providers — GitLab's own board is a
 * synthetic label-backed field, not a ProjectV2-shaped resource this app
 * creates or adds items to), body-fallback `blockedBy`, no native `subIssue`.
 * Shared by GitLab, Bitbucket and Azure's rows below — the three take an
 * identical ops shape even though their tri-state `projects` level differs
 * (`'partial'`/`'none'`/`'full'`), because that level describes *reading* a
 * board, and none of the three gets a *write* to one from this theme.
 */
const ISSUE_ONLY_OPS: ForgeCapabilityOps = {
  ...NO_OPS,
  createIssue: true,
  editIssue: true,
  deleteIssue: true,
  linkBlockedBy: true,
};

const FULL_CAPABILITY: ForgeCapability = {
  pulls: 'full',
  issues: 'full',
  checks: 'full',
  projects: 'full',
  threadResolution: 'full',
  requestChanges: 'full',
  repoListing: 'full',
  ops: FULL_OPS,
};

const NO_CAPABILITY: ForgeCapability = {
  pulls: 'none',
  issues: 'none',
  checks: 'none',
  projects: 'none',
  threadResolution: 'none',
  requestChanges: 'none',
  repoListing: 'none',
  ops: NO_OPS,
};

/**
 * GitLab's row (Phase 90 Theme E) — the first provider to make `'partial'`
 * reachable, and the phase doc's own reasoning for each field that is not
 * `'full'`:
 *
 * - `requestChanges: 'none'` — GitLab has no `CHANGES_REQUESTED` at all (the
 *   phase doc's own Decisions); `reviewPull`'s `REQUEST_CHANGES` maps onto an
 *   unapprove-plus-comment, which is a real action but not a distinct,
 *   queryable verdict the way GitHub's is.
 * - `projects: 'partial'` — Issue Boards are a real kanban
 *   (`gitlab/gitlab-board.ts`), but through one synthetic label-backed field
 *   rather than ProjectV2's typed custom fields, and Epics are out (GitLab
 *   Premium). This is the `'partial'` row Theme H's own checklist left open
 *   pending a provider that could report one — see that theme's "here's the
 *   limit" per-view sentence, still unbuilt; noted rather than built here,
 *   since surfacing it in the four views is explicitly Theme H's scope.
 * - Every other field is `full`: pulls, issues, checks (pipelines) and
 *   thread resolution (MR discussions are genuinely resolvable) are complete.
 */
const GITLAB_CAPABILITY: ForgeCapability = {
  pulls: 'full',
  issues: 'full',
  checks: 'full',
  projects: 'partial',
  threadResolution: 'full',
  requestChanges: 'none',
  repoListing: 'full',
  ops: ISSUE_ONLY_OPS,
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
 * already implements every read and write this schema describes. GitLab
 * reports its own row (Theme E) now that a real adapter exists to serve it —
 * see {@link GITLAB_CAPABILITY}. Azure DevOps reports its own row (Theme G) —
 * see {@link AZURE_CAPABILITY} — the third and last of the HTTP-backed
 * providers this phase adds. `unknown` reports `none`, since it is never a
 * supported-account kind. `capabilities.test.ts`
 * is what asserts this exhaustiveness at the value level, not just the type
 * level — a `Record` can still be filled in wrong.
 *
 * **Bitbucket (Theme F) is the second provider to land a genuinely mixed
 * row**, which is what Theme H's own deferred item was waiting on — a
 * `'partial'` capability now reaches a real view. `threadResolution` is
 * `'partial'`: Bitbucket has no thread object at all, only a flat list of
 * inline comments chained by `parent.id` (see `bitbucket-map.ts`'s
 * `synthesizeThreads`), flatter than GitHub's own GraphQL threads. `projects`
 * is `'none'` — Bitbucket Cloud has no board, and this phase does not invent
 * one (Jira is Bitbucket's real board, and it is a different phase). Every
 * other field is `'full'`: the *provider-level* capability exists even where
 * a given repository's answer varies — Bitbucket's issue tracker is
 * per-repository opt-in and often off, but that is `ForgeIssuesResult`'s
 * existing `disabled` flag doing its job (the same one GitHub repos with
 * issues turned off already use), not a capability gap.
 */
const BITBUCKET_CAPABILITY: ForgeCapability = {
  ...FULL_CAPABILITY,
  projects: 'none',
  threadResolution: 'partial',
  ops: ISSUE_ONLY_OPS,
};

/**
 * Azure DevOps's row (Phase 90 Theme G) — the third provider, and the one
 * that reports `projects: 'full'` for the first time: Boards Columns'
 * `stateMappings` gives a genuine per-column, per-work-item-type state
 * table (`azure-board.ts`), a real kanban with no synthetic label rewrite
 * the way GitLab's `'partial'` row needs. `requestChanges` is honestly
 * `'partial'` rather than `'full'` or `'none'` — Azure's reviewer vote *does*
 * carry a real reject (`-10`), so the capability exists, but it is a single
 * numeric vote with no attached review body of its own the way GitHub's
 * `REQUEST_CHANGES` review carries one (the vote and the comment are two
 * separate writes here — see `azure-writes.ts`'s `reviewPull`). Every other
 * field is `'full'`: pull requests, work items (mapped honestly as work
 * items, not issues — see `azure-reads.ts`), pipelines and PR thread
 * resolution are all complete reads and writes.
 */
const AZURE_CAPABILITY: ForgeCapability = {
  ...FULL_CAPABILITY,
  requestChanges: 'partial',
  ops: ISSUE_ONLY_OPS,
};

const CAPABILITIES_BY_KIND: Record<ForgeKind, ForgeCapability> = {
  github: FULL_CAPABILITY,
  gitlab: GITLAB_CAPABILITY,
  bitbucket: BITBUCKET_CAPABILITY,
  azure: AZURE_CAPABILITY,
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
  /** The repo's page in a browser, as the provider returned it (GitHub's
   *  `url`, GitLab's `web_url`, Azure's `webUrl`, Bitbucket's `links.html`). Optional: a renderer
   *  falls back to `reachableRepoWebUrl`'s host + `fullName` build. */
  webUrl: z.string().min(1).optional(),
  /** The provider's own id for the repo, where a command needs it rather
   *  than the name — Azure's repository GUID (`az repos delete --id`);
   *  Bitbucket's `{uuid}`. */
  id: z.string().min(1).optional(),
  /** Optional metadata, each present only where the provider's own listing
   *  call already returns it — never an extra request per repo. */
  /** ISO timestamp of the last push/activity (GitHub `pushedAt`, GitLab
   *  `last_activity_at`, Bitbucket `updated_on`). */
  updatedAt: z.string().optional(),
  stars: z.number().int().nonnegative().optional(),
  defaultBranch: z.string().optional(),
  /** Bytes per language (GitHub `languages` edges), largest first.
   *  Bitbucket reports one `language` only — a single `size: 1` entry. */
  languages: z.array(z.object({ name: z.string().min(1), size: z.number().nonnegative() })).optional(),
});
export type ReachableRepo = z.infer<typeof ReachableRepoSchema>;

/**
 * `unsupported` for a provider with no listing — today only `unknown`, since
 * `capabilitiesFor`'s `repoListing` is `'full'` for all four supported kinds.
 * Never a thrown error: an unreachable network or an expired token is
 * `error`, with a message a settings page can show as-is.
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
