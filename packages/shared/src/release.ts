/**
 * Where this app's public release material lives, and how to read a version's
 * section out of it.
 *
 * Downloads, releases and the changelog all sit in the **public**
 * `bilo-io/midnite-apps` repository rather than here — this repo is private, so
 * nothing a user touches can be served from it (see CLAUDE.md). Two consequences
 * are baked into the constants below. Release tags there are **namespaced**
 * (`midnite-studio/vX.Y.Z`, never a bare `vX.Y.Z`), because a sibling app would
 * otherwise collide on the same tag; and the changelog is a *mirror* — the
 * release flow copies each released section across when it publishes a tag.
 *
 * Lives in `shared` rather than in main because the extractor is a pure string
 * function worth unit-testing on its own, and because the URLs are read from
 * both sides of the boundary: main fetches the raw file, the renderer links to
 * the human-readable pages.
 */

/** The raw changelog main fetches. Unauthenticated — the mirror repo is public. */
export const RELEASE_CHANGELOG_RAW_URL =
  'https://raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-studio/CHANGELOG.md';

/** The same file, rendered — the popover's "full changelog" link. */
export const RELEASE_CHANGELOG_PAGE_URL =
  'https://github.com/bilo-io/midnite-apps/blob/main/midnite-studio/CHANGELOG.md';

/** Every Midnite Studio release, newest first. The fallback when no tag matches. */
export const RELEASE_LIST_URL =
  'https://github.com/bilo-io/midnite-apps/releases?q=midnite-studio&expanded=true';

/**
 * The bug tracker — Phase 65.
 *
 * Same reasoning as every URL above: this repo is private, so nothing a user
 * touches can be served from it, and the tracker does the same job for every
 * midnite app at once. Until this constant there was no way to report a bug at
 * all — `grep -rni "report a bug"` over `packages` and `docs` returned zero.
 *
 * Not namespaced the way the release tags are: issues carry a label, not a tag,
 * so one list serves the whole repo and the filter belongs in the query.
 */
export const ISSUES_URL = 'https://github.com/bilo-io/midnite-apps/issues';

/**
 * A new issue, pre-labelled for this app.
 *
 * The label is what keeps a sibling app's tracker readable, and pre-filling it
 * is what stops a reporter having to know the convention. Opened through
 * `shellOpenExternal`, which is protocol-restricted to http/https/mailto.
 */
export const NEW_ISSUE_URL =
  'https://github.com/bilo-io/midnite-apps/issues/new?labels=midnite-studio';

/**
 * The release page for one version.
 *
 * The tag is namespaced, and GitHub serves a slash inside a tag path verbatim —
 * `releases/tag/midnite-studio/v0.3.1` resolves. A bare `v0.3.1` would resolve
 * too, to whichever sibling app happened to own it.
 */
export function releasePageUrl(version: string): string {
  return `https://github.com/bilo-io/midnite-apps/releases/tag/midnite-studio/v${version}`;
}

/** `## [1.2.3]`, `## [1.2.3] - 2026-01-01`, `## 1.2.3` — all four shapes in the wild. */
const HEADING = /^##\s+\[?([^\]\s]+)\]?/;

/**
 * The body of one version's `## [x.y.z]` section, or `null` when the changelog
 * does not carry that version yet.
 *
 * "Not yet" is the normal case, not an error: a build is published before its
 * section reaches the public mirror, and every pre-release build has no section
 * at all. Callers render the absence rather than treating it as a failure.
 *
 * Fences are tracked because a section body may quote markdown — a ``` block
 * containing a `## ` line would otherwise end the section early, truncating the
 * notes at exactly the point they got interesting.
 */
export function extractChangelogSection(markdown: string, version: string): string | null {
  const lines = markdown.split('\n');
  const wanted = version.replace(/^v/, '');
  let fenced = false;
  let start = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = HEADING.exec(line);
    if (!match) continue;
    if (start >= 0) return body(lines.slice(start, i));
    if (match[1]?.replace(/^v/, '') === wanted) start = i + 1;
  }

  return start >= 0 ? body(lines.slice(start)) : null;
}

/**
 * Trim a section to its content, dropping the link-reference definitions
 * (`[Unreleased]: https://…`) that Keep a Changelog parks at the foot of the
 * file — they belong to the document, not to the last release, and rendered
 * markdown shows them as nothing at all.
 */
function body(lines: string[]): string | null {
  const text = lines
    .filter((line) => !/^\[[^\]]+\]:\s*\S+/.test(line))
    .join('\n')
    .trim();
  return text.length > 0 ? text : null;
}
