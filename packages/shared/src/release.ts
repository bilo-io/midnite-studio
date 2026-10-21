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
 * The fixed target of every in-app issue write — Phase 93.
 *
 * A bare `owner/repo` slug, not a URL: `gh issue create -R` takes exactly this
 * shape, so there is nothing to parse out of it at call time. It is **always**
 * this value, independent of whichever repository is open in the git client —
 * see `features/report/main/app-issue.ts`'s own docblock for why that makes it the one write in
 * `forge/` with no `Forge` parameter.
 */
export const APP_ISSUES_REPO = 'bilo-io/midnite-apps';

/**
 * The issue-form chooser on `bilo-io/midnite-apps`.
 *
 * The chooser, not a bare `issues/new`: that repo sets `blank_issues_enabled: false`, so GitHub
 * sends a blank-issue URL here anyway, dropping any `title`/`body` it carried. It also once named a
 * `midnite-studio` label that does not exist — the label is `app: midnite-studio`, applied from the
 * form's App dropdown. Opened through `shellOpenExternal`, which is protocol-restricted to
 * http/https/mailto.
 */
export const NEW_ISSUE_URL = `https://github.com/${APP_ISSUES_REPO}/issues/new/choose`;

/**
 * The issue form each in-app kind opens, and the field the reporter's own words go in — the ids in
 * `bilo-io/midnite-apps/.github/ISSUE_TEMPLATE/{bug,feature}.yml`. Only the bug form has a `logs`
 * field, so a feature request goes without the diagnostics tail.
 */
const APP_ISSUE_FORMS = {
  bug: { template: 'bug.yml', field: 'what' },
  feature: { template: 'feature.yml', field: 'problem' },
} as const;

/**
 * The App dropdown option a report files under when its app names none — Studio's. Each app's
 * reporter passes its own slug (`AppIssueFormDraft.app`); `issue-app-label.yml` turns the answer
 * into the `app: <slug>` label, so a slug must exist upstream as a dropdown option and a label.
 */
export const DEFAULT_ISSUE_APP = 'midnite-studio';

/**
 * The shape an app slug takes — `midnite-studio`, `midnite-monitor`. Checked on the wire
 * (`AppIssueAppSchema`) because it becomes a `gh issue create --label` argument.
 */
export const ISSUE_APP_PATTERN = /^midnite-[a-z]+(?:-[a-z]+)*$/;

/**
 * Every URL the reporter may open: midnite-apps' own issue pages. `mstudio:report:open-url`
 * refuses anything else, so the report bridge is not a general-purpose `openExternal`.
 */
export const APP_ISSUES_URL_PREFIX = `https://github.com/${APP_ISSUES_REPO}/issues`;

/** True for an https URL under {@link APP_ISSUES_URL_PREFIX}: the list, the form, or one issue. */
export function isAppIssuesUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const base = `/${APP_ISSUES_REPO}/issues`;
  return (
    parsed.protocol === 'https:' &&
    parsed.host === 'github.com' &&
    parsed.username === '' &&
    parsed.password === '' &&
    (parsed.pathname === base || parsed.pathname.startsWith(`${base}/`))
  );
}

/**
 * The longest URL {@link appIssueFormUrl} returns. GitHub refuses a request line much past 8 KB
 * rather than truncating it — the same ceiling midnite's own prefilled-issue link keeps under.
 */
export const APP_ISSUE_URL_MAX = 8000;

/** The largest `count` in `[0, max]` whose URL fits {@link APP_ISSUE_URL_MAX}; URL length only grows with it. */
function longestFitting(max: number, urlFor: (count: number) => string): number {
  let lo = 0;
  let hi = max;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (urlFor(mid).length <= APP_ISSUE_URL_MAX) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Marks a diagnostics tail that lost its oldest lines to {@link APP_ISSUE_URL_MAX}. */
const TRIMMED_LOGS_MARK = '… (older lines trimmed)\n';

export type AppIssueFormDraft = {
  kind: keyof typeof APP_ISSUE_FORMS;
  title: string;
  description: string;
  /** The redacted `report.bundle()` text — passed through as-is, never re-redacted here. */
  diagnostics: string;
  /** The running build's version; omitted (or `0.0.0`, an unversioned build) leaves the field empty. */
  version?: string;
  /** The app the report is about, as its App dropdown option; {@link DEFAULT_ISSUE_APP} when omitted. */
  app?: string;
};

/**
 * A prefilled issue form on `bilo-io/midnite-apps` — the in-app reporter's path when the `gh` CLI
 * is not installed or signed in, and the reporter submits it themselves under their own account.
 *
 * An issue form reads the query string as one `field-id=value` pair per field, not as `body`, and a
 * `template=` is what keeps GitHub from bouncing the URL to the chooser (see {@link NEW_ISSUE_URL}).
 * Over {@link APP_ISSUE_URL_MAX} the diagnostics lose their *oldest* lines first — they are a log
 * tail, so the newest lines are the ones nearest the failure — and only once none fit is the
 * description cut.
 */
export function appIssueFormUrl(draft: AppIssueFormDraft): string {
  const form = APP_ISSUE_FORMS[draft.kind];
  const build = (description: string, logs: string): string => {
    const params = new URLSearchParams();
    params.set('template', form.template);
    params.set('title', draft.title.trim());
    params.set('app', draft.app ?? DEFAULT_ISSUE_APP);
    if (draft.kind === 'bug' && draft.version !== undefined && draft.version !== '0.0.0') {
      params.set('version', draft.version);
    }
    params.set(form.field, description);
    if (logs.length > 0) params.set('logs', logs);
    return `https://github.com/${APP_ISSUES_REPO}/issues/new?${params.toString()}`;
  };

  const description = Array.from(draft.description.trim());
  const logs = Array.from(draft.kind === 'bug' ? draft.diagnostics.trim() : '');
  const full = build(description.join(''), logs.join(''));
  if (full.length <= APP_ISSUE_URL_MAX) return full;

  // The newest log lines, as many as fit beside the whole description — by code point, so a
  // multi-byte character (which percent-encodes to several URL characters) is never split.
  const logsKeeping = (count: number) =>
    count === 0 ? '' : TRIMMED_LOGS_MARK + logs.slice(logs.length - count).join('');
  const keptLogs = longestFitting(logs.length, (count) =>
    build(description.join(''), logsKeeping(count)),
  );
  if (keptLogs > 0) return build(description.join(''), logsKeeping(keptLogs));
  const keptChars = longestFitting(description.length, (count) =>
    build(description.slice(0, count).join(''), ''),
  );
  return build(description.slice(0, keptChars).join(''), '');
}

/** The section headings of `bilo-io/midnite-apps`' issue forms, as GitHub renders a submitted form. */
const APP_ISSUE_HEADINGS = {
  bug: 'What happened?',
  feature: "What's the problem?",
} as const;

/**
 * The body of an issue filed in-app through `gh issue create`, laid out the way GitHub renders a
 * submitted issue form: `### App`, `### Version`, the reporter's words, then `### Errors or logs`.
 *
 * The layout is load-bearing, not cosmetic. midnite-apps' `issue-app-label.yml` re-derives every new
 * issue's `app:` label from the answer under `### App`, and swaps anything it cannot place for
 * `needs-triage` — so a body without that section had the `app: midnite-studio` label `gh` applied
 * stripped again seconds later (midnite-apps#5). Diagnostics go in for either kind when there are
 * any, since the dialog shows them for both; the form URL drops them for a feature only because
 * that form has no logs field.
 */
export function appIssueBody(draft: AppIssueFormDraft): string {
  const sections = [`### App\n\n${draft.app ?? DEFAULT_ISSUE_APP}`];
  if (draft.version !== undefined && draft.version !== '0.0.0') {
    sections.push(`### Version\n\n${draft.version}`);
  }
  sections.push(`### ${APP_ISSUE_HEADINGS[draft.kind]}\n\n${draft.description.trim()}`);
  const diagnostics = draft.diagnostics.trim();
  if (diagnostics.length > 0) sections.push(`### Errors or logs\n\n\`\`\`\n${diagnostics}\n\`\`\``);
  return sections.join('\n\n');
}

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
