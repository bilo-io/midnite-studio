/**
 * `git --version` prints one line and the vendor decorates it freely:
 * `git version 2.39.5 (Apple Git-154)` on macOS, a bare `git version 2.43.0`
 * from a source build, `git version 2.45.2.windows.1` on Windows. The health
 * check stores that line verbatim (`system-health.ts` does `stdout.trim()`),
 * which is the right thing for a diagnostic to keep — but it is not what the
 * welcome modal should show.
 *
 * So the parsing lives here, in the renderer, rather than narrowing what main
 * sends: the wire contract (`SystemHealthResponse.git.version`) stays a string,
 * the vendor suffix stays available for the tooltip, and this module owns the
 * one question the UI actually asks — *which version number, and where are its
 * release notes*.
 */

/** The numeric core of a version line, e.g. `2.39.5` out of `git version 2.39.5 (Apple Git-154)`. */
const VERSION_RE = /\b(\d+\.\d+(?:\.\d+)*)/;

export type GitVersion = {
  /** Bare dotted number, no leading `v` — `2.39.5`. */
  number: string;
  /** Display form, with the `v` the UI shows — `v2.39.5`. */
  label: string;
  /** Upstream release notes for that version. */
  releaseNotesUrl: string;
};

/**
 * Release notes are pinned to `master` rather than to a `v<version>` tag on
 * purpose. RelNotes files are never removed from git's tree, so `master` always
 * resolves; a tag does not, because a vendor build can report a version that was
 * never tagged upstream (`2.45.2.windows.1` is the obvious case, and Apple's
 * builds carry their own patch numbering). Pinning to the tag would 404 for
 * exactly the users whose git is unusual enough to want the notes.
 */
export function releaseNotesUrl(version: string): string {
  return `https://github.com/git/git/blob/master/Documentation/RelNotes/${version}.txt`;
}

/**
 * Pull the version out of a `git --version` line.
 *
 * Returns `null` for anything without a recognisable number rather than
 * guessing — the caller falls back to showing the raw string, which is more
 * useful than a wrong link.
 */
export function parseGitVersion(raw: string | null | undefined): GitVersion | null {
  if (!raw) return null;
  const number = VERSION_RE.exec(raw)?.[1];
  if (!number) return null;
  return { number, label: `v${number}`, releaseNotesUrl: releaseNotesUrl(number) };
}
