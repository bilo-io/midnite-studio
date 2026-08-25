import { z } from 'zod';

/**
 * Which forge a remote URL points at.
 *
 * `unknown` is a first-class answer, not an error case. A remote can legitimately
 * be a bare path on a NAS, a `git-daemon` URL, or a Gerrit host we have no issue
 * scheme for — and the correct behaviour for all of those is to render `#123` as
 * plain text rather than to invent a link that 404s. Every consumer therefore has
 * to handle `unknown`, which is exactly the point of spelling it out in the type.
 */
export const ForgeKindSchema = z.enum(['github', 'gitlab', 'unknown']);
export type ForgeKind = z.infer<typeof ForgeKindSchema>;

/**
 * A remote URL, normalised into the three parts a link needs.
 *
 * `owner` carries any intermediate path segments for self-hosted GitLab, where
 * projects nest arbitrarily deep (`gitlab.corp/platform/infra/tooling.git` has
 * owner `platform/infra`). That is why it is a string rather than a single
 * segment: re-joining split segments at every call site is how a subgroup URL
 * ends up missing its middle.
 */
export const ForgeSchema = z.object({
  /** Hostname only — no scheme, no port, no credentials. */
  host: z.string(),
  /** User, org, or `group/subgroup/...` path. Never leading or trailing `/`. */
  owner: z.string(),
  /** Project name, with any `.git` suffix stripped. */
  repo: z.string(),
  kind: ForgeKindSchema,
});
export type Forge = z.infer<typeof ForgeSchema>;

/**
 * A configured remote.
 *
 * `pushUrl` is always populated: git's own semantics are that
 * `remote.<name>.pushurl` falls back to `remote.<name>.url`, so resolving the
 * fallback once in the engine beats making every reader remember it.
 *
 * `forge` is derived in main and shipped on the wire rather than re-derived in
 * the renderer. The normaliser lives in git-engine alongside the other parsers,
 * and the renderer may not import git-engine — so a renderer-side derivation
 * would mean a second implementation of the URL grammar, which is precisely the
 * kind of thing that agrees until it doesn't.
 */
export const RemoteSchema = z.object({
  /** `origin`, `upstream`, … */
  name: z.string(),
  fetchUrl: z.string(),
  pushUrl: z.string(),
  /** null when the URL is not recognisably a forge project (local path, daemon URL). */
  forge: ForgeSchema.nullable().default(null),
});
export type Remote = z.infer<typeof RemoteSchema>;

/**
 * The remote whose forge backs `#123` links.
 *
 * `origin` first, then the first remote that resolves to a *known* forge at all.
 * Config order is deliberately not the tiebreak on its own: `git config` lists
 * remotes in file order, so a second remote added above origin by hand would
 * silently retarget every issue link in the app.
 *
 * A fork's issues often live on `upstream` rather than `origin`, which argues
 * for preferring it — but that only helps contributors to a fork and actively
 * misdirects the far commoner single-remote case, so it is left out until
 * something asks for it.
 */
export function pickForgeRemote(remotes: readonly Remote[]): Remote | null {
  const known = remotes.filter((r) => r.forge !== null && r.forge.kind !== 'unknown');
  return known.find((r) => r.name === 'origin') ?? known[0] ?? null;
}

/** The forge's own project page. */
export function forgeProjectUrl(forge: Forge): string | null {
  if (forge.kind === 'unknown') return null;
  return `https://${forge.host}/${forge.owner}/${forge.repo}`;
}

/**
 * Where `#123` points.
 *
 * GitHub and GitLab disagree on the path: GitLab inserts a `/-/` separator so a
 * project's own routes can never collide with a subgroup named `issues`.
 */
export function forgeIssueUrl(forge: Forge, issue: number): string | null {
  const base = forgeProjectUrl(forge);
  if (base === null || !Number.isSafeInteger(issue) || issue <= 0) return null;

  switch (forge.kind) {
    case 'github':
      return `${base}/issues/${issue}`;
    case 'gitlab':
      return `${base}/-/issues/${issue}`;
    default:
      return null;
  }
}
