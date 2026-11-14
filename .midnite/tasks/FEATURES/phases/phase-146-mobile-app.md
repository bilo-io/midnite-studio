# Phase 146 — Midnite Mobile

Planned 2026-11-14 with the user (`/midnite-plan`) · grounded against the tree as of `2d4626d71`.

Midnite has no phone surface today. This phase adds one: **`apps/mobile`**, an Expo + TypeScript React Native app on
**`@bilo-io/ui-native`** (the midnite design system's React Native companion, `midnite-ui/packages/ui-native`). It is a
pocket companion to Studio for the repo loop away from the desk. It shows a repo's **commit history**, its **Tasks**
(the same GitHub Projects board, list and dependency graph desktop shows), and its **Reviews** (read the PR, read the
diff, approve, request changes, comment). An **Agents** tab opens each agent provider's own webapp (Claude Code, Codex,
Gemini, Jules, Copilot agents) for remote control, in the system's in-app browser so Google SSO and passkeys just work.

The app talks to **GitHub directly** (device-flow OAuth, token in the device keychain) behind a `MobileDataSource`
seam, so pairing with a running desktop Studio can plug in later without touching a screen. Logic that desktop already
proved stays in one place: the pure Tasks derivations move into a new **`packages/tasks-core`** and the pure GitHub
GraphQL queries and parsers into **`packages/forge-github-core`**, both imported by desktop and mobile alike. Every
generic component the screens need is built **upstream first** in `@bilo-io/ui-native` and released as `0.5.0` before
the app consumes it.

> **Builds on.**
> - **`@bilo-io/ui-native` 0.4.0** (`~/Dev/midnite/midnite-ui/packages/ui-native`, repo `bilo-io/midnite-ui`): Accordion,
>   Brand, Button, Card, Field, Input, Slider, Switch, Tabs, Textarea, `ThemeProvider` / `useTheme()`; tokens inlined
>   from `@bilo-io/ui/tokens`; no native modules; vitest + react-native-web tests; showcase Mobile mode.
> - **Tasks** (`packages/features/tasks/renderer`, Phases 50 / 75): `board/board-derive.ts`, `board/resolve-group-field.ts`,
>   `graph/graph-layout.ts`, `graph/graph-filter.ts`, `graph/graph-blockers.ts`, `filter.ts`, `sort.ts`,
>   `status-stroke.ts`, `field-option-colors.ts`, `issue/issue-order.ts`.
> - **Forge GitHub adapter** (`packages/features/forge/main/github`): `gh-project.ts` (`parseProjectList`,
>   `parseFields`, `parseItemsPage`, `scopeErrorKind`), `gh-graphql.ts` (`reviewCommentCountsQuery`,
>   `parseReviewCommentCounts`, `parseReviewThreads`, `describeGraphqlFailure`), `gh-issue-links.ts`.
> - **The wire contract** (`packages/shared/src/domain/forge.ts`, `forge-project.ts`, `forge-graph.ts`, `commit.ts`):
>   `ForgePull*`, `ForgeReview*`, `ForgeIssue*`, `ForgeProject*`, `ForgeGraph*`, `Commit`, `DiffHunk`/`FileDiff`.
> - **The unified-diff parser** (`packages/git-engine/src/parsers/diff-parser.ts`: `parseUnifiedDiff`,
>   `parseMultiFileDiff`), which imports `shared` and nothing else.
> - **Desktop's quick-access menu** (Phase 58 Theme E, `features/loops/renderer/quick-access-menu.tsx`), which the FAB's
>   speed dial mirrors.
>
> **Scope guardrails.** github.com only (no GHE, GitLab, Bitbucket or Azure on mobile yet). No desktop pairing, only the
> seam for it. No embedded WebView sign-in. No push notifications, no EAS store submission, no lane graph, no drag and
> drop on the board. The app runs in **Expo Go**: no custom native modules and no config plugin that needs a dev build.
> `apps/mobile` imports only `@midnite/studio-shared`, `@midnite/tasks-core`, `@midnite/forge-github-core`, the one
> diff-parser subpath and `@bilo-io/ui-native`, enforced by eslint. Icons come from `@expo/vector-icons`' Lucide-equivalent
> `Feather` set (see Decision 7), never `react-icons` (it is DOM-only). Every test is a vitest test; mobile adds no CI job
> and no macOS job.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

Planned 2026-11-14. Eleven themes: the component library release (A), the app scaffold (B), two pure-core extractions
(C, D), the GitHub data source (E), the shell (F), then the four tabs' screens (G History, H Tasks, I Reviews, J Agents
and More) and the docs and guards (K).

**Theme A — `@bilo-io/ui-native` 0.5.0.** ◻ AppBar, BottomNav, Fab + SpeedDial, Sheet (left and bottom), ListRow,
Badge, Chip, Avatar, SegmentedControl, IconButton, EmptyState and Skeleton land in `midnite-ui`, each with a test and a
showcase Mobile entry, and are released to GitHub Packages.

**Theme B — The `apps/mobile` scaffold.** ◻ Expo + expo-router + strict TypeScript as a pnpm workspace member with moon
tasks, a Metro config that resolves the workspace, an eslint boundary block, and `ThemeProvider` at the root. It boots
in Expo Go on iOS and Android.

**Theme C — `packages/tasks-core`.** ◻ The pure Tasks derivations (board grouping, graph layout, filter, sort, status
stroke, field colours, issue order) move out of `features/tasks/renderer` into a React-free package. Desktop imports it
from there, and nothing on desktop changes behaviour.

**Theme D — `packages/forge-github-core`.** ◻ GitHub GraphQL query documents and their response parsers move out of the
forge main adapter into a pure package, joined by new history, pulls and issues queries written for mobile. `git-engine`
gains a `./diff` subpath export.

**Theme E — The GitHub data source.** ◻ Device-flow sign-in with a PAT fallback, the token in `expo-secure-store`, a
`MobileDataSource` interface with a `GitHubDataSource` implementation over `fetch`, and TanStack Query hooks every screen
reads through.

**Theme F — The shell.** ◻ A five-tab BottomNav (History, Tasks, Reviews, Agents, More), a title bar with the repo
switcher, account avatar and forge-panel toggle, a placeholder left forge drawer, and a quick-access FAB speed dial.

**Theme G — History.** ◻ A commit timeline for the selected repo and branch with infinite scroll, merge markers and a
branch picker, and a commit detail screen with per-file diffs.

**Theme H — Tasks.** ◻ A project picker and a Board / List / Graph switch. Board is paged columns with a "Move to…" sheet,
List is grouped and sorted, and Graph is an SVG dependency graph with pinch and pan. Plus issue detail with comments,
and New issue.

**Theme I — Reviews.** ◻ Requested / Mine / All PR lists, then PR detail with checks, a mobile unified diff viewer,
review threads with replies, and Approve / Request changes / Comment.

**Theme J — Agents and More.** ◻ A provider registry opened in SFSafariViewController / Chrome Custom Tabs, with a
last-used provider and a sign-in hint. More holds accounts, theme and about.

**Theme K — Docs and guards.** ◻ `docs/MOBILE.md`, the boundary paragraph in `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`,
the layer-boundaries test cases, and the mobile tests folded into `root:test-node`.

## Build order

1. **A** first, in `midnite-ui`. F to J consume its release. B, C and D can start alongside it.
2. **B**, then **C** and **D** in parallel (C and D touch disjoint files).
3. **E** needs B and D.
4. **F** needs A 0.5.0 published, B and E.
5. **G, H, I, J** in parallel once F lands (H needs C as well).
6. **K** last, though its boundary test cases land with B.

## Deliverables

### A — `@bilo-io/ui-native` 0.5.0 (XL) · repo `bilo-io/midnite-ui`

Every component goes in `packages/ui-native/src/components/<kebab>.tsx` with a sibling `<kebab>.test.tsx` (vitest +
react-native-web, as the existing ones are). Each is styled only through `useTheme()` (`colors`, `alpha`, `radius`),
takes an optional `style` and `testID`, sets `accessibilityRole` / `accessibilityLabel` through `lib/a11y.ts`, and is
exported from `src/index.ts`. Icons are passed in as `ReactNode` props: the library takes no icon dependency.

- [ ] **A1 · `AppBar`** (S): `{ title: ReactNode; subtitle?: string; leading?: ReactNode; trailing?: ReactNode; onTitlePress?: () => void }`.
  Pads the top inset through an optional `insetTop: number` prop (the library takes no safe-area dependency). The
  title is pressable when `onTitlePress` is set (`accessibilityRole="button"`). Test: renders title and subtitle, and
  fires `onTitlePress`.
- [ ] **A2 · `BottomNav`** (M): `{ items: { key: string; label: string; icon: ReactNode; badge?: number | boolean }[];
  activeKey: string; onChange: (key: string) => void; insetBottom?: number }`. Equal-width items, the active one in
  `colors.primary`, `accessibilityRole="tablist"` on the bar and `"tab"` plus `accessibilityState.selected` per item.
  A numeric badge over 99 renders `99+`. It must be usable as an expo-router `tabBar` with no adapter beyond mapping
  props. Test: the active state, `onChange`, and badge clamping.
- [ ] **A3 · `Fab`** (S): `{ icon: ReactNode; label: string; onPress: () => void; position?: 'bottom-right' | 'bottom-left'; offsetBottom?: number }`.
  56 dp, absolutely positioned, an elevation/shadow token, `label` as `accessibilityLabel`. Test: press and label.
- [ ] **A4 · `SpeedDial`** (M): `{ open: boolean; onOpenChange: (o: boolean) => void; actions: { key: string; label: string; icon: ReactNode; onPress: () => void; disabled?: boolean }[]; icon: ReactNode; openIcon?: ReactNode }`.
  It wraps `Fab`. When open, a scrim (`alpha(colors.background, 0.6)`) appears and the actions stack upward with
  labels to their left. Tapping the scrim or an action closes it. The animation uses React Native `Animated` (no
  reanimated). Test: open and close, an action fires and closes, a disabled action is inert.
- [ ] **A5 · `Sheet`** (L): `{ open: boolean; onOpenChange: (o: boolean) => void; side: 'left' | 'bottom'; title?: string; children: ReactNode; widthFraction?: number /* left, default 0.86 */; snapPoints?: number[] /* bottom, fractions, default [0.5, 0.9] */ }`.
  Built on React Native `Modal` (transparent) + `Animated` + `PanResponder`: swipe left to close a left sheet, drag
  down to close a bottom sheet. Hardware back on Android closes it (`onRequestClose`). Test: open renders children,
  scrim press closes, and `onRequestClose` closes.
- [ ] **A6 · `ListRow`** (S): `{ title: string; subtitle?: string; leading?: ReactNode; trailing?: ReactNode; meta?: string; onPress?: () => void; onLongPress?: () => void; numberOfLines?: number }`.
  A 56 dp minimum height (72 dp with a subtitle) and a hairline divider token. Test: press and long-press.
- [ ] **A7 · `Badge` and `Chip`** (S): `Badge { tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger'; children }`.
  `Chip { label: string; color?: string /* hex, e.g. a project field option colour */; selected?: boolean; onPress?: () => void; leading?: ReactNode }`.
  `Chip` picks a readable text colour against `color` (WCAG contrast ≥ 4.5 against the chip background). Test: tones,
  and contrast on a light and a dark colour.
- [ ] **A8 · `Avatar`** (XS): `{ uri?: string; name: string; size?: 24 | 32 | 40 }`. Falls back to initials on a
  `colors.muted` disc when `uri` is missing or fails to load (`onError`). Test: initials fallback.
- [ ] **A9 · `SegmentedControl`** (S): `{ segments: { key: string; label: string; icon?: ReactNode }[]; value: string; onChange: (k: string) => void }`.
  `accessibilityRole="tablist"`. Test: change and selected state.
- [ ] **A10 · `IconButton`** (XS): `{ icon: ReactNode; label: string; onPress: () => void; variant?: 'ghost' | 'filled'; size?: 32 | 40 }`.
  A 44 dp minimum hit slop. Test: press and label.
- [ ] **A11 · `EmptyState` and `Skeleton`** (S): `EmptyState { icon?: ReactNode; title: string; body?: string; action?: { label: string; onPress: () => void } }`.
  `Skeleton { width: number | `${number}%`; height: number; radius?: number }` with a looped `Animated` opacity pulse
  (disabled when `AccessibilityInfo.isReduceMotionEnabled()` resolves true). Test: action fires, and reduce-motion
  leaves a static block.
- [ ] **A12 · Showcase entries** (M): each of A1 to A11 gets a demo in the showcase's Mobile mode
  (`packages/showcase`, alongside the existing ui-native demos), including a composed "app frame" demo: AppBar + list +
  BottomNav + SpeedDial + left Sheet.
- [ ] **A13 · Boundary and release** (S): `src/boundary.test.ts` still passes (the dist imports only `react`,
  `react/jsx-runtime` and `react-native`). Bump `packages/ui-native/package.json` to `0.5.0`, add a README section
  listing the new components, and publish to GitHub Packages through that repo's own release flow. Record the
  published version in this doc's Decisions.

### B — The `apps/mobile` scaffold (M)

- [ ] **B1 · Package** (S): `apps/mobile/package.json` with `"name": "@midnite/mobile"` and `"private": true`, created
  with `create-expo-app` (TypeScript + expo-router template), then trimmed. Pin the newest Expo SDK whose React Native
  and React satisfy `@bilo-io/ui-native`'s peers (`react` ^19, `react-native` >=0.79); record the SDK in Decisions.
  Dependencies: `expo`, `expo-router`, `expo-secure-store`, `expo-web-browser`, `expo-clipboard`, `expo-constants`,
  `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `react-native-gesture-handler`,
  `@expo/vector-icons`, `@tanstack/react-query`, `zod` (the workspace's version), `@bilo-io/ui-native@^0.5.0`, plus
  workspace deps `@midnite/studio-shared`, `@midnite/tasks-core`, `@midnite/forge-github-core` and
  `@midnite/studio-git-engine` (`./diff` subpath only). All are Expo Go-compatible; add nothing that is not.
- [ ] **B2 · App config** (XS): `apps/mobile/app.config.ts` with name "Midnite", slug `midnite-mobile`, scheme
  `midnite-mobile`, `userInterfaceStyle: 'automatic'`, iOS `bundleIdentifier` / Android `package`
  `io.bilo.midnite.mobile`, and the icon and splash taken from ui-native's `src/brand` PNGs (copied into
  `apps/mobile/assets/`). `extra.githubClientId` reads `process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID`.
- [ ] **B3 · Metro + pnpm** (M): `apps/mobile/metro.config.js` from `expo/metro-config`'s `getDefaultConfig`. Prove that
  `expo start` resolves `@midnite/studio-shared` (TS source via its `exports`) and the hoisted React under pnpm's
  isolated layout. If it does not, set `watchFolders: [workspaceRoot]` and
  `resolver.nodeModulesPaths: [app/node_modules, workspaceRoot/node_modules]`. **Never change the root `.npmrc`'s
  `node-linker`**: that would reshape every other package's install. Exactly one copy of `react` must reach the bundle
  (a dev-only check in `app/_layout.tsx` is not acceptable; verify with `npx expo export --dump-sourcemap` once and note
  the result in Decisions).
- [ ] **B4 · moon tasks** (S): `apps/mobile/moon.yml` with `start` (`expo start`), `typecheck` (`tsc --noEmit`), `lint`
  (eslint on `src/**` and `app/**`) and `test` (vitest). Add the package to the root `vitest.node-gate.config.ts`
  projects so `moon run root:test-node` covers it.
- [ ] **B5 · vitest + react-native-web** (S): `apps/mobile/vitest.config.ts` aliases `react-native` →
  `react-native-web` and stubs `expo-secure-store`, `expo-web-browser`, `expo-router` and `expo-clipboard` with
  `vi.mock` setup files in `apps/mobile/test/mocks/`, following ui-native's own vitest setup. jsdom environment.
- [ ] **B6 · Root layout** (S): `apps/mobile/app/_layout.tsx` wraps `GestureHandlerRootView` → `SafeAreaProvider` →
  `ThemeProvider` (ui-native; scheme from the More ▸ Theme pref, Theme J) → `QueryClientProvider` → `AuthGate`
  (Theme E) → `<Slot />`.
- [ ] **B7 · eslint boundary** (S): a `// --- Boundary: mobile (apps/mobile) ---` block in `eslint.config.mjs`, modelled
  on the launcher block. It denies `@midnite/studio-app*`, `@midnite/studio-desktop*`, `@midnite/studio-frame*`,
  `@midnite/studio-runtime*`, `@midnite/studio-knowledge*`, `@midnite/studio-db-engine*`, every `@midnite/feature-*`
  and `@midnite/module-*` and `@midnite/app-*`, `electron`, `node-pty`, `node:*`, `react-dom`, `react-icons*` and
  `lucide-react*`. It allows `@midnite/studio-git-engine/diff` and denies every other git-engine specifier with the
  message "Mobile takes only the pure diff parser from git-engine (`@midnite/studio-git-engine/diff`)." Add matching
  cases to `scripts/layer-boundaries.test.mjs`.
- [ ] **B8 · Boots** (XS): `moon run mobile:start` opens in Expo Go on an iOS simulator and an Android emulator and
  shows the themed empty shell. A screenshot of each goes in the PR thread (not committed).

### C — `packages/tasks-core` (M)

- [ ] **C1 · Package** (S): `packages/tasks-core` with `"name": "@midnite/tasks-core"`, `moon.yml`, `tsconfig.json`,
  `vitest.config.ts` and `src/index.ts`, depending on `@midnite/studio-shared` only. Add to
  `vitest.node-gate.config.ts`. eslint block: it may import `@midnite/studio-shared` and nothing else in the workspace,
  and no `react`, `react-dom` or `react-native`.
- [ ] **C2 · Move the pure files with `git mv`** (M), keeping their tests beside them: `resolve-group-field.ts`,
  `graph-layout.ts`, `graph-filter.ts`, `graph-blockers.ts`, `filter.ts`, `sort.ts`, `status-stroke.ts`,
  `field-option-colors.ts` and `issue-order.ts`, into `packages/tasks-core/src/{board,graph,issue}/` mirroring their
  current folders.
- [ ] **C3 · Cut the frame edges** (S): `graph-layout.ts` imports `Rect` and `Viewport` types from `@midnite/studio-frame`.
  Declare structurally identical `Rect` / `Viewport` types in `tasks-core/src/graph/geometry.ts` (they are plain
  object types, so frame values still satisfy them). `edge-appearance.ts` imports `CardGlowState` from the board, so it
  **stays** in `features/tasks`.
- [ ] **C4 · Split `board-derive.ts`** (M): it imports `sessionPhase` / `ConnectionState` from the frame and
  `BUILTIN_AGENTS`. Move the session-free grouping (columns from the resolved group field, item placement, ordering)
  to `tasks-core/src/board/board-columns.ts` as `deriveBoardColumns(items, fields, groupFieldId)`. Keep the
  session-aware decoration in `features/tasks/renderer/board/board-derive.ts`, now calling `deriveBoardColumns`.
  Existing `board-derive.test.ts` assertions keep passing unchanged; new `board-columns.test.ts` covers the pure part.
- [ ] **C5 · Re-point desktop** (S): every import of a moved file in `packages/features/tasks` (and any other importer
  found with `grep -rn` on each filename) now imports from `@midnite/tasks-core`. Add `@midnite/tasks-core` to
  `features/tasks/package.json`. No re-export shims are left behind in the old paths.
- [ ] **C6 · Layer rule** (XS): add `@midnite/tasks-core` to the "may import" list for features in `eslint.config.mjs`
  (it sits beside `shared` in the layer diagram) and a case to `scripts/layer-boundaries.test.mjs`. Update
  `docs/APPS.md`'s placement map with a "pure cores" row.

### D — `packages/forge-github-core` (L)

- [ ] **D1 · Package** (S): `packages/forge-github-core` with `"name": "@midnite/forge-github-core"`, depending on
  `@midnite/studio-shared` only, and with the same eslint and vitest wiring as C1.
- [ ] **D2 · Move the pure GraphQL pieces** (M): from `gh-project.ts` move the query documents used by `listProjects` /
  `projectFields` / `projectItems`, plus `parseProjectList`, `parseFields`, `parseItemsPage` and `scopeErrorKind`. From
  `gh-graphql.ts` move `reviewCommentCountsQuery`, `parseReviewCommentCounts`, `parseReviewThreads`,
  `describeGraphqlFailure`, and the threads query used by `pullThreads`. Put them in
  `forge-github-core/src/{projects,reviews,errors}.ts`. The `gh-shell` callers in forge main import them back.
  Fixture tests (`__fixtures__`, `gh-parse-fixtures.test.ts`, `gh-project.test.ts`) move or are re-pointed so every
  existing assertion still runs.
- [ ] **D3 · Transport-agnostic input** (S): every moved parser takes the parsed GraphQL `data` object (`unknown`,
  validated with zod inside), **not** a `gh` stdout string. The forge-main call sites do `JSON.parse(stdout)` first.
  Where a parser today takes a string, keep a thin `…FromStdout` wrapper in forge main only.
- [ ] **D4 · New queries for mobile** (L), each a `const …Query` document plus a `parse…(data): T` mapping onto existing
  shared schemas, each with a fixture test:
  - `historyQuery(owner, name, qualifiedRef, first, after)` → `parseHistory(data): { commits: Commit[]; endCursor: string | null; hasNextPage: boolean }`.
    `refs` is `[]`; `coAuthors` and `sessionTrailers` are parsed from the commit message trailers, with the same trailer
    rules `git-engine` uses (import nothing from it; copy the two regexes and note the source in a comment).
  - `pullsQuery(owner, name, scope: ForgePullScope, first, after)` → `parsePulls(data): ForgePull[]` (scope "review
    requested" via `search(query: "is:pr is:open review-requested:@me repo:o/n")`, "mine" via `author:@me`, "all" via
    `repository.pullRequests(states: OPEN)`).
  - `pullDetailQuery(owner, name, number)` → `parsePullDetail(data): ForgePullDetail` (checks rollup, review decision,
    reviewers, body, head and base refs).
  - `issuesQuery` / `issueDetailQuery` → `parseIssues` / `parseIssueDetail` onto `ForgeIssue` / `ForgeIssueDetail`.
  - `repoListQuery(first, after)` (viewer repos + `viewer.organizations.repositories`, sorted by `PUSHED_AT`) →
    `parseRepoList(data): { owner: string; name: string; defaultBranch: string; pushedAt: string; isPrivate: boolean }[]`.
  - `branchesQuery(owner, name, first, after)` → `parseBranches(data): string[]`.
- [ ] **D5 · Mutations** (M): `submitReviewMutation(pullId, event: ForgeReviewEvent, body)`,
  `addPullCommentMutation(subjectId, body)`, `replyToThreadMutation(threadId, body)`, `setProjectFieldMutation` (single
  select, matching desktop's `gh-project-write.ts` input shape), `createIssueMutation(repoId, title, body)` and
  `addCommentMutation(subjectId, body)`. Each is a document plus a `parse…Result(data)` returning `GitOpResult`-style
  `{ ok: true } | { ok: false; kind: 'error'; message: string }` using `describeGraphqlFailure` for `errors[]`.
- [ ] **D6 · `git-engine` `./diff` subpath** (S): add `"./diff": { "types": "./dist/parsers/diff-parser.d.ts", "default": "./dist/parsers/diff-parser.js" }`
  to `packages/git-engine/package.json` `exports` (and the matching source path for TS project references /
  `customConditions`, mirroring how `shared` exposes `./studio-link`). Assert in a test that `diff-parser.ts` still
  imports only `@midnite/studio-shared`.

### E — The GitHub data source (L)

- [ ] **E1 · `MobileDataSource` interface** (S): `apps/mobile/src/data/source.ts`. Every method returns
  `Promise<Result<T>>` where `Result<T> = { ok: true; value: T } | { ok: false; kind: 'auth' | 'scope' | 'network' | 'error'; message: string }`
  (never throws, matching the IPC envelope rule). Methods: `viewer()`, `listRepos(cursor?)`,
  `listBranches(repo, cursor?)`, `history(repo, ref, cursor?)`, `commit(repo, sha)` (→ `{ commit: Commit; files: FileDiff[] }`),
  `listProjects(repo)`, `projectFields(projectId)`, `projectItems(projectId, cursor?)`, `projectGraph(projectId)`
  (→ `ForgeGraph`), `setItemField(...)`, `issue(repo, n)`, `issueComments(repo, n)`, `createIssue(...)`,
  `commentIssue(...)`, `listPulls(repo, scope, cursor?)`, `pull(repo, n)`, `pullFiles(repo, n)` (→ `FileDiff[]`),
  `pullThreads(repo, n)`, `submitReview(...)`, `commentPull(...)` and `replyToThread(...)`. A comment on the interface
  states that a future `DesktopPairedDataSource` implements the same interface.
- [ ] **E2 · `GitHubDataSource`** (L): `apps/mobile/src/data/github-source.ts` implements E1 with `fetch` to
  `https://api.github.com/graphql` using Theme D's documents and parsers. REST is used only for file patches:
  `GET /repos/{o}/{r}/commits/{sha}` and `GET /repos/{o}/{r}/pulls/{n}/files?per_page=100` (paginated through the `Link`
  header), with each `patch` run through `parseUnifiedDiff` from `@midnite/studio-git-engine/diff`. A file with no
  `patch` (binary or too large) becomes a `FileDiff` with no hunks and a `tooLarge`/`binary` flag as desktop renders
  it. 401 → `kind: 'auth'`, a 403 scope message → `'scope'`, a `TypeError` from fetch → `'network'`. Unit tests use a
  stubbed `fetch` against Theme D's fixtures.
- [ ] **E3 · Device flow sign-in** (M): `apps/mobile/src/auth/device-flow.ts` does
  `POST https://github.com/login/device/code` (`client_id`, `scope=repo read:org read:project project`), shows
  `user_code` (with copy via `expo-clipboard`), opens `verification_uri` with `WebBrowser.openBrowserAsync`, and polls
  `POST https://github.com/login/oauth/access_token` honouring `interval`, `slow_down` (+5 s) and `expired_token`. It is
  a pure state machine (`idle → awaiting-user → polling → done | expired | denied | error`) with an injected `fetch`
  and clock, tested without timers flaking (use `vi.useFakeTimers`, no wall-clock assertions).
- [ ] **E4 · PAT fallback** (S): a "Use a personal access token" link on the sign-in screen opens a field. The token is
  validated with `viewer { login }` before saving, and the scopes it lacks (`X-OAuth-Scopes` header) are listed.
- [ ] **E5 · Token storage** (S): `apps/mobile/src/auth/token-store.ts` uses
  `SecureStore.setItemAsync('github:github.com:<login>', token, { keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY })`,
  keyed like desktop's `${provider}:${host}:${login}`. The active login is kept in a non-secret pref. Tokens are never
  logged, never in React Query keys, and never in error messages. A test greps the module's log calls.
- [ ] **E6 · `AuthGate` + query hooks** (M): `AuthGate` renders the sign-in screen until a token exists. A `kind: 'auth'`
  result from any call clears the token and returns to sign-in with "Your GitHub session ended — sign in again."
  `apps/mobile/src/data/queries.ts` holds one TanStack Query hook per source method (`useHistory`, `useProjectItems`,
  `usePulls`, …) with keys `[method, repoKey, ...args]` and `staleTime: 30_000`; list hooks use `useInfiniteQuery` on
  the cursor. Mutations invalidate the matching list and detail keys.
- [ ] **E7 · GitHub OAuth App** (XS, user action): register a GitHub OAuth App with Device Flow enabled. Its client ID is
  public and is set as `EXPO_PUBLIC_GITHUB_CLIENT_ID` in `apps/mobile/.env` (git-ignored) and documented in
  `docs/MOBILE.md`. There is no client secret anywhere.

### F — The shell (M)

- [ ] **F1 · Tabs** (S): `apps/mobile/app/(tabs)/_layout.tsx` uses expo-router `Tabs` with `tabBar={(p) => <MidniteTabBar {...p} />}`,
  which renders ui-native `BottomNav`. Tabs in order: `history` (Feather `git-commit`), `tasks` (`trello`), `reviews`
  (`git-pull-request`, badge = count of review-requested PRs), `agents` (`cpu`), `more` (`more-horizontal`). The bottom
  inset comes from `useSafeAreaInsets()`.
- [ ] **F2 · Title bar** (M): `apps/mobile/src/shell/title-bar.tsx` on ui-native `AppBar`. Leading: an `IconButton`
  (Feather `sidebar`) toggling the forge panel. Title: `owner/name` with the current branch as subtitle. Pressing it
  opens the repo switcher. Trailing: the viewer's `Avatar` (taps go to More ▸ Accounts). Shown on every tab; screens set
  a per-tab action slot through a `useTitleBarAction` context (e.g. the Tasks view switch on narrow screens).
- [ ] **F3 · Repo switcher** (S): a bottom `Sheet` listing `listRepos` (infinite, `ListRow` with a lock icon for private
  repos) plus a filter `Input`. Selecting sets the current repo (persisted pref `mobile.currentRepo`, branch reset to the
  repo's default branch). The last five repos are pinned at the top.
- [ ] **F4 · Forge panel placeholder** (S): a left `Sheet` (`apps/mobile/src/shell/forge-panel.tsx`) with the account
  header (Avatar + login), the current repo, and three disabled `ListRow`s, "Branches", "Remotes" and "Forge accounts",
  each with a "Coming soon" `Badge`. A comment notes it mirrors desktop's left repos panel and will grow in a later
  phase.
- [ ] **F5 · FAB speed dial** (S): ui-native `SpeedDial` mounted once in the tabs layout above the BottomNav
  (`offsetBottom` = bar height + inset). Actions: **New issue** (→ `/tasks/new-issue`), **Open agent** (→ opens the
  last-used provider, Theme J, or the Agents tab if none), **Switch repo** (→ the F3 sheet), and **Notes** (disabled,
  "Coming soon"), mirroring desktop's quick-access leaves. Hidden on full-screen detail routes.
- [ ] **F6 · Prefs store** (XS): `apps/mobile/src/state/prefs.ts`, a tiny zustand store persisted to `expo-secure-store`
  under one non-secret key `mobile.prefs` (current repo, branch per repo, theme, last provider, last tasks view per
  project). zod-validated on read; unknown keys are dropped.

### G — History (M)

- [ ] **G1 · Timeline** (M): `apps/mobile/app/(tabs)/history/index.tsx` is a `FlatList` over `useHistory` (infinite,
  `onEndReachedThreshold: 0.5`). Each row is a `CommitRow` (`apps/mobile/src/history/commit-row.tsx`): a left rail with
  a dot (hollow for merge commits, `parents.length > 1`) and a connecting line, subject (2 lines), author Avatar + name,
  relative time, and a short sha in a mono `Chip`. Day separators ("Today", "Yesterday", `Tue 11 Nov`) come from a pure,
  tested `groupByDay(commits, now)` helper.
- [ ] **G2 · Branch picker** (S): the title bar subtitle (branch) is pressable on History and opens a bottom `Sheet` over
  `useBranches` with a filter. Selecting stores the branch per repo (F6).
- [ ] **G3 · Commit detail** (M): `app/history/[sha].tsx` shows the full message, author and committer, parents (each
  tappable), then a file list (`ListRow`: path, `+a −d`). Tapping a file opens the shared diff viewer (I4) for that
  `FileDiff`.
- [ ] **G4 · States** (XS): `Skeleton` rows while loading, an `EmptyState` with "Pick a repository" + action when none
  is selected, and an inline retry row for `kind: 'network'`.

### H — Tasks (L)

- [ ] **H1 · Project picker + view switch** (S): `app/(tabs)/tasks/index.tsx`. A header `Chip` names the project (opens a
  sheet over `useProjects`). A `SegmentedControl` offers `board | list | graph`, persisted per project (F6). No projects
  → `EmptyState` ("This repo has no GitHub Projects", a link to the repo's Issues list as a plain list).
- [ ] **H2 · Board** (L): `apps/mobile/src/tasks/board-view.tsx` takes columns from `deriveBoardColumns` (tasks-core)
  over the group field resolved by `resolveGroupField`. It is a horizontal paged `FlatList` (`pagingEnabled`,
  `snapToInterval` = 88% of screen width so the next column peeks) with a column header (option colour `Chip` + count)
  and a vertical list of `TaskCard`s (`apps/mobile/src/tasks/task-card.tsx`: number, title, labels as `Chip`s, assignee
  Avatars, a left status stroke from `itemStatusStroke`). Long-press a card → bottom sheet "Move to…" listing the group
  field's options → `setItemField`, applied optimistically and rolled back on `{ ok: false }` with a toast-style banner.
  Column dots above the board show the position.
- [ ] **H3 · List** (M): `apps/mobile/src/tasks/list-view.tsx` is a `SectionList` grouped by the same group field,
  sorted with tasks-core `sort.ts`, and filtered with `filter.ts` through a search `Input` and filter chips (assignee:
  me, label). Rows use `ListRow` with the status stroke as `leading`.
- [ ] **H4 · Graph** (L): `apps/mobile/src/tasks/graph-view.tsx` uses tasks-core `layoutForgeGraph` +
  `filterForgeGraph` + `blockedItemIds` over `useProjectGraph`. Edges are drawn with `react-native-svg` `Path` (the same
  geometry desktop uses) and nodes are absolutely positioned `View`s (compact cards: number + title + status stroke)
  inside a container transformed by a pinch + pan gesture (`react-native-gesture-handler` `Gesture.Simultaneous(Pinch, Pan)`,
  scale clamped 0.3 to 2.5). Initial viewport from `topAlignedViewport`. Tapping a node opens issue detail. Off-screen
  nodes are culled with `rectsIntersect` against the viewport (port of desktop's margin rule; the pure helper lives in
  tasks-core if it is not there already).
- [ ] **H5 · Issue detail** (M): `app/tasks/issue/[number].tsx` shows title, state `Badge`, labels, assignees, the
  project field values as `Chip`s (tap one → change it in a sheet), the body rendered as plain text with links tappable
  (no markdown renderer this phase), the comment list, and a composer (`Textarea` + Send) → `commentIssue`. Close/Reopen
  in the title bar action slot.
- [ ] **H6 · New issue** (S): `app/tasks/new-issue.tsx`, a modal route with title (required) and body, creating in the
  current repo. If a project is selected, it is added to that project (`addProjectItem`). On success it navigates to the
  new issue's detail.

### I — Reviews (L)

- [ ] **I1 · PR lists** (M): `app/(tabs)/reviews/index.tsx` with a `SegmentedControl` `requested | mine | all` (default
  `requested`) over `usePulls` (infinite). `PullRow`: number + title, author Avatar, draft `Badge`, checks summary
  (✓ / ✗ / ● from `ForgeChecksRollup`), review decision `Badge`, `+a −d`, relative updated time. Pull to refresh.
- [ ] **I2 · PR detail** (M): `app/reviews/[number].tsx`. The header has title, `head → base`, author and state. Then
  three tabs (ui-native `Tabs`): **Overview** (body as plain text, reviewers with their state, checks list with name +
  conclusion, tapping one opens its `detailsUrl` in the in-app browser), **Files** (file list → I4 viewer) and
  **Conversation** (I3).
- [ ] **I3 · Threads and comments** (M): Conversation lists PR comments and review threads in time order. A thread shows
  `path:line`, a 6-line hunk excerpt rendered by I4 in compact mode, its comments, and a reply composer →
  `replyToThread`. Resolved threads are collapsed under "N resolved". A general comment composer at the bottom →
  `commentPull`.
- [ ] **I4 · Diff viewer** (L): `apps/mobile/src/diff/diff-view.tsx` renders one `FileDiff` as a unified diff:
  monospace, hunk headers as sticky section headers, a two-number gutter (old/new), added/removed backgrounds from the
  theme's success/danger at `alpha(…, 0.15)`, intraline ranges (`IntralineRange`) emphasised, long lines **wrapped**
  (a "No wrap" toggle switches to horizontal scroll), and a `FlatList` per line for large files (>2,000 lines show a
  "Load full diff" gate). Binary and too-large files show an `EmptyState`. Pure helpers (`gutterNumbers`,
  `rowsForHunk`) are tested. Used by G3, I2 and I3.
- [ ] **I5 · Submit review** (M): a sticky bottom bar on PR detail with **Approve**, **Request changes** and **Comment**.
  Each opens a bottom sheet with an optional body (required for Request changes and Comment) → `submitReview`. Disabled
  with an explanation on the viewer's own PR (GitHub forbids approving your own) and on merged or closed PRs. On
  success: a banner, invalidation of the list + detail, and the decision badge updates.

### J — Agents and More (M)

- [ ] **J1 · Provider registry** (S): `apps/mobile/src/agents/providers.ts` exports
  `AGENT_PROVIDERS: readonly { id: 'claude-code' | 'codex' | 'gemini' | 'jules' | 'copilot'; label: string; url: string; blurb: string; icon: ReactNode }[]`
  with Claude Code `https://claude.ai/code`, Codex `https://chatgpt.com/codex`, Gemini `https://gemini.google.com/app`,
  Jules `https://jules.google.com` and Copilot agents `https://github.com/copilot/agents`. **Verify each URL resolves to
  the provider's signed-in remote-control surface at build time** and correct it in the same PR. A test asserts ids
  are unique and every URL is `https:`.
- [ ] **J2 · Agents tab** (S): `app/(tabs)/agents/index.tsx` has one `Card` per provider (icon, label, blurb, Open
  button), with the last-used provider first and badged "Last used".
- [ ] **J3 · Open in the in-app browser** (S): `apps/mobile/src/agents/open-provider.ts` calls
  `WebBrowser.openBrowserAsync(url, { presentationStyle: FULL_SCREEN, controlsColor: colors.primary, toolbarColor: colors.background, dismissButtonStyle: 'close', enableBarCollapsing: true, showTitle: true })`
  (SFSafariViewController on iOS, Chrome Custom Tabs on Android). It records the last-used provider (F6). A one-time
  hint card explains that sign-in happens in the provider's own page, Google and Apple sign-in work there, and that the
  session persists across launches. **No `react-native-webview`, no custom user agent, no cookie injection.**
- [ ] **J4 · More tab** (S): `app/(tabs)/more/index.tsx` with sections **Accounts** (signed-in login + Avatar, token
  scopes, Sign out → deletes the SecureStore key and clears the query cache), **Appearance** (`SegmentedControl`
  system / light / dark → F6 → `ThemeProvider scheme`), and **About** (app version from `expo-constants`, Expo SDK,
  ui-native version, and a "Report an issue" link opening the public issue form URL used by the website in the in-app
  browser, never naming the repo).

### K — Docs and guards (S)

- [ ] **K1 · `docs/MOBILE.md`** (S): what the app is, running it (`moon run mobile:start`, Expo Go, the
  `EXPO_PUBLIC_GITHUB_CLIENT_ID` env), the package graph (`shared`, `tasks-core`, `forge-github-core`,
  `git-engine/diff`, `ui-native`), why provider sign-in uses the in-app browser (Google blocks embedded WebViews with
  `disallowed_useragent`), the `MobileDataSource` seam for future desktop pairing, and the "upstream first" rule for
  ui-native components.
- [ ] **K2 · Convention files** (S): add `apps/mobile` to the package-boundaries section of `CLAUDE.md`, `AGENTS.md` and
  `GEMINI.md` (identical text): what it may import, that it is Expo Go-only, that generic components go to
  `@bilo-io/ui-native` first, and the two pure cores in the layer diagram.
- [ ] **K3 · Tests in the gate** (XS): `apps/mobile`, `packages/tasks-core` and `packages/forge-github-core` are in
  `root:test-node`'s projects. Confirm in a CI run on the PR that `gate-node` picks them up. No new CI job is added and
  the macOS job count stays at 5.
- [ ] **K4 · Outstanding** (XS): append to `.midnite/tasks/outstanding.md`: desktop pairing data source, GHE / GitLab /
  Bitbucket / Azure on mobile, markdown rendering, push notifications, EAS builds and store release, board drag and
  drop, native-app handoff for agent providers, and a lane graph on History.

## Files this phase touches

| Area | Files |
|---|---|
| ui-native (other repo) | `midnite-ui/packages/ui-native/src/components/{app-bar,bottom-nav,fab,speed-dial,sheet,list-row,badge,chip,avatar,segmented-control,icon-button,empty-state,skeleton}.tsx` + tests, `src/index.ts`, `package.json`, `README.md`, `packages/showcase/**` |
| Mobile app | `apps/mobile/**` (new) |
| Pure cores | `packages/tasks-core/**`, `packages/forge-github-core/**` (new) |
| Desktop re-points | `packages/features/tasks/renderer/**`, `packages/features/forge/main/github/**`, `packages/git-engine/package.json` |
| Workspace | `eslint.config.mjs`, `scripts/layer-boundaries.test.mjs`, `vitest.node-gate.config.ts`, `pnpm-lock.yaml` |
| Docs | `docs/MOBILE.md`, `docs/APPS.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.midnite/tasks/outstanding.md` |

## Verification

- [ ] `@bilo-io/ui-native@0.5.0` is published, its own CI is green, and the showcase Mobile mode shows every new
  component plus the composed app-frame demo.
- [ ] CI on the PR is green (`gate-node` runs `root:test-node` including `mobile`, `tasks-core` and
  `forge-github-core`; typecheck and lint pass). Per the no-local-gate rule, this is checked in CI, not locally.
- [ ] Desktop is unchanged: every moved test still runs from its new home, and the Tasks board, list and graph and the
  PR review panel behave as before in `moon run studio:start` (a manual check with screenshots in the PR thread).
- [ ] `scripts/layer-boundaries.test.mjs` proves: mobile importing `@midnite/studio-frame` fails; importing
  `@midnite/studio-git-engine` (root) fails; importing `@midnite/studio-git-engine/diff` passes; `tasks-core` importing
  `react` fails.
- [ ] Manual, iOS simulator and Android emulator in Expo Go: sign in with the device flow; switch repo; scroll History
  past the first page; open a commit diff; open a project in Board, move a card, see it in List and Graph; pinch the
  graph; create an issue from the FAB; open a review-requested PR, read a diff, reply to a thread, approve (on a test
  repo).
- [ ] Manual: open Claude Code from Agents, sign in with **Google**, close, reopen the app, and open it again: still
  signed in. Repeat for Gemini (Google account) and Codex.
- [ ] Manual: sign out clears the token (re-opening the app lands on sign-in), and a revoked token returns to sign-in
  with the "session ended" message instead of a crash.

## Not in this phase

- Pairing with a running desktop Studio (LAN or tunnel). Only the `MobileDataSource` seam lands.
- Forges other than github.com.
- An embedded `react-native-webview` for providers, user-agent spoofing or cookie bridging.
- Push notifications, background refresh, widgets.
- EAS Build / Submit, TestFlight and Play Store release.
- A lane graph on History, drag and drop on the board, a markdown renderer, merging PRs from mobile.
- Native-app handoff (opening the Claude or ChatGPT app when installed).

## Decisions / open questions

1. **Data source: GitHub direct.** Agreed with the user. Mobile works without the desktop running. Pairing is a later
   phase that implements `MobileDataSource` and swaps it in.
2. **Provider sign-in: the system in-app browser.** Agreed. Google rejects OAuth in embedded WebViews
   (`disallowed_useragent`), so SFSafariViewController / Custom Tabs are the only path where Google SSO and passkeys
   work as the provider intends. The trade-off is the system's own browser chrome, which is accepted. On iOS,
   SFSafariViewController keeps its own persistent cookie store per app (not Safari's), so a provider sign-in persists
   across launches of Midnite.
3. **Location: `apps/mobile`.** Agreed: `apps/` holds installable products.
4. **ui-native upstream first.** Agreed. Generic components ship in `@bilo-io/ui-native` 0.5.0 before mobile consumes
   them, while domain composites (`CommitRow`, `TaskCard`, `PullRow`, the diff viewer) stay in the app.
5. **Pure cores.** Agreed: `packages/tasks-core` (Tasks derivations) and `packages/forge-github-core` (GraphQL documents
   and parsers). Both sit beside `shared` in the layer diagram and import only `shared`.
6. **Tests: vitest + react-native-web**, as ui-native already does, so mobile joins `root:test-node` and adds no CI job.
   jest-expo was considered and rejected because it would be a second runner and a second gate.
7. **Icons:** `@expo/vector-icons` `Feather` (Lucide's ancestor, so glyphs read like desktop's `react-icons/lu`).
   `react-icons` is DOM-only. This is an exception to the "react-icons is the only family" rule, scoped to
   `apps/mobile`, and is recorded in K2.
8. **Expo SDK / React Native version:** to be recorded by B1 on landing.
9. **Metro under pnpm:** the outcome of B3 (default config sufficed, or `watchFolders` / `nodeModulesPaths` were
   needed) is to be recorded on landing.
10. **ui-native published version:** to be recorded by A13.
11. **Open:** the GitHub OAuth App's owner (the `bilo-io` user or an org). This is needed before E3 can be exercised
    end to end, and E7 is the user's action.
