import type { Forge, ForgeKind } from '@midnite/git-shared';

/**
 * Normalise a git remote URL into `{host, owner, repo, kind}`.
 *
 * Git accepts five syntaxes for the same remote and they do not share a grammar:
 *
 *   ssh://git@github.com:22/o/r.git     a real URL
 *   git@github.com:o/r.git              scp-like — NOT a URL; the `:` is a path
 *                                       separator, not a port
 *   https://github.com/o/r.git          a real URL
 *   git://github.com/o/r.git            a real URL, no auth
 *   /srv/git/r.git  ·  ../r             a filesystem path
 *
 * `new URL()` handles three of those and quietly mangles the scp-like form — it
 * parses `git@github.com:o/r.git` as protocol `git@github.com:` with the whole
 * `o/r.git` as its opaque path, so the host disappears. The scp form is the one
 * git itself prints for a GitHub SSH remote, so it cannot be the case we get
 * wrong; it is matched first, before anything is handed to `URL`.
 *
 * Returns null rather than a partial answer whenever the URL does not resolve to
 * an `owner/repo` pair. Callers linkify only what came back non-null, so "we
 * could not work out what this is" and "this is a forge we have no scheme for"
 * stay distinguishable — the latter comes back as `kind: 'unknown'`.
 */
export function parseRemoteUrl(raw: string): Forge | null {
  const url = raw.trim();
  if (url.length === 0) return null;

  const parts = splitHostAndPath(url);
  if (parts === null) return null;

  const { host, path } = parts;
  if (host.length === 0) return null;

  const segments = path
    .split('/')
    .filter((s) => s.length > 0)
    // `~user/repo.git` is a valid ssh path; the tilde is addressing, not owner.
    .map((s, i) => (i === 0 ? s.replace(/^~/, '') : s))
    .filter((s) => s.length > 0);

  if (segments.length < 2) return null;

  const repo = stripGitSuffix(segments[segments.length - 1] as string);
  const owner = segments.slice(0, -1).join('/');
  if (repo.length === 0 || owner.length === 0) return null;

  return { host, owner, repo, kind: kindFor(host) };
}

const CANONICAL: readonly (readonly [ForgeKind, string])[] = [
  ['github', 'github.com'],
  ['gitlab', 'gitlab.com'],
];

/**
 * Which forge a hostname belongs to.
 *
 * Two rules, and the second needs the guard it carries. The canonical domain
 * and any subdomain of it are the easy case. Self-hosted installations are the
 * hard one: they are conventionally `github.<company>.com` /
 * `gitlab.<company>.example`, so a leading label of `github` or `gitlab` is the
 * only signal available — and it is also exactly what a lookalike host provides.
 * `github.com.evil.example` has the leading label AND embeds the canonical
 * domain, which is the classic construction; it is excluded explicitly.
 *
 * What this cannot distinguish is `github.evil.example` from `github.acme.com`:
 * both are somebody's subdomain named `github`, and telling them apart needs to
 * know who owns the registrable domain. That is acceptable here because the host
 * always comes from the user's OWN configured remote and every URL built from it
 * points back at that same host — a misclassification changes the path shape of
 * a link to a server they already clone from, not who receives it.
 */
function kindFor(host: string): ForgeKind {
  // A trailing dot is a legal fully-qualified hostname and would defeat every
  // suffix comparison below.
  const lower = host.toLowerCase().replace(/\.$/, '');

  for (const [kind, canonical] of CANONICAL) {
    if (lower === canonical || lower.endsWith(`.${canonical}`)) return kind;

    const label = canonical.slice(0, canonical.indexOf('.'));
    if (lower.startsWith(`${label}.`) && !lower.startsWith(`${canonical}.`)) return kind;
  }

  return 'unknown';
}

const stripGitSuffix = (name: string): string => name.replace(/\.git$/, '');

/**
 * Reduce any of git's remote syntaxes to a hostname and a path.
 *
 * Split out from `parseRemoteUrl` so the syntax handling is testable on its own
 * and so the scp-like special case sits visibly ahead of the `URL` path rather
 * than buried in a branch.
 */
function splitHostAndPath(url: string): { host: string; path: string } | null {
  // scp-like: `[user@]host:path`, where the path must NOT start with `/` (that
  // would make it `host:/path`, still scp-like) and the segment after the colon
  // must not be a bare port number — `ssh://host:22/o/r` is a URL, not scp.
  const scp = /^(?:[^@/]+@)?([^/@:]+):(?!\/\/)(.+)$/.exec(url);
  if (scp && !url.includes('://')) {
    // The host char class excludes `:`, so there is no port to strip here —
    // `host:22/o/r.git` is scp-like with the path `22/o/r.git`, which is how
    // git itself reads it. Only the `ssh://` form below can carry a real port.
    return { host: scp[1] ?? '', path: scp[2] ?? '' };
  }

  if (url.includes('://')) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    // `file:///srv/git/r.git` has no host and is a local path, not a forge.
    if (parsed.hostname.length === 0) return null;
    return { host: parsed.hostname, path: decodePath(parsed.pathname) };
  }

  // Anything left is a filesystem path — a valid remote, never a forge.
  return null;
}

/**
 * Percent-decode a URL path, falling back to the raw text.
 *
 * `decodeURIComponent` THROWS a `URIError` on a malformed escape, and `%` is a
 * legal character in a repository name — `100%uptime.git` is a real shape. An
 * uncaught throw here does not merely lose one remote: it escapes `listRemotes`
 * and rejects the whole `mgit:remotes:list` call, so one oddly-named repo takes
 * out the forge links for every remote in that repository.
 */
function decodePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}
