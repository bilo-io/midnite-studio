# Phase 131 — Per-app changelogs

**Refined: x1** · 2026-11-12 · data model & contract, functionality & edge cases, UI/UX & interaction, empty / loading / error states, persistence & caching, security & egress, testing & verification, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

Planned 2026-11-12 by an unattended swarm planner · grounded against the tree as of `bec20236a`.

Every suite app ships in lockstep with Studio, but only Studio has release notes. The root
[`CHANGELOG.md`](../../../CHANGELOG.md) is Studio's, `release.yml`'s `publish-feed` job mirrors its released section
into the public feed repo at `midnite-studio/CHANGELOG.md`
([`publish-feed-changelog.mjs`](../../../scripts/publish-feed-changelog.mjs)), and two surfaces read that mirror:
Studio's version pill drop-up ([`version-notes-panel.tsx`](../../../packages/app/src/features/version/version-notes-panel.tsx),
current version plus three earlier ones) and the launcher's "What's new" on Studio's detail sheet and its Release
notes dialog ([`main/changelog.ts`](../../../apps/launcher/src/main/changelog.ts),
[`components/changelog.tsx`](../../../apps/launcher/src/renderer/components/changelog.tsx)). Agents, Media, Gamer,
Vanguard, Mind, Money, Browser, Science, Startup and the launcher itself have no changelog at all, and the launcher's
per-app "Release notes" menu item opens Studio's notes whichever app it was picked on. This phase gives every
released app its own changelog, drafts it in release-prep, publishes it beside Studio's, and shows it in the
launcher and inside each app.

> **Builds on.**
> - **The changelog parsers** in [`release.ts`](../../../packages/shared/src/release.ts): `extractChangelogSection(md, version)`,
>   `extractLatestSections(md, n)` (PR #1153) and the `ChangelogSection` interface. `release.ts` has no imports, which is
>   why the launcher can take it per file (`@midnite/studio-shared/release`); it stays import-free.
> - **The mirror script** — `mirrorSection(target, version, body, releaseUrl, date)` (idempotent per version) and its
>   colocated `publish-feed-changelog.test.mjs`. It imports the **built** `packages/shared/dist/release.js`.
> - **The release jobs** in [`release.yml`](../../../.github/workflows/release.yml): `publish-feed` (Studio's feed +
>   mirror, after the Studio release) and `publish-suite` (the `midnite-launcher/vX.Y.Z` release with every bundle zip,
>   `catalog.json`, the launcher feed). Versions are lockstep: [`catalog-feed.ts`](../../../apps/launcher/src/common/catalog-feed.ts)
>   rejects a catalog whose app versions differ from `runtimeVersion`, and the release-prep skill bumps every `apps/*`
>   together.
> - **Which app a path belongs to** — every project's `moon.yml` carries `app-<id>` / `app-all` tags, which
>   [`affected-apps.mjs`](../../../scripts/affected-apps.mjs) already reads (`appsForProjects`).
> - **The suite shell** — every suite app mounts [`SuiteAppShell`](../../../packages/frame/src/shell/suite-app-shell.tsx) →
>   [`AppShell`](../../../packages/frame/src/shell/app-shell.tsx) with `nav`, so the rail footer AppShell builds (the
>   Settings row) is one place that reaches all nine apps. Studio passes its own `rail`, so it is untouched by that
>   footer. Main halves: [`registerSuiteMain`](../../../packages/runtime/src/app-main/suite-main.ts),
>   [`createSuiteBridge`](../../../packages/runtime/src/app-main/suite-preload.ts),
>   [`suiteWindowOptions`](../../../packages/runtime/src/app-main/suite-window.ts).
> - **Egress** (Phase 115): main-side fetches go through [`createGuardedFetch`](../../../packages/runtime/src/net/guarded-fetch.ts);
>   `raw.githubusercontent.com` is already registered in [`egress.ts`](../../../packages/shared/src/egress.ts)
>   (owner `launcher`, switch `launcher-updates`, default on).

> **Scope guardrails.** Release notes only: no in-app "what's new" tour, no notification when a version changes, no
> website changelog page (the website must never link to or name the public feed repo), no notes inside
> `catalog.json`. Modules have no changelog of their own — a module change is written into each host app that mounts
> it. Studio's changelog stays the root `CHANGELOG.md` and Studio's drop-up keeps reading `update.releaseNotes`.
> macOS only, `react-icons` only, every new test a vitest unless it names the browser capability it needs.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_Every app gets the "what changed" Studio already has._ The suite has shipped eleven apps in lockstep since Phase 113,
yet release notes exist for Studio alone, so a Money or Vanguard user — and the launcher's detail sheet for either —
has nothing to read when a version lands. This phase adds one Keep a Changelog file per app, has release-prep draft
each app's section from the commits that touched it, mirrors every file into the public feed beside Studio's, and
shows the result in the launcher (per app, plus its own) and in a version pill in every suite app's rail. Planned
2026-11-12; build order **A**, then **B, C, D, E** in parallel, then **F**.

**Theme A — Per-app changelog files and the shared contract.** ✅ [#1161](https://github.com/bilo-io/midnite-studio/pull/1161) `apps/<id>/CHANGELOG.md` for the launcher and the nine
suite apps (seeded with `[Unreleased]` and a curated 0.0.6 section), and `release.ts` naming each app's source path,
feed folder, raw URL, page URL and release page, pinned by a guard test.

**Theme B — Release-prep drafts every app's section.** ◻ A path-to-app attribution script over the moon `app-<id>`
tags, the release-prep skill drafting one section per app (a one-line maintenance entry when nothing changed), and a
release-time warning when a file has no section for the tag.

**Theme C — The feed publishes every app's changelog.** ◻ The mirror script gains an every-app mode that creates a
missing feed file and back-fills any released section the feed lacks; `publish-suite` runs it and commits
`midnite-<id>/CHANGELOG.md` beside `catalog.json`.

**Theme D — Launcher: What's new for every app, and its own.** ◻ The changelog channel takes an app id with a per-app
cache, every released app's detail sheet shows its own notes, the Release notes dialog follows the app it was opened
from, and the launcher's version opens the launcher's notes.

**Theme E — A version pill and drop-up in every suite app.** ◻ The runtime passes the app version to the renderer and
serves the app's own notes through the guarded fetch; the frame gets a presentational `ReleaseNotesPanel` and a
`SuiteVersionPill` in AppShell's rail footer; Studio's panel becomes a thin wrapper over the same component.

**Theme F — Verification and the first release.** ◻ Shots of the two new surfaces, the dry-run release artifact
check, and the packaged pass on the first real release that publishes per-app files.

## Build order

1. **A** first — every other theme reads `CHANGELOG_APP_IDS` and the URL helpers, and C mirrors A's files.
2. **B**, **C**, **D**, **E** in parallel; they touch disjoint files (scripts + skills; the mirror script + `release.yml`;
   `apps/launcher`; runtime + frame + Studio's version folder + nine `apps/*/main/index.ts`).
3. **F** last. Its packaged item waits for the first tag cut after C merges.

A partial landing is safe at every step: without C the per-app raw URLs 404, which D and E render as "No release notes
published yet." rather than as an error.

## Deliverables

### A — Per-app changelog files and the shared contract (M)

- [x] `CHANGELOG_APP_IDS` and the per-app helpers in [`release.ts`](../../../packages/shared/src/release.ts) (stays import-free)
  - `export const CHANGELOG_APP_IDS = ['studio', 'launcher', 'agents', 'browser', 'gamer', 'media', 'mind', 'money',
    'science', 'startup', 'vanguard'] as const;` and `export type ChangelogAppId = (typeof CHANGELOG_APP_IDS)[number];`
    — Studio, the launcher, then every `apps/<id>` with a `moon.yml`, alphabetical.
  - `changelogSourcePath(app: ChangelogAppId): string` → `'CHANGELOG.md'` for `studio`, `` `apps/${app}/CHANGELOG.md` `` otherwise.
  - `changelogFeedDir(app: ChangelogAppId): string` → `` `midnite-${app}` `` (so `midnite-studio`, `midnite-launcher`,
    `midnite-agents` …, the same slug shape as `ISSUE_APP_PATTERN`).
  - `changelogRawUrl(app)` → `` `https://raw.githubusercontent.com/bilo-io/midnite-apps/main/${changelogFeedDir(app)}/CHANGELOG.md` ``;
    `changelogPageUrl(app)` → the `github.com/…/blob/main/…` form. `RELEASE_CHANGELOG_RAW_URL` and
    `RELEASE_CHANGELOG_PAGE_URL` become `changelogRawUrl('studio')` / `changelogPageUrl('studio')` (same strings; every
    existing importer unchanged).
  - `appReleasePageUrl(app: ChangelogAppId, version: string): string` → `releasePageUrl(version)` for `studio`;
    `` `https://github.com/bilo-io/midnite-apps/releases/tag/midnite-launcher/v${version}` `` for every other id, because
    the launcher release is the one every bundle zip is attached to (`publish-suite`).
  - Verified by `release.test.ts`: the two legacy constants equal the helper output for `studio`; `changelogSourcePath('money')`
    is `apps/money/CHANGELOG.md`; `appReleasePageUrl('agents', '0.0.7')` ends `/tag/midnite-launcher/v0.0.7`.
- [x] Net-new `apps/launcher/CHANGELOG.md` and `apps/<id>/CHANGELOG.md` for the nine suite apps
  - Header: `# Changelog — Midnite <Name>` (`Midnite Apps` for the launcher; `<Name>` is the catalog `name` in
    [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts)), then three sentences: Keep a Changelog format; versions
    are lockstep with the whole suite; released sections are mirrored to the public feed by the release flow. No link to
    the feed repo (the root file's link-free wording is the model).
  - `## [Unreleased]` (empty), then a back-filled `## [0.0.6] - 2026-10-31` curated from the root file's 0.0.6 section:
    the Phase 123 "One shell for every suite app" and Phase 124 "Modules" lines go into every app; a line naming an app
    or one of its modules goes into that app only; the launcher gets the "Midnite Apps catalog" and "Update launcher"
    lines. Older versions are not back-filled (Decision 6).
  - No trailing link-reference block in the seed; C's mirror appends the refs it needs in the feed copy.
- [x] Guard test, net-new `scripts/changelog-files.test.mjs` (vitest, node builtins only)
  - `CHANGELOG_APP_IDS` (read from `packages/shared/src/release.ts` source with a regex, so the test needs no build) equals
    `['studio', 'launcher', ...sorted(dirs of apps/*/moon.yml minus studio and launcher)]`. A new `apps/health` without a
    changelog fails here.
  - Each `changelogSourcePath` exists, its first line starts `# Changelog`, and it carries exactly one `## [Unreleased]`.
  - Every `## ` heading in each file matches `^## \[(Unreleased|\d+\.\d+\.\d+)\]( - \d{4}-\d{2}-\d{2})?$` — the shape
    `extractLatestSections` reads.
  - Needs no wiring: the root [`vitest.config.ts`](../../../vitest.config.ts) already includes `scripts/**/*.test.mjs`.

### B — Release-prep drafts every app's section (M)

- [ ] Net-new `scripts/changelog-attribution.mjs`, self-contained (node builtins, no `@midnite/*`), like `affected-apps.mjs`
  - `readProjectTags(repoRoot): Map<string, string[]>` — every `moon.yml` under `apps/*` and `packages/**` (skipping
    `node_modules`), keyed by its directory relative to the root, value the `app-*` entries of its `tags:` list (parsed
    line by line: a `tags:` key, then `- 'x'` / `- x` items until the next un-indented key).
  - `appsForFile(file, projects): Set<ChangelogAppId | '*'>` — the longest project-dir prefix of `file` wins;
    `app-all` → `'*'`; `app-<id>` → `<id>` after mapping retired ids through a literal copy of
    `RETIRED_SUITE_APP_HOSTS` (`coder`/`creator` → `agents`, `vault`/`cleaner`/`monitor` → `vanguard`, `capture` → `mind`);
    ids not in a literal copy of `CHANGELOG_APP_IDS` (`accountant`, `simulator`, `health`) are dropped. `apps/launcher/**`
    → `launcher`. A file under no project (root docs, `.github/`, `.midnite/`) → empty set.
  - `attribute(commits: { sha, subject, files: string[] }[], projects)` → `Record<ChangelogAppId, { sha, subject, suite: boolean }[]>`;
    a commit hitting `'*'` is listed under every id with `suite: true`; a commit is listed once per app however many of
    its files hit it. `studio` gets every commit that reaches any app (Studio is the superset) and is otherwise unchanged
    from today's curation.
  - CLI `node scripts/changelog-attribution.mjs --base <ref> [--head HEAD]`: shas from `git rev-list --no-merges --reverse
    <base>..<head>`, then per sha `git show -s --format=%s <sha>` and `git show -z --name-only --format= <sha>` (NUL-split,
    per the repo's git-parsing rule). Prints the JSON. `--base` missing → exit 1 with usage.
  - The two literal lists are pinned to shared by the test (`RETIRED_SUITE_APP_HOSTS` and `CHANGELOG_APP_IDS` read from
    source with a regex), the way `affected-apps.test.mjs` pins `PLACEMENT_APPS`.
- [ ] Net-new `scripts/changelog-attribution.test.mjs` with an in-memory `projects` map
  - `packages/modules/coder/main/x.ts` tagged `app-agents` → `agents`; tagged `app-coder` → `agents` (retired id);
    `packages/frame/src/a.tsx` tagged `app-all` → every id with `suite: true`; `README.md` → nothing;
    `apps/launcher/src/main/ipc.ts` → `launcher`; a nested project (`packages/features/media-core` inside `packages/features`)
    resolves to the deeper one.
- [ ] Release-prep skill drafts per-app sections — [`.claude/skills/midnite-release-prep/SKILL.md`](../../../.claude/skills/midnite-release-prep/SKILL.md)
  and its mirrors `.agents/skills/midnite-release-prep/SKILL.md`, `.codex/skills/midnite-release-prep/SKILL.md` (same edit in all three)
  - After "Draft the changelog": run `node scripts/changelog-attribution.mjs --base <base-tag>`; for each id in
    `CHANGELOG_APP_IDS` other than `studio`, move that file's `[Unreleased]` content into `## [X.Y.Z] - YYYY-MM-DD` and add
    curated lines for the user-facing commits the JSON lists under it (same Added/Changed/Fixed/Removed mapping and the
    same "curate, don't dump" rule as Studio's). `suite: true` commits go into an app only when the change is visible in
    that app.
  - **An app with nothing user-facing still gets a section**, holding exactly `### Changed` and
    `- Released in lockstep with the suite; no changes specific to Midnite <Name>.` — so every app's drop-up has notes for
    the running version instead of "No published notes".
  - Re-seed each file's empty `## [Unreleased]`. Commit the app files in the same `chore(release): prepare vX.Y.Z` commit.
  - The ephemeral-release path (no changelog edits) is unchanged.
- [ ] Release-complete skill — [`.claude/skills/midnite-release-complete/SKILL.md`](../../../.claude/skills/midnite-release-complete/SKILL.md) (+ `.agents/`, `.codex/` mirrors)
  - Its precondition list gains: `node scripts/changelog-sections-check.mjs X.Y.Z` prints no warning. Its §4 "what a
    release writes in the feed repo" list gains `midnite-<id>/CHANGELOG.md` for every app.
- [ ] Net-new `scripts/changelog-sections-check.mjs` `<version>`
  - Imports `extractChangelogSection` and `CHANGELOG_APP_IDS` from `packages/shared/dist/release.js` (like the mirror script).
  - For each id: no `## [<version>]` in `changelogSourcePath(id)` → print
    `::warning::<path> has no section for <version>; its in-app notes will be empty`. Always exits 0 — a missing
    section is the documented normal case for Studio today (`has_section=false`), so it warns, it does not block a release.
  - Run as a step in `release.yml`'s `publish-feed` job right after `Build shared`.
  - Verified by `scripts/changelog-sections-check.test.mjs` over a temp dir: two fixture files, one with the section, one
    without → exactly one warning line naming the second path.

### C — The feed publishes every app's changelog (M)

- [ ] `mirrorMissingSections` in [`publish-feed-changelog.mjs`](../../../scripts/publish-feed-changelog.mjs)
  - `export function mirrorMissingSections(targetMarkdown, sourceMarkdown, releaseUrlFor, fallbackDate)` →
    `{ markdown: string, added: string[] }`. Takes every released section of the source
    (`extractLatestSections(source, 1000)`), skips each version the target already has (the same `^##\s+\[<v>\]` test
    `mirrorSection` uses), and inserts each missing one in descending order (`compareSemVer` from
    `packages/shared/dist/version.js`): directly before the first existing release heading whose version is lower, else
    at the end of the body — always after the whole `[Unreleased]` section. Heading date: the section's own `date`, else
    `fallbackDate`. Appends one `[<v>]: releaseUrlFor(v)` ref per added version to the trailing ref block.
  - `mirrorSection` stays (Studio's single-version path keeps its behaviour and its tests).
  - `export function changelogSkeleton(title)` → `` `# Changelog — ${title}\n\n## [Unreleased]\n` `` — what a missing
    target starts as, because `mirrorSection`'s "no `[Unreleased]` heading" throw must not fire on an app's first release.
- [ ] Every-app CLI mode: `publish-feed-changelog.mjs --all <version> <feed-root> <release-date>`
  - For each `CHANGELOG_APP_IDS` id **except `studio`** (Studio's mirror stays in `publish-feed`, whose ordering is
    load-bearing for the updater feed): read `changelogSourcePath(id)`; read `<feed-root>/<changelogFeedDir(id)>/CHANGELOG.md`
    or start from `changelogSkeleton('Midnite <Name>')` (`mkdir -p` the folder); write `mirrorMissingSections(…,
    (v) => appReleasePageUrl(id, v), releaseDate)`. Print `mirrored <id>: <added versions | nothing new>`.
  - The display name comes from a literal `CHANGELOG_TITLES` map in the script, pinned to the files' own `# Changelog — …`
    first lines by `changelog-files.test.mjs`.
  - The positional single-version mode is unchanged, so `publish-feed`'s step needs no edit.
- [ ] `release.yml` `publish-suite` job mirrors and commits the files
  - Copy `publish-feed`'s `GitHub Packages auth`, `pnpm/action-setup`, `setup-node`, `Install` and `Build shared` steps in
    (the script imports the built shared); all ubuntu, no macOS job added.
  - New step after the midnite-apps checkout (or the dry-run stand-in): `node scripts/publish-feed-changelog.mjs --all
    "${{ needs.meta.outputs.version }}" midnite-apps "$(date -u +%Y-%m-%d)"`.
  - The commit step's `git add` gains `midnite-*/CHANGELOG.md`; its commit message becomes `chore(midnite-launcher):
    publish catalog.json + feed + installer + changelogs for <tag>`. The dry-run upload includes the same paths.
  - The comment block above `publish-suite` and [`docs/RELEASING.md`](../../../docs/RELEASING.md)'s "What a tag build
    publishes beyond Studio" table each gain a `midnite-<id>/CHANGELOG.md` row.
- [ ] Tests in `publish-feed-changelog.test.mjs`
  - Empty skeleton target + a source with 0.0.7 and 0.0.6 → both inserted, 0.0.7 first, both refs appended, `added` is
    `['0.0.7', '0.0.6']`.
  - Target already holding 0.0.6 → only 0.0.7 added, inserted above 0.0.6; a second run returns the input unchanged and
    `added: []` (idempotent).
  - A section with no date in the source takes `fallbackDate`; an `[Unreleased]` blurb in the target stays above the
    inserted section.
  - `--all` over a temp feed root with no `midnite-money/` folder creates it with the skeleton plus the sections.

### D — Launcher: What's new for every app, and its own (M)

- [ ] Contract in [`common/bridge.ts`](../../../apps/launcher/src/common/bridge.ts)
  - `LAUNCHER_CHANNELS.changelogLatest` now takes `{ app: ChangelogAppId }`; net-new `changelogOpen: 'launcher:changelog:open'`
    (same payload). `ChangelogAppId` and `CHANGELOG_APP_IDS` come from `@midnite/studio-shared/release` (per file — the
    launcher's off-graph rule).
  - `LauncherBridge.changelog` becomes `{ latest(app: ChangelogAppId): Promise<ChangelogResult>; openFull(app:
    ChangelogAppId): Promise<LauncherResult> }`. `'changelog'` leaves `EXTERNAL_LINKS` (no caller remains) and its
    `linkOpen` case goes.
  - `ChangelogResult` gains nothing: "not published yet" is `{ sections: [], error: null }`.
- [ ] Per-app fetch and cache in [`main/changelog.ts`](../../../apps/launcher/src/main/changelog.ts)
  - `fetchChangelog(app: ChangelogAppId, fetchImpl = fetch, now = Date.now)` fetching `changelogRawUrl(app)`; the module
    cache becomes `Map<ChangelogAppId, { at: number; result: ChangelogResult }>`; TTL (10 min), timeout (8 s) and
    `CHANGELOG_KEEP` (3) unchanged; `resetChangelogCache()` clears the map.
  - HTTP 404 → `{ sections: [], error: null }` (an app whose first release has not published yet), not cached. Any other
    non-ok keeps `The changelog answered <status>.`; a throw keeps `Could not reach the changelog — offline?`. Only a
    non-empty result is cached, as today.
  - Raw `fetch` stays — `apps/launcher/src/main` is already an `UNMIGRATED` entry in `egress-registry.test.ts`, and the
    host is registered.
- [ ] IPC in [`main/ipc.ts`](../../../apps/launcher/src/main/ipc.ts) and [`preload/index.ts`](../../../apps/launcher/src/preload/index.ts)
  - `ChangelogRequestSchema = z.object({ app: z.enum(CHANGELOG_APP_IDS) })`; `changelogLatest` → `safeParse`, invalid →
    `{ sections: [], error: 'Unknown app.' }`, valid → `fetchChangelog(app)`. `changelogOpen` → invalid →
    `failure('Unknown app.')`, valid → `shell.openExternal(changelogPageUrl(app))`, `{ ok: true }`.
  - Preload: `latest: (app) => ipcRenderer.invoke(LAUNCHER_CHANNELS.changelogLatest, { app })`, `openFull` likewise.
- [ ] Renderer hook and list in [`components/changelog.tsx`](../../../apps/launcher/src/renderer/components/changelog.tsx)
  - `useChangelog(app: ChangelogAppId | null)` — `null` fetches nothing; a changed `app` resets to `null` (loading) and
    refetches, dropping a late answer for the previous app (the existing `live` flag, keyed per effect run).
  - `ChangelogList` copy: loading stays as is; `{ sections: [], error: null }` renders `No release notes published yet.`;
    an error renders as today. "View full changelog ↗" stays in all three states.
- [ ] Detail sheet: What's new for every released app — [`components/app-detail.tsx`](../../../apps/launcher/src/renderer/components/app-detail.tsx)
  - `useChangelog(view.state === 'coming-soon' ? null : app.id)`; the `What’s new` section renders under the same
    condition (was `app.id === 'studio'`), `onFull={() => void getBridge().changelog.openFull(app.id)}`.
  - A coming-soon tile (Health) shows no section and makes no request.
- [ ] Release notes dialog follows its app — [`app.tsx`](../../../apps/launcher/src/renderer/app.tsx)
  - `notesOpen: boolean` becomes `notesFor: ChangelogAppId | null`; `useChangelog(notesFor)`; the title is
    `What’s new in <name>` where `<name>` is `Midnite Studio` for `studio`, `Midnite Apps` for `launcher`, and
    `Midnite ${appById(id).name}` otherwise.
  - Callers: the per-app menu item `notes` → `setNotesFor(app.id)`; the Studio update banner's "What’s new ↗" →
    `setNotesFor('studio')`; the launcher update banner gains the same `What’s new ↗` link button → `setNotesFor('launcher')`;
    the footer's `v{bridge.launcherVersion}` span becomes a `button.link` (`title="Midnite Apps release notes"`) →
    `setNotesFor('launcher')`.
  - Escape and backdrop close set `notesFor` to `null`.
- [ ] [`mock-bridge.ts`](../../../apps/launcher/src/renderer/mock-bridge.ts): `changelog.latest(app)` answers one fixture
  section whose body names the app (`- ${app} fixture`), `'health'` is never asked; `openFull` resolves `{ ok: true }`.
- [ ] Tests
  - `main/changelog.test.ts`: `fetchChangelog('money')` requests `…/midnite-money/CHANGELOG.md`; a cached Studio answer
    does not satisfy a Money call (two fetches); a 404 answers `{ sections: [], error: null }` and a second call fetches
    again.
  - `renderer/changelog.test.tsx`: the empty copy for `{ sections: [], error: null }`.
  - `renderer/app.test.tsx`: picking `Release notes` on the Agents menu shows the heading `What’s new in Midnite Agents`
    and the mock saw `latest('agents')`; clicking the footer version shows `What’s new in Midnite Apps`.
  - A net-new `main/ipc` case (or `links.test.ts` extension): `changelogLatest` with `{ app: 'nope' }` answers
    `Unknown app.` without fetching.

### E — A version pill and drop-up in every suite app (L)

- [ ] Shared contract
  - [`channels.ts`](../../../packages/shared/src/ipc/channels.ts): `CHANNELS.suiteReleaseNotes = 'mstudio:suite:release-notes'`.
  - [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts): `SuiteReleaseNotesRequest = z.object({ latest:
    z.number().int().min(1).max(10).optional() })`; the response is the existing `ReleaseNotesResponse`. No app or
    version on the wire — main answers for itself, so a renderer cannot ask for another app's notes.
  - [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts): optional `suiteReleaseNotes?: { get(req): Promise<ReleaseNotes> }`
    beside `suiteLink`.
  - [`egress.ts`](../../../packages/shared/src/egress.ts): the `raw.githubusercontent.com` entry's `sends` becomes
    `'GET only: the Studio update feed and each app’s public changelog, no identifiers'`. No second entry —
    `findEgressEntry` returns the first exact host match, so a second one would never be found.
- [ ] Runtime main half
  - Net-new `packages/runtime/src/app-main/release-notes.ts`: `fetchAppReleaseNotes(options: { app: ChangelogAppId;
    version: string; latest?: number; fetch: GuardedFetch }): Promise<ReleaseNotes>` — `fetch('launcher',
    changelogRawUrl(app), { cache: 'no-store', signal: AbortSignal.timeout(8_000) })`, then the same envelope as
    Studio's [`release-notes-handlers.ts`](../../../packages/desktop/src/main/ipc/release-notes-handlers.ts):
    `notes: extractChangelogSection(text, version)`, `sections: extractLatestSections(text, latest)` when asked; 404 →
    `{ version, notes: null, error: null }`; other non-ok → `changelog: HTTP <n>`; `EgressBlockedError` →
    `error: 'Release notes are turned off.'`; any other throw → `err.message`.
  - [`suite-main.ts`](../../../packages/runtime/src/app-main/suite-main.ts): `SuiteMainOptions` gains
    `app: Exclude<ChangelogAppId, 'studio' | 'launcher'>`, `appVersion: string`, `fetch?: GuardedFetch` (default
    `createGuardedFetch()` — no settings mirror, so the `launcher-updates` default (on) applies until suite apps get a
    Privacy page). Registers `CHANNELS.suiteReleaseNotes`: invalid payload → `{ version: appVersion, notes: null,
    error: 'invalid request' }`; valid → `fetchAppReleaseNotes(...)`. Never throws.
  - [`suite-window.ts`](../../../packages/runtime/src/app-main/suite-window.ts): `suiteWindowOptions(platform, appVersion?: string)`
    appends `` `${APP_VERSION_ARG}${appVersion}` `` to both branches' `additionalArguments` when given.
  - [`suite-preload.ts`](../../../packages/runtime/src/app-main/suite-preload.ts): `createSuiteBridge` also returns
    `appVersion` (parsed from `argv` exactly as [`desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts)
    does, `'0.0.0'` when absent) and `suiteReleaseNotes: { get: (req) => call(CHANNELS.suiteReleaseNotes, req) }`; the
    return type's `Pick` gains `'appVersion'` and `'suiteReleaseNotes'`.
- [ ] Every suite app's main passes its id and version — `apps/{agents,browser,gamer,media,mind,money,science,startup,vanguard}/main/index.ts`
  - `registerSuiteMain({ …, app: '<id>', appVersion: app.getVersion() })` and `suiteWindowOptions(process.platform,
    app.getVersion())`. Preloads need no edit: they already spread `createSuiteBridge(...)`.
- [ ] Frame: presentational `ReleaseNotesPanel` — net-new `packages/frame/src/shell/version/release-notes-panel.tsx`
  - Props: `{ appName: string; version: string; data: ReleaseNotes | undefined; isLoading: boolean; headerAction?:
    ReactNode; links: ReactNode; markdownComponents?: Components; earlierCount?: number /* 3 */ }`.
  - Body is Studio's current markup moved as is: header `What's new in v{version}`, loading line, notes via
    `react-markdown` + `remark-gfm` with `MARKDOWN_PROSE_CLASSES` from [`layout/markdown-prose.ts`](../../../packages/frame/src/layout/markdown-prose.ts),
    the `Earlier releases` `<details>` list (`data-testid="earlier-releases"`), then the `links` slot.
  - Empty copy: `error` set → `Release notes are unavailable right now.`; `notes: null` without error →
    `No published notes for this build yet.` (Studio's strings, unchanged).
  - `appName` names the panel for assistive tech: the root is `` <div role="region" aria-label={`${appName} release notes`}> ``.
  - Default `markdownComponents.a` renders `<a href target="_blank" rel="noreferrer">`; `guardAppWindow` already hands
    every http(s) navigation to `openExternal`, so suite apps need no open-link bridge.
  - [`packages/frame/package.json`](../../../packages/frame/package.json) gains `react-markdown ^10.1.0` and
    `remark-gfm ^4.0.1` (the versions `packages/app` uses). The panel is only reached through a `lazy()` import, so no
    app's entry chunk grows.
- [ ] Frame: `SuiteVersionPill` in AppShell's rail footer — net-new `packages/frame/src/shell/version/suite-version-pill.tsx`
  - Reads `bridge()?.appVersion`; renders nothing when it is absent or `'0.0.0'`, or when `bridge()?.suiteReleaseNotes`
    is absent (Studio's rail never mounts it anyway).
  - `KitPopover` with `side="top"`, `align={expanded ? 'start' : 'center'}`, `` label={`${name} v${version} — release notes`} ``,
    `testId="suite-version-pill"`, `panelClassName="w-[22rem]"` and Studio's pill `triggerClassName` verbatim.
  - Data through net-new `useSuiteReleaseNotes(version)` in the same folder: a `useEffect` that calls
    `suiteReleaseNotes.get({ latest: 4 })` once per mount of the panel (the popover mounts its panel only while open)
    — not react-query, because the rail sits above any module's `QueryClientProvider`.
  - Links slot: `Full changelog` (`changelogPageUrl(app)`) and `Release page` (`appReleasePageUrl(app, version)` when
    notes arrived, else `RELEASE_LIST_URL`), as plain anchors; no Present and no Report rows (both are Studio features
    the frame cannot import).
  - [`app-shell.tsx`](../../../packages/frame/src/shell/app-shell.tsx): the nav-built rail `footer` renders, after the
    Settings button, a strip `<div className="flex h-6 items-center border-t border-border …">` holding
    `<SuiteVersionPill app={app} name={name} expanded={expanded} />` (`justify-start px-2` expanded, `justify-center px-1`
    collapsed — `RailVersion`'s classes).
- [ ] Studio's panel becomes a wrapper — [`version-notes-panel.tsx`](../../../packages/app/src/features/version/version-notes-panel.tsx)
  - `VersionNotesPanel` keeps its `useReleaseNotes`, the slides `setActiveMarkdown` effect and `ReportIssueDialog`, and
    renders `<ReleaseNotesPanel appName="Midnite Studio" … headerAction={<PresentButton …/>} links={…three PanelLink
    rows…} markdownComponents={{ a: ExternalLink }} />`. `version-notes-panel.test.tsx` and `version-pill.test.tsx` pass
    unchanged — that is the acceptance check for the move.
- [ ] Tests
  - `runtime/src/app-main/release-notes.test.ts`: fixture changelog → `notes` for the version and 3 `sections` when
    `latest: 4`; 404 → `error: null, notes: null`; an injected fetch throwing `EgressBlockedError` → the "turned off" copy;
    the URL asked for is `…/midnite-money/CHANGELOG.md` for `app: 'money'`.
  - `suite-main.test.ts`: the channel is registered once; `{ latest: 99 }` answers `invalid request` without fetching.
  - `suite-window.test.ts` / `suite-preload` test: the version argument round-trips to `appVersion`; absent → `'0.0.0'`.
  - `frame/src/shell/version/suite-version-pill.test.tsx` (jsdom, `suiteShellTestBridge` extended with
    `appVersion: '0.0.7'` and a `suiteReleaseNotes` stub): the pill reads `v0.0.7`; clicking it shows the notes and
    `Earlier releases`; `appVersion: '0.0.0'` renders no pill; a stub answering `{ notes: null, error: null }` shows
    `No published notes for this build yet.`.
  - `suite-app-shell.test.tsx`: the rail footer holds `suite-version-pill` after the Settings row.

### F — Verification and the first release (S)

- [ ] Shots for the PRs (not visual baselines — the e2e budget stays as is): the launcher's Money detail sheet with its
  What's new section, and a suite app's open drop-up, via the `*-shots.spec.ts` helpers with `reposOpen: false`; the
  suite-app shot rides `packages/app/e2e/suite-shell/` (it serves Vanguard's and Agents' Vite servers already).
- [ ] Dry-run release (`release.yml` `workflow_dispatch` dry run) uploads a `publish-suite` preview holding
  `midnite-<id>/CHANGELOG.md` for the launcher and all nine apps, each with `## [Unreleased]` above the dry-run version's section.
- [ ] **Open, for a human:** on the first real tag after C merges — the feed repo has the ten new files; the launcher's
  Agents sheet and Release notes dialog show Agents' notes; Midnite Money's rail pill opens its own notes; Studio's drop-up
  is unchanged.

## Files this phase touches

| File | Theme | Change |
|------|-------|--------|
| [`packages/shared/src/release.ts`](../../../packages/shared/src/release.ts) | A | edited — `CHANGELOG_APP_IDS`, path/URL helpers |
| [`packages/shared/src/release.test.ts`](../../../packages/shared/src/release.test.ts) | A | edited |
| `apps/{launcher,agents,browser,gamer,media,mind,money,science,startup,vanguard}/CHANGELOG.md` | A | **net-new** (10) |
| `scripts/changelog-files.test.mjs` | A | **net-new** |
| [`CHANGELOG.md`](../../../CHANGELOG.md) | A | **unchanged** — stays Studio's source |
| `scripts/changelog-attribution.mjs` + `.test.mjs` | B | **net-new** |
| `scripts/changelog-sections-check.mjs` + `.test.mjs` | B | **net-new** |
| [`scripts/affected-apps.mjs`](../../../scripts/affected-apps.mjs) | B | **unchanged** — the tag convention it documents is what B reads |
| `.claude/` · `.agents/` · `.codex/` `skills/midnite-release-prep/SKILL.md` | B | edited (same edit ×3) |
| `.claude/` · `.agents/` · `.codex/` `skills/midnite-release-complete/SKILL.md` | B | edited (same edit ×3) |
| [`scripts/publish-feed-changelog.mjs`](../../../scripts/publish-feed-changelog.mjs) + `.test.mjs` | C | edited |
| [`.github/workflows/release.yml`](../../../.github/workflows/release.yml) | B, C | edited — sections check in `publish-feed`; install, build and `--all` mirror in `publish-suite` |
| [`docs/RELEASING.md`](../../../docs/RELEASING.md) | C | edited — one table row |
| [`scripts/build-catalog.mjs`](../../../scripts/build-catalog.mjs) · [`common/catalog-feed.ts`](../../../apps/launcher/src/common/catalog-feed.ts) | C | **unchanged** — no notes in `catalog.json` |
| [`apps/launcher/src/common/bridge.ts`](../../../apps/launcher/src/common/bridge.ts) | D | edited |
| [`apps/launcher/src/main/changelog.ts`](../../../apps/launcher/src/main/changelog.ts) + `.test.ts` | D | edited |
| [`apps/launcher/src/main/ipc.ts`](../../../apps/launcher/src/main/ipc.ts) · [`preload/index.ts`](../../../apps/launcher/src/preload/index.ts) | D | edited |
| [`apps/launcher/src/renderer/components/changelog.tsx`](../../../apps/launcher/src/renderer/components/changelog.tsx) · [`app-detail.tsx`](../../../apps/launcher/src/renderer/components/app-detail.tsx) · [`app.tsx`](../../../apps/launcher/src/renderer/app.tsx) · [`mock-bridge.ts`](../../../apps/launcher/src/renderer/mock-bridge.ts) | D | edited |
| `apps/launcher/src/renderer/{changelog,app}.test.tsx` | D | edited |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) · [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) · [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | E | edited |
| [`packages/shared/src/egress.ts`](../../../packages/shared/src/egress.ts) | E | edited — one `sends` string |
| `packages/runtime/src/app-main/release-notes.ts` + `.test.ts` | E | **net-new** |
| [`packages/runtime/src/app-main/suite-main.ts`](../../../packages/runtime/src/app-main/suite-main.ts) · [`suite-window.ts`](../../../packages/runtime/src/app-main/suite-window.ts) · [`suite-preload.ts`](../../../packages/runtime/src/app-main/suite-preload.ts) | E | edited |
| `apps/{agents,browser,gamer,media,mind,money,science,startup,vanguard}/main/index.ts` | E | edited (two call sites each) |
| `packages/frame/src/shell/version/{release-notes-panel,suite-version-pill}.tsx`, `use-suite-release-notes.ts` + tests | E | **net-new** |
| [`packages/frame/src/shell/app-shell.tsx`](../../../packages/frame/src/shell/app-shell.tsx) · [`suite-app-shell.test.tsx`](../../../packages/frame/src/shell/suite-app-shell.test.tsx) · [`suite-shell-test-bridge.ts`](../../../packages/frame/src/shell/suite-shell-test-bridge.ts) | E | edited |
| [`packages/frame/package.json`](../../../packages/frame/package.json) · `pnpm-lock.yaml` | E | edited — `react-markdown`, `remark-gfm` |
| [`packages/frame/src/index.ts`](../../../packages/frame/src/index.ts) | E | edited — export `ReleaseNotesPanel` |
| [`packages/app/src/features/version/version-notes-panel.tsx`](../../../packages/app/src/features/version/version-notes-panel.tsx) | E | edited — wrapper |
| [`packages/app/src/features/version/version-pill.tsx`](../../../packages/app/src/features/version/version-pill.tsx) · [`release-notes.ts`](../../../packages/app/src/features/version/release-notes.ts) | E | **unchanged** |
| [`packages/desktop/src/main/ipc/release-notes-handlers.ts`](../../../packages/desktop/src/main/ipc/release-notes-handlers.ts) | E | **unchanged** — Studio keeps its own handler |
| [`.midnite/tasks/_INDEX.md`](../_INDEX.md) | — | this phase's row |

## Verification

- [ ] `moon run :typecheck :lint :test` green in CI (the local gate is not run on this machine; CI gates).
- [x] `release.test.ts`: the helper outputs and the two legacy constants (A).
- [x] `changelog-files.test.mjs`: id list equals the app directories; every file has one `[Unreleased]` and parseable headings (A).
- [ ] `changelog-attribution.test.mjs`: module, retired-id, `app-all`, unowned-file and nested-project cases (B).
- [ ] `changelog-sections-check.test.mjs`: one warning for the file without the section, exit 0 (B).
- [ ] `publish-feed-changelog.test.mjs`: ordering, idempotence, fallback date, skeleton creation (C).
- [ ] Launcher `changelog.test.ts`, `changelog.test.tsx`, `app.test.tsx`: per-app URL and cache, 404 as empty, dialog title per app (D).
- [ ] `release-notes.test.ts`, `suite-main.test.ts`, the window/preload version round-trip (E).
- [ ] `suite-version-pill.test.tsx`, `suite-app-shell.test.tsx`; Studio's `version-notes-panel.test.tsx` and `version-pill.test.tsx` unchanged and green (E).
- [ ] `egress-registry.test.ts` green with no new `UNMIGRATED` entry (E uses `guardedFetch`).
- [ ] Dry-run release preview carries the ten feed files (F).
- [ ] **Open, for a human:** the packaged pass on the first tag after C (F).

## Not in this phase

- **Notes inside `catalog.json`.** The catalog is distribution data and is validated lockstep as a whole; notes there would
  carry one version only and turn a typo into a rejected catalog.
- **Changelogs for modules** (Coder, Creator, Vault, Cleaner, Monitor, Capture, Accountant, Simulator). A user runs an app,
  not a module; module lines are written into each host that mounts it.
- **Moving Studio's changelog to `apps/studio/CHANGELOG.md`.** It would change `RELEASE_CHANGELOG_RAW_URL`'s source path,
  the release skills and the `publish-feed` step for no user-visible gain.
- **A website changelog page.** The site is gated and must never link to or name the feed repo.
- **A disk cache of notes.** Notes are read rarely and must refresh in the minutes after a release; offline shows the
  links, which is the whole value of the panel in that case.
- **Present and Report-a-bug rows in suite apps.** Both are Studio features (`feature-slides`, `feature-report`) the frame
  cannot import; a suite app's report entry already exists in its own report host.
- **A Privacy settings page for suite apps.** Until Phase 115 brings one, the suite fetch uses the `launcher-updates`
  default.
- **Back-filling 0.0.1–0.0.5 per app.** Those releases predate the app split, so there is nothing honest to attribute.

## Decisions / open questions

All resolved; the option picked in each case was the recommended one.

1. **Resolved — one `CHANGELOG.md` per app directory is the source of truth.** Agreed over tagged sections in the root
   file or notes generated from commit scopes, because each file then reads like the root one, release-prep curates it
   the same way, and the mirror and the parsers work on it unchanged; scopes are too inconsistent across the history to
   generate from.
2. **Resolved — Studio's changelog stays the root `CHANGELOG.md`.** Agreed, because moving it changes the published
   source path and three release touch points for nothing a user sees.
3. **Resolved — attribution reads the moon `app-<id>` tags, not commit scopes.** Agreed, because the tags are already
   maintained and tested for `affected-apps.mjs`, a module's tags name its hosts, and scopes say "feat(media)" for a
   change that ships in Agents too.
4. **Resolved — every app gets a section on every release, a one-line maintenance entry when nothing changed.** Agreed,
   because releases are lockstep and an app with no section for its running version would show "No published notes"
   in its own drop-up.
5. **Resolved — a missing section warns at release time instead of blocking it.** Agreed, because Studio already
   publishes with `has_section=false` as a documented normal case, and blocking a lockstep release over notes would hold
   back every bundle.
6. **Resolved — back-fill only 0.0.6, and only for apps that existed at 0.0.6 (Science and Startup start at `[Unreleased]`).** Agreed, because 0.0.6 is the first release after the app split (Phases 123 and
   124) and the earlier ones have no per-app meaning.
7. **Resolved — feed files live at `midnite-<id>/CHANGELOG.md`, beside `midnite-studio/` and `midnite-launcher/`.**
   Agreed, because it matches the feed repo's existing namespacing and the `midnite-<app>` issue slugs.
8. **Resolved — `publish-suite` mirrors every app except Studio; `publish-feed` keeps Studio's.** Agreed, because
   `publish-suite` runs after the launcher release that per-app link refs point at, and Studio's step ordering is
   load-bearing for its updater feed.
9. **Resolved — the mirror back-fills every missing released section, idempotently.** Agreed, because it makes the
   first run publish the 0.0.6 back-fill with no one-off script, and a re-run changes nothing.
10. **Resolved — non-Studio release links point at the `midnite-launcher/vX.Y.Z` release.** Agreed, because that is
    where every bundle zip is attached; there is no per-app tag.
11. **Resolved — the launcher channel takes an app id with a per-app in-memory cache; 404 means "not published yet".**
    Agreed, because one channel serves eleven apps, and a 404 before an app's first mirrored release is expected, not an
    error.
12. **Resolved — the launcher's own notes open from its footer version and its update banner.** Agreed, because those are
    the two places the launcher already names its version.
13. **Resolved — the suite channel carries no app id or version.** Agreed, because main knows both and a narrower request
    leaves nothing for a renderer to misuse.
14. **Resolved — suite apps reuse the existing `raw.githubusercontent.com` egress entry and its `launcher-updates` switch.**
    Agreed, because the registry resolves the first exact host match, so a second entry would never be found; widening
    the `sends` text keeps the disclosure honest.
15. **Resolved — the pill lives in AppShell's nav-built rail footer.** Agreed, because that one spot reaches all nine
    suite apps with no per-app renderer change and leaves Studio's own rail alone.
16. **Resolved — the frame owns a presentational `ReleaseNotesPanel` and Studio's panel wraps it.** Agreed, because the
    frame cannot import Studio's slides or report features, so the shared part is the markup and the features plug in
    through `headerAction` and `links`.
17. **Resolved — the frame renders notes with `react-markdown`, behind a `lazy()` import.** Agreed over the launcher's
    plain-text block parser, because notes carry links and bold, Studio already renders them that way, and the lazy chunk
    keeps every entry chunk the same size.
18. **Resolved — the suite pill fetches with a plain effect hook, not react-query.** Agreed, because the rail sits above
    every module's `QueryClientProvider`, and one request per open needs no cache.
