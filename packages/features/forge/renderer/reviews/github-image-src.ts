/**
 * Resolve a markdown image's `src` against the GitHub repo it was authored in.
 *
 * GitHub resolves a repo-relative image path (`docs/screenshots/x.png`) when
 * the markdown renders as a *file in the repo* — a README on the repo's own
 * page — but **not** when it renders as an issue or PR body: an issue/PR body
 * has no "current directory" to resolve against, so the same markdown shows a
 * broken image on github.com too. Rewriting the path here is not "matching
 * GitHub's behaviour" — GitHub never resolves this case — it's doing the one
 * thing that makes the author's relative path work anywhere: turning it into
 * an absolute `raw.githubusercontent.com` URL pinned to the PR's own ref,
 * which is unambiguous and (for a public repo) fetchable with no auth.
 *
 * A `src` that already has a scheme (`https:`, `data:`, …) or is
 * protocol-relative (`//host/…`) is returned unchanged — this only rewrites a
 * markdown-authored relative path, never an uploaded GitHub asset
 * (`user-images.githubusercontent.com`, `github.com/user-attachments/assets/…`)
 * or any other absolute URL a body might already carry.
 */

/** What a relative image path is resolved against. */
export type GithubRawContext = {
  /** `owner/repo`, exactly as it appears in the PR/issue's own `github.com` URL path. */
  ownerRepo: string;
  /** Commit sha (preferred — stable even if the branch moves) or branch name. */
  ref: string;
};

const ABSOLUTE_SRC = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/;

/**
 * `owner/repo` out of a `github.com/<owner>/<repo>/…` URL (a PR's or issue's
 * own `url` field), or `null` for anything else — a non-GitHub host, or a URL
 * with too few path segments to name a repo at all.
 */
export function ownerRepoFromGithubUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'github.com') return null;

  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
  const [owner, repo] = segments;
  if (owner === undefined || repo === undefined) return null;
  return `${owner}/${repo}`;
}

/**
 * Rewrite `src` to an absolute raw-content URL when it is a repo-relative
 * path and `context` is known; otherwise return it unchanged.
 */
export function resolveGithubImageSrc(
  src: string | undefined,
  context: GithubRawContext | null,
): string | undefined {
  if (src === undefined || src.length === 0 || context === null) return src;
  if (ABSOLUTE_SRC.test(src)) return src;

  // Strip a leading `./` (mdast leaves it as authored) and an in-repo-root
  // leading `/` before joining onto the raw-content path.
  const path = src.startsWith('/') ? src.slice(1) : src.startsWith('./') ? src.slice(2) : src;
  if (path.length === 0) return src;

  return `https://raw.githubusercontent.com/${context.ownerRepo}/${context.ref}/${path}`;
}
