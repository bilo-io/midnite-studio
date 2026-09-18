import { lookupRepoIdByForge } from './repo-forge-registry';

/**
 * A forge URL that names something Midnite Studio already has a native view
 * for, resolved to that view.
 *
 * The plain-click rule (ad hoc, click-modifier unification) is "prefer the
 * app's own feature over a browser tab" — a PR link should land on
 * `PrDetail`, not a GitHub page rendered in an iframe-like tab. `repoId` is
 * always the registered repo the URL's `owner/repo` matched, never the URL's
 * own strings, so a caller can hand it straight to `selectRepo` et al.
 */
export type InAppRoute =
  | { view: 'reviews'; repoId: string; pull: number }
  | { view: 'issues'; repoId: string; issue: number }
  | { view: 'actions'; repoId: string; runId: string }
  | { view: 'graph'; repoId: string };

/**
 * One row of the table `resolveInAppRoute` matches a URL's remaining path
 * segments against, once `owner/repo` has resolved to a registered repo.
 *
 * Data, not a chain of `if`s: adding a destination (a GitHub Project board,
 * say) is one more row, not a new branch threaded through the function below.
 * Ordered most-specific first — `graph`'s empty match would otherwise shadow
 * everything else.
 */
const ROUTE_MATCHERS: ReadonlyArray<{
  match: (segments: readonly string[]) => RegExpMatchArray | null;
  build: (repoId: string, match: RegExpMatchArray) => InAppRoute;
}> = [
  {
    // GitHub `/pull/123`, GitLab `/-/merge_requests/123`.
    match: (segments) => segments.join('/').match(/^(?:-\/)?(?:pull|merge_requests)\/(\d+)/),
    build: (repoId, match) => ({ view: 'reviews', repoId, pull: Number(match[1]) }),
  },
  {
    // GitHub `/issues/123`, GitLab `/-/issues/123`.
    match: (segments) => segments.join('/').match(/^(?:-\/)?issues\/(\d+)/),
    build: (repoId, match) => ({ view: 'issues', repoId, issue: Number(match[1]) }),
  },
  {
    // GitHub `/actions/runs/123`, GitLab `/-/pipelines/123`.
    match: (segments) => segments.join('/').match(/^(?:actions\/runs|-\/pipelines)\/(\d+)/),
    build: (repoId, match) => ({ view: 'actions', repoId, runId: match[1] ?? '' }),
  },
  {
    // The repo's own root — `owner/repo`, nothing after it (an optional
    // trailing slash is already stripped by the `filter` below). Its in-app
    // view is the graph: the one place every repo lands on when it is opened.
    match: (segments) => (segments.length === 0 ? [''] : null),
    build: (repoId) => ({ view: 'graph', repoId }),
  },
];

/**
 * Resolve a URL to the in-app view that covers it, or `null` when nothing
 * does.
 *
 * `null` is not a failure — it is the common case, and every caller treats it
 * as "fall through to the embedded browser" (`open-in-midnite.ts`). Two
 * things have to be true for anything else: the URL's `host/owner/repo` has
 * to match a repo Midnite already has registered (`repo-forge-registry.ts` —
 * a link to a PR in a repo nobody has open here stays a browser tab, on
 * purpose: there is no view to send it to), and the remaining path has to
 * match one of {@link ROUTE_MATCHERS}.
 */
export function resolveInAppRoute(url: string): InAppRoute | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length < 2) return null;
  const [owner, repo, ...rest] = segments;
  if (owner === undefined || repo === undefined) return null;

  const repoId = lookupRepoIdByForge(parsed.hostname, owner, repo);
  if (repoId === null) return null;

  for (const matcher of ROUTE_MATCHERS) {
    const match = matcher.match(rest);
    if (match) return matcher.build(repoId, match);
  }
  return null;
}
