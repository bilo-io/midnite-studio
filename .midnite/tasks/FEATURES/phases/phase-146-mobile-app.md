# Phase 146 — Midnite Mobile

Planned 2026-11-14 with the user (`/midnite-plan`) · Refined: x1 (2026-11-14) · Designed: 2026-11-15 (`/midnite-design`) · grounded against the tree as of `2d4626d71`.

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

Planned 2026-11-14, designed 2026-11-15. Twelve themes: the component library release (A), the app scaffold (B), two
pure-core extractions (C, D), the GitHub data source (E), the shell (F), then the four tabs' screens (G History, H Tasks,
I Reviews, J Agents and More), the docs and guards (K), and the app-level visual pass (L).

**Theme A — `@bilo-io/ui-native` 0.5.0.** 🔄 Built and merged in midnite-ui (#19, 2b03986): the A14 token placeholders in `@bilo-io/ui/tokens` have real spacing, type, elevation and motion values; ui-native's theme exposes them with the status/kind accents, a scrim, `contrastRatio` and a pinned `LOW_CONTRAST_ACCENTS` (four light-mode accents under 3:1, no text pair fails); and AppBar, BottomNav, Fab + SpeedDial, Sheet, ListRow, Badge, Chip, Avatar, SegmentedControl, IconButton, EmptyState and Skeleton each land with a test and a showcase Mobile entry. `@bilo-io/ui` and `@bilo-io/shell` 0.5.0 are published; **ui-native 0.5.0 is not** — GitHub Packages refused the new package with "Account has reached its billing limit", so A13's release, the `v0.5.0` tag and Decision 10 wait on that. Open: a bottom sheet jumps between snap points instead of animating.

**Theme B — The `apps/mobile` scaffold.** ✅ Landed: `@midnite/mobile` (Expo SDK 58, RN 0.88.1), expo-router shell (`GestureHandlerRootView` > `SafeAreaProvider` > theme seam > `QueryClientProvider` > `AuthGate` passthrough, TODO E6), moon tasks, vitest + react-native-web joined to the node gate, an eslint boundary block with 15 layer cases, and an iOS `expo export` that bundles one `react`. `@bilo-io/ui-native` is not published, so `src/ui/theme.tsx` is a local seam to swap for ui-native ^0.5.0; simulator boot (B8 screenshots) is left to a human. Original scope: Expo + expo-router + strict TypeScript as a pnpm workspace member with moon
tasks, a Metro config that resolves the workspace, an eslint boundary block, and `ThemeProvider` at the root. It boots
in Expo Go on iOS and Android.

**Theme C — `packages/tasks-core`.** ✅ The pure Tasks derivations (board grouping, graph layout, filter, sort, status
stroke, field colours, issue order) move out of `features/tasks/renderer` into a React-free package. Desktop imports it
from there, and nothing on desktop changes behaviour. `deriveColumns` keeps its existing `(field, items)` signature so the moved assertions stay unchanged. The shared `ForgeProjectItem` test fixture moved with it and is exported at `@midnite/tasks-core/testing`, off the production barrel. `tasks-core` is in `NODE_PROJECTS`, so the consolidated `gate-node` targets pick it up, and eslint holds it to `shared` only with no React or electron.

**Theme D — `packages/forge-github-core`.** ✅ GraphQL documents, parsers and mutation builders live in a pure package built like git-engine (CJS dist, `shared` only; forge main keeps `…FromStdout` wrappers over `gh`), joined by history, pulls, pull and issue detail, issues, repos, branches and eight mutation builders for mobile; `git-engine` gains a `./diff` subpath.

**Theme E — The GitHub data source.** ✅ `apps/mobile` reads GitHub through a `MobileDataSource` interface (`Result<T>` envelopes, never throws) with a `GitHubDataSource` over `fetch` (Theme D's documents and parsers; REST only for commit and pull-file patches, run through `parseUnifiedDiff`), device-flow sign-in as a pure state machine plus a PAT fallback that lists missing scopes, the token in `expo-secure-store` keyed `github:github.com:<login>`, an `AuthGate` that returns to sign-in on any `auth` result, and `mobileQueryKeys` with one TanStack hook per method and the specified invalidations. `forge-github-core` is aliased to source in tsconfig, vitest and Metro (`expo export` bundles); it gained `parseBranchesPage` / `parseRepoPage` for cursors. E7 (the OAuth App and `EXPO_PUBLIC_GITHUB_CLIENT_ID`) is the user's action, so device flow is untested end to end.

**Theme F — The shell.** ✅ The five-tab BottomNav (History, Tasks, Reviews with a review-requested badge, Agents, More) is
ui-native's `BottomNav` behind expo-router `Tabs`, under a fixed 56dp `AppBar` title bar (forge-panel toggle, `owner/name`
over the branch as the repo-switcher trigger, the screen's `useTitleBarAction` slot, the viewer's avatar). The switcher is a
bottom `Sheet` over infinite `listRepos` with a filter and the last five repos pinned; the forge panel is a left `Sheet`
placeholder; the FAB is a `SpeedDial` (New issue, Open agent, Switch repo, Notes disabled) hidden off top-level tabs. Prefs
(`mobile.prefs`, zod-validated, zustand) persist in `expo-secure-store`. **It runs on a vendored `@bilo-io/ui-native` 0.5.0**:
the package is built and merged but unpublished (GitHub Packages billing limit), so its source is copied verbatim into
`apps/mobile/vendor/ui-native/` and aliased as `@bilo-io/ui-native` in tsconfig, vitest and Metro; removal is a deletion
(see `VENDORED.md` there), and the local ThemeProvider seam is already gone.

**Theme G — History.** ✅ The History tab is a `FlatList` over `useHistory` that pages at `onEndReachedThreshold` 0.5, with
sticky day separators from a pure `groupByDay`, a rail per row (filled success dot on the branch head, hollow ring for a
merge) and a mono short sha. The branch picker is a bottom `Sheet` over `useBranches` with a filter, opened from a Chip in
the title-bar action slot and stored per repo. `app/history/[sha].tsx` shows the full message, author and committer,
tappable parents, and the changed files, and a tap on a file shows its diff in place; Theme I's shared viewer (I4) had
not landed, so a minimal local `DiffView` stands in. `CommitDetail` gained optional `message` and `committerName` for the
detail screen. It runs on the vendored ui-native 0.5.0 stand-in (`apps/mobile/vendor/ui-native/`).

**Theme H — Tasks.** ✅ The Tasks tab (`app/(tabs)/tasks.tsx`) has a project `Chip` that opens a sheet over `useProjects` and a
Board / List / Graph `SegmentedControl` remembered per project; a repo with no Projects falls back to its Issues as a plain list.
Board is paged columns (`min(88%, 340)` wide, position dots) from `deriveColumns`, with a long-press "Move to…" sheet that writes
optimistically through `setItemField` and rolls back with a banner on failure (iteration groupings are read-only). List is a
`SectionList` grouped by the group field, filtered (search, assigned to me, label) and sorted through tasks-core. Graph lays
nodes out with `layoutForgeGraph` (200x64 cards), draws edges with `react-native-svg`, culls off-screen nodes and moves by
pinch + pan (0.3 to 2.5). Issue detail (`app/tasks/issue/[number].tsx`) shows state, labels, project field chips (tap to
change), a plain-text body with tappable links, comments and a composer, with Close / Reopen in the header; New issue
(`app/tasks/new-issue.tsx`) creates through the new `createIssueWithId` and adds the issue to the project. It runs on the
vendored ui-native 0.5.0 stand-in, and `@midnite/tasks-core` is now an `apps/mobile` dependency aliased to source.

**Theme I — Reviews.** ✅ Requested / Mine / All PR lists (`SegmentedControl` over infinite `usePulls`, pull to refresh),
then `app/reviews/[number].tsx` with Overview (body, reviewers, checks that open their details URL in the in-app browser),
Files and Conversation tabs. The shared diff viewer (`src/diff/`) is a virtualised `FlatList` with sticky hunk headers, a
two-number gutter, intraline tints, wrap or horizontal scroll, a "Load full diff" gate over 2,000 lines and a compact mode
for thread excerpts; History's commit detail now uses it and Theme G's stand-in is deleted. Threads reply through
`replyToThread`, resolved ones collapse, and a sticky bar submits Approve / Request changes / Comment (disabled on your own
or a closed PR). One data addition, `pullOverview` (check list, reviewer states, PR comments in one GraphQL call), since the
detail carried only the checks rollup. It runs on the vendored ui-native 0.5.0 stand-in (`apps/mobile/vendor/ui-native/`).

**Theme J — Agents and More.** ◻ A provider registry opened in SFSafariViewController / Chrome Custom Tabs, with a
last-used provider and a sign-in hint. More holds accounts, theme and about.

**Theme K — Docs and guards.** ◻ `docs/MOBILE.md`, the boundary paragraph in `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`,
the layer-boundaries test cases, and the mobile tests folded into `root:test-node`.

**Theme L — The visual pass.** ◻ No colour literals in the app (a test enforces it), one Feather icon map checked
against the glyph map, a shared `ScreenState` for loading, empty and error states, pressed and focus states on every
composite row, the compact / medium / expanded layout classes, Dynamic Type and reduce-motion support, and the diff
palette.

## Build order

1. **A** first, in `midnite-ui`. F to J consume its release. B, C and D can start alongside it.
2. **B**, then **C** and **D** in parallel (C and D touch disjoint files).
3. **E** needs B and D.
4. **F** needs A 0.5.0 published, B and E.
5. **G, H, I, J** in parallel once F lands (H needs C as well).
6. **K** last, though its boundary test cases land with B.
7. **L1 to L4** land with F (every screen builds on them). **L5 to L7** land with each screen theme (G to J), since
   each screen's PR carries its own states, layout classes and screenshots.

## Visual & UI/UX Design

> Every value below comes from `@bilo-io/ui/tokens` through ui-native's `useTheme()`. Nothing in `apps/mobile` names a
> hex, `rgb()` or `hsl()` literal (L1 enforces this). Token names are the ones A14 / A15 add.

### Tokens (A14 fills them upstream, A15 exposes them)

| Scale | Values (dp, equal to the Tailwind defaults web already uses) | Exposed as |
|---|---|---|
| Spacing | `0:0 · 0.5:2 · 1:4 · 2:8 · 3:12 · 4:16 · 5:20 · 6:24 · 8:32 · 10:40 · 12:48` | `theme.space[n]` |
| Type | `xs 12/16 · sm 14/20 · base 16/24 · lg 18/28 · xl 20/28 · 2xl 24/32`; weights `regular 400 · medium 500 · semibold 600`; families `sans` (system), `mono` (iOS `Menlo`, Android `monospace`) | `theme.type.{size}`, `theme.font.{weight\|mono}` |
| Elevation | `0` none · `1` y1 r2 o.05 (cards) · `2` y2 r6 o.10 (sheets, popovers) · `3` y6 r12 o.15 (FAB) · Android `elevation` 0/1/3/6 | `theme.elevation[n]` (a ready-made style object) |
| Motion | `fast 120 · base 200 · slow 320` ms; `standard` easing `bezier(0.2, 0, 0, 1)` | `theme.motion` |
| Radius | existing `sm 4 · md 6 · lg 8`, plus `full 9999` | `theme.radius` |
| Overlay | `scrim` = black at 0.5 (both schemes) | `theme.scrim` |
| Accents | existing `accentHues.status` (backlog, todo, wip, waiting, done, abandoned) and `accentHues.kind` (bug, feature, question, chore, unknown), per scheme | `theme.accents.status.*`, `theme.accents.kind.*` |

**Semantic mapping** (decided with the user: accents are reused, and no new colour tokens are added):

| Meaning | Token |
|---|---|
| Success, diff add, checks passed, Approved | `colors.success` |
| Warning, checks pending, Changes requested | `accents.status.wip` |
| Error text, diff remove, checks failed | `accents.kind.bug` |
| Destructive buttons (Sign out, Request changes submit) | `colors.destructive` / `destructiveForeground` (buttons only; too dim in dark mode for text) |
| Info, links, Open state | `accents.status.todo` |
| Draft, closed, muted metadata | `colors.mutedForeground` |
| Merged | `accents.kind.feature` |

### Shell geometry

```
┌─────────────────────────────────────────┐ ← status bar (safe-area top inset)
│ ◧   bilo-io/midnite-studio ▾       (●)  │  AppBar 56dp · bg background · hairline border bottom
│     ⎇ main                              │  title base/semibold · subtitle xs/mutedForeground
├─────────────────────────────────────────┤
│                                         │
│              screen content             │  horizontal padding space[4] (16)
│                                         │
│                                   ╭───╮ │  FAB 56dp circle · primary bg · plus 24dp in
│                                   │ + │ │  primaryForeground · elevation 3 · right space[4],
│                                   ╰───╯ │  bottom = nav height + inset + space[4]
├─────────────────────────────────────────┤
│  ⌾      ▦      ⇄      ⚙      ⋯          │  BottomNav 56dp + bottom inset · bg background
│ History Tasks Reviews Agents  More      │  icon 22dp · label xs/medium · hairline top
└─────────────────────────────────────────┘
```

- **AppBar:** leading `IconButton` 40dp (`sidebar`), title block flex 1, trailing `Avatar` 32. The title text has
  `numberOfLines={1}` with middle ellipsis for long `owner/name`. The ▾ chevron (`chevron-down` 16dp,
  `mutedForeground`) marks it as a switcher.
- **BottomNav:** five equal items. The active item gets a 56×28 `radius.full` pill in `colors.accent` behind the icon,
  with icon and label in `colors.foreground`. Inactive items are `mutedForeground`. A numeric badge is a 16dp-high
  `primary` pill with `xs/semibold` `primaryForeground` text (`99+` cap) and a 2dp `background` ring, offset top-right
  of the icon. A boolean badge is an 8dp dot of the same colour. `primary` is used rather than a red because no red
  token holds 4.5:1 text contrast in both schemes.
- **FAB (plain primary, decided):** a circle `radius.full`. Pressed: scale 0.96 + opacity 0.9 over `motion.fast`. When
  open, the icon rotates 45° (plus → ×) over `motion.base`.
- **SpeedDial open:** a full-screen `scrim` sits above the content and below the nav. Actions stack upward from the FAB
  with `space[3]` gaps. Each action is a 40dp `secondary` disc with a 20dp `secondaryForeground` icon, and a label pill
  to its left (`popover` bg, `sm/medium`, `space[3]` horizontal padding, elevation 2). They enter staggered 30ms apart,
  translating 8dp up and fading in over `motion.base`. Disabled actions sit at 0.4 opacity with a "Coming soon" `xs`
  label suffix.

```
                       ┌───────────────┐ ╭──╮
                       │ Notes · soon  │ │✎ │   (disabled, 0.4)
                       └───────────────┘ ╰──╯
                       ┌───────────────┐ ╭──╮
                       │ Switch repo   │ │⇆ │
                       └───────────────┘ ╰──╯
                       ┌───────────────┐ ╭──╮
                       │ Open agent    │ │⌁ │
                       └───────────────┘ ╰──╯
                       ┌───────────────┐ ╭──╮
                       │ New issue     │ │+ │
                       └───────────────┘ ╰──╯
                                        ╭────╮
                                        │ ×  │  FAB, rotated
                                        ╰────╯
```

- **Left sheet (forge panel):** width `min(86%, 360)`, `popover` bg, elevation 2, slides in from the left over
  `motion.base`, with the scrim behind it. Header: Avatar 40 + login `base/semibold` + `@host` `xs/mutedForeground`,
  `space[6]` padding. Sections use `xs/semibold` uppercase `mutedForeground` headings with `space[2]` letter-spacing 0.5.
- **Bottom sheet:** top radius 16 (`radius.lg` × 2), `popover` bg, a 36×4 `colors.border` grabber centred `space[2]`
  from the top, title `lg/semibold`, content padding `space[4]`. Snap points come from A5.

### Screens

**History** (G)

```
┌ AppBar ─────────────────────────────────┐
│ TODAY                                   │  section header xs/semibold mutedForeground, sticky
│ ●─ feat(app): switch selected repo …    │  rail 24dp col: 10dp dot (success fill = head,
│ │  (B) bilo-io · 2h            2d4626d  │  border-coloured otherwise; hollow ring = merge)
│ │                                       │  subject sm/medium 2 lines · meta xs mutedForeground
│ ○─ Merge pull request #1240 …           │  sha: mono xs Chip, muted bg
│ │  (B) bilo-io · 5h            ce3a70b  │
│ YESTERDAY                               │
│ ●─ fix(terminal): group sessions …      │  row min 64dp · pressed bg accent
└─────────────────────────────────────────┘
```

**Tasks: board** (H2). Columns are `min(88% width, 340)` wide with a `space[3]` gap, so the next column peeks.

```
│ [▦ Midnite Roadmap ▾]   [Board|List|Graph] │  project Chip + SegmentedControl, space[3] row
│ ● ● ○ ○ ○                                  │  column position dots, 6dp, active foreground
│ ┌ Todo · 12 ──────────┐ ┌ In progress · 3 ─│  column header: option-colour Chip + count xs
│ │▌#1241 Switch repo … │ │▌#1238 Sessions … │  TaskCard: card bg, radius.lg, elevation 1,
│ │▌ ui  app   (B)(K)   │ │▌ (B)             │  3dp left stroke = status accent, space[3] pad,
│ └─────────────────────┘ └──────────────────│  title sm/medium 3 lines, label Chips xs,
│ ┌─────────────────────┐                    │  Avatars 24 stacked −6dp overlap (max 3, +n)
```

Long-press (400ms) lifts the card (scale 1.02, elevation 2) and opens the "Move to…" bottom sheet. Each option is a
`ListRow` with a 10dp status dot, and a check marks the current one.

**Tasks: list** (H3). The search `Input` (`search` icon leading) sits above horizontally scrolling filter `Chip`s
(selected = `accent` bg + `check` 14dp), then `SectionList` rows (`ListRow`: 3dp status stroke leading, `#n` mono xs
meta, title, label chips in subtitle).

**Tasks: graph** (H4). The canvas has a `muted` bg with a 16dp dot grid at 0.5 alpha, `border` (`accents.kind.bug` for
blocking) edges at 1.5dp, and 200×64 node cards with the same chrome as TaskCard (compact). A zoom-level pill sits
bottom-left (`xs`, `popover`, "75%"), with a ⤢ fit button beside it. Selected node: a 2dp `ring` outline.

**Reviews: list** (I1)

```
│ [Requested | Mine | All]                   │
│ #1249 docs: Phase 146 — Midnite Mobile …   │  title sm/medium 2 lines
│ (B) bilo-io · Draft · ✓ 9/9 · Approved     │  status glyphs: check-circle success /
│ +494 −0 · 3 files · 2h                     │  x-circle bug / clock wip; decision Badge
```

**Reviews: PR detail + diff** (I2 to I5)

```
┌ ‹  #1249 · Open ───────────────────── ⋯ ┐  detail AppBar: back chevron-left, state Badge
│ docs: Phase 146 — Midnite Mobile plan   │  title lg/semibold
│ feature/phase-146 → main · bilo-io      │  xs mono branch chips
│ [Overview | Files 3 | Conversation 4]   │
│ ┌ .midnite/tasks/…/phase-146.md  +492 ┐ │  sticky file header: sm mono, +/− coloured
│ │ @@ -0,0 +1,492 @@                     │ │  hunk header: muted bg, xs mono mutedForeground
│ │   1 │+# Phase 146 — Midnite Mobile    │ │  gutter 2×32dp xs mono mutedForeground;
│ │   2 │+                                │ │  add row success@0.14 bg, sign in success;
│ │   3 │-old line                        │ │  remove row bug@0.14 bg, sign in bug;
│ └─────────────────────────────────────┘ │  intraline: same hue @0.32; body xs mono, wrapped
├─────────────────────────────────────────┤
│ [Comment] [Request changes] [ Approve ] │  sticky review bar, elevation 2, popover bg;
└─────────────────────────────────────────┘  Approve = primary Button, others outline
```

**Agents** (J2). There is one `Card` per provider (radius.lg, elevation 1, `space[4]`) with a provider glyph in a 40dp
`muted` disc, label `base/semibold`, blurb `sm/mutedForeground`, and an `Open` outline Button with `external-link`
14dp. "Last used" is a `primary` `Badge` top-right. The one-time hint card sits above the list (`accent` bg, `info`
icon, dismiss ×).

**More** (J4). Grouped `ListRow`s in inset cards (iOS-settings style): section heading `xs/semibold` uppercase, rows
`sm`, values right-aligned `mutedForeground`. Sign out is a full-width `destructive` Button at the bottom of Accounts.

**Sign in** (E3 / E6). Centred: `Wordmark` (ui-native, Damion), a `sm/mutedForeground` line, then a code card with the
`user_code` in `2xl` mono letter-spaced and a `copy` IconButton, a primary "Open GitHub" Button and a spinner row
"Waiting for approval…". "Use a personal access token" is a text link.

### State matrix

| Surface | Loading | Empty | Error (by `Result.kind`) | Pressed / focus |
|---|---|---|---|---|
| History | 8 Skeleton rows (dot 10, line 70%, line 40%) | `git-commit` "No commits on {branch}" | network → inline retry row, others → ScreenState | row bg `accent`; focus 2dp `ring` inset |
| Board | 3 skeleton columns × 3 cards | `trello` "No items in this project" + New issue | ScreenState; move failure → top banner `bug`, card snaps back | card scale 0.98; focus ring |
| List | 10 Skeleton ListRows | "No items match" + Clear filters | ScreenState | ListRow bg `accent` |
| Graph | centred spinner + "Laying out N items" | "No dependencies in this project" + View as list | ScreenState | node ring 2dp |
| Reviews list | 6 Skeleton rows | per scope: "Nothing waiting on you 🎉" / "You have no open PRs" / "No open PRs" | ScreenState | row bg `accent` |
| PR detail | header skeleton + 12 diff-line skeletons | binary / too large → EmptyState in the file slot | ScreenState; submit failure → sheet stays open with an inline `bug` message | — |
| Agents | none (static) | — | `openBrowserAsync` reject → banner "Couldn't open {provider}" | card bg `accent` |
| Repo / branch sheets | 6 Skeleton rows | "No repositories" / "No branches match" | inline retry | — |

**`ScreenState` copy by error kind** (L4):

| `kind` | Icon | Title | Action |
|---|---|---|---|
| `auth` | `lock` | "Your GitHub session ended" | Sign in again (AuthGate) |
| `scope` | `shield-off` | "This needs the `{scope}` permission" | Re-authorise |
| `network` | `wifi-off` | "You're offline" | Retry (after two consecutive network failures, an app-wide top banner also shows until a fetch succeeds) |
| `error` | `alert-triangle` | "Something went wrong" + message `xs mono` | Retry |

### Icon map (Feather, `apps/mobile/src/ui/icons.ts`)

| Use | Glyph | Use | Glyph |
|---|---|---|---|
| History tab | `git-commit` | Forge panel toggle | `sidebar` |
| Tasks tab | `trello` | Repo switcher chevron | `chevron-down` |
| Reviews tab | `git-pull-request` | Branch | `git-branch` |
| Agents tab | `cpu` | Private repo | `lock` |
| More tab | `more-horizontal` | Back | `chevron-left` |
| FAB | `plus` | New issue | `plus-square` |
| Open agent | `zap` | Switch repo | `repeat` |
| Notes (disabled) | `edit-3` | Checks passed / failed / pending | `check-circle` / `x-circle` / `clock` |
| Board / List / Graph | `columns` / `list` / `share-2` | Copy | `copy` |
| Search | `search` | External link | `external-link` |
| Offline / error | `wifi-off` / `alert-triangle` | Comment / reply | `message-square` / `corner-down-right` |

### Adaptations

- **Layout classes** (`useLayoutClass()`): `compact` < 600dp, `medium` 600 to 899, `expanded` ≥ 900. Board columns are
  `min(88%, 340)`, so medium shows about 2 and expanded about 3 columns with no peek. PR detail on `expanded` splits
  a 320dp file list beside the diff. Sheets are capped at 560dp wide and centred on medium and expanded.
- **Landscape phone:** AppBar drops the subtitle (branch appears in the title as `owner/name · branch`), and the
  BottomNav stays.
- **Dynamic Type:** body text scales freely. Chrome (nav labels, chips, badges, gutter) sets
  `maxFontSizeMultiplier={1.4}`. At a font scale ≥ 1.3 the nav hides labels and keeps `accessibilityLabel`.
- **Reduce motion:** Skeleton pulse, SpeedDial stagger and sheet slide all switch to an instant opacity change.
- **Dark / light:** every colour is a token, so both schemes come free. The diff palette's alphas (0.14 / 0.32) are
  checked against both by the contrast test (A15).
- **Accessibility:** a 44dp minimum hit target everywhere. Focus order is AppBar (leading → title → avatar) → content
  → FAB → BottomNav. Each `CommitRow`, `TaskCard` and `PullRow` reads as one sentence
  (`accessibilityLabel` composed, children `accessible={false}`).

## Deliverables

### A — `@bilo-io/ui-native` 0.5.0 (XL) · repo `bilo-io/midnite-ui`

Every component goes in `packages/ui-native/src/components/<kebab>.tsx` with a sibling `<kebab>.test.tsx` (vitest +
react-native-web, as the existing ones are). Each is styled only through `useTheme()` (`colors`, `alpha`, `radius`,
and A15's `space`, `type`, `font`, `elevation`, `motion`, `accents`, `scrim`; the values are in
[Visual & UI/UX Design](#visual--uiux-design)), takes an optional `style` and `testID`, sets `accessibilityRole` / `accessibilityLabel` through `lib/a11y.ts`, and is
exported from `src/index.ts`. Icons are passed in as `ReactNode` props: the library takes no icon dependency.

- [x] **A1 · `AppBar`** (S): `{ title: ReactNode; subtitle?: string; leading?: ReactNode; trailing?: ReactNode; onTitlePress?: () => void }`.
  Pads the top inset through an optional `insetTop: number` prop (the library takes no safe-area dependency). The
  title is pressable when `onTitlePress` is set (`accessibilityRole="button"`). Test: renders title and subtitle, and
  fires `onTitlePress`.
- [x] **A2 · `BottomNav`** (M): `{ items: { key: string; label: string; icon: ReactNode; badge?: number | boolean }[];
  activeKey: string; onChange: (key: string) => void; insetBottom?: number; hideLabels?: boolean }`. Equal-width items,
  styled per the Shell geometry spec (the active item gets a `radius.full` `accent` pill behind its icon, with icon and
  label in `foreground`; inactive items in `mutedForeground`), `accessibilityRole="tablist"` on the bar and `"tab"` plus `accessibilityState.selected` per item.
  A numeric badge over 99 renders `99+`. It must be usable as an expo-router `tabBar` with no adapter beyond mapping
  props. Test: the active state, `onChange`, and badge clamping.
- [x] **A3 · `Fab`** (S): `{ icon: ReactNode; label: string; onPress: () => void; position?: 'bottom-right' | 'bottom-left'; offsetBottom?: number }`.
  A 56 dp `radius.full` disc in `colors.primary` with the icon in `primaryForeground` (**plain primary, no gradient**:
  decided with the user), absolutely positioned, `elevation[3]`, `label` as `accessibilityLabel`. Pressed: scale 0.96 and
  opacity 0.9 over `motion.fast`. Test: press and label.
- [x] **A4 · `SpeedDial`** (M): `{ open: boolean; onOpenChange: (o: boolean) => void; actions: { key: string; label: string; icon: ReactNode; onPress: () => void; disabled?: boolean }[]; icon: ReactNode; openIcon?: ReactNode }`.
  It wraps `Fab`. When open, a scrim (`alpha(colors.background, 0.6)`) appears and the actions stack upward with
  labels to their left. Tapping the scrim or an action closes it. The animation uses React Native `Animated` (no
  reanimated). Test: open and close, an action fires and closes, a disabled action is inert.
- [x] **A5 · `Sheet`** (L): `{ open: boolean; onOpenChange: (o: boolean) => void; side: 'left' | 'bottom'; title?: string; children: ReactNode; widthFraction?: number /* left, default 0.86 */; snapPoints?: number[] /* bottom, fractions, default [0.5, 0.9] */ }`.
  Built on React Native `Modal` (transparent) + `Animated` + `PanResponder`: swipe left to close a left sheet, drag
  down to close a bottom sheet. Hardware back on Android closes it (`onRequestClose`). Test: open renders children,
  scrim press closes, and `onRequestClose` closes.
- [x] **A6 · `ListRow`** (S): `{ title: string; subtitle?: string; leading?: ReactNode; trailing?: ReactNode; meta?: string; onPress?: () => void; onLongPress?: () => void; numberOfLines?: number }`.
  A 56 dp minimum height (72 dp with a subtitle) and a hairline divider token. Test: press and long-press.
- [x] **A7 · `Badge` and `Chip`** (S): `Badge { tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'; children }`.
  Tones map through the Semantic mapping table: `neutral` → `muted`/`mutedForeground`, `primary` →
  `primary`/`primaryForeground`, `success` → `success`, `warning` → `accents.status.wip`, `danger` →
  `accents.kind.bug`, and `info` → `accents.status.todo`. Each non-neutral tone is the hue at 0.15 alpha as background,
  a 6dp leading dot at full strength, and text in **`foreground`, never the hue**: light-mode amber (`status.wip`,
  L 50%) cannot reach 4.5:1 as text on white, and the dot carries the tone instead. It is `xs/medium`, `radius.full`
  and `space[2]` horizontal padding.
  `Chip { label: string; color?: string /* hex, e.g. a project field option colour */; selected?: boolean; onPress?: () => void; leading?: ReactNode }`.
  `Chip` picks a readable text colour against `color` via relative luminance (`contrastTextForHex(hex)`: `L > 0.179` → `'#000000'`, else `'#ffffff'`, guaranteeing WCAG contrast ≥ 4.5). Test: tones, and contrast on a light (`#facc15`) and a dark (`#1e293b`) colour.
- [x] **A8 · `Avatar`** (XS): `{ uri?: string; name: string; size?: 24 | 32 | 40 }`. Falls back to initials on a
  `colors.muted` disc when `uri` is missing or fails to load (`onError`). Test: initials fallback.
- [x] **A9 · `SegmentedControl`** (S): `{ segments: { key: string; label: string; icon?: ReactNode }[]; value: string; onChange: (k: string) => void }`.
  `accessibilityRole="tablist"`. Test: change and selected state.
- [x] **A10 · `IconButton`** (XS): `{ icon: ReactNode; label: string; onPress: () => void; variant?: 'ghost' | 'filled'; size?: 32 | 40 }`.
  A 44 dp minimum hit slop. Test: press and label.
- [x] **A11 · `EmptyState` and `Skeleton`** (S): `EmptyState { icon?: ReactNode; title: string; body?: string; action?: { label: string; onPress: () => void } }`.
  `Skeleton { width: number | `${number}%`; height: number; radius?: number }` with a looped `Animated` opacity pulse
  (disabled when `AccessibilityInfo.isReduceMotionEnabled()` resolves true). Test: action fires, and reduce-motion
  leaves a static block.
- [x] **A12 · Showcase entries** (M): each of A1 to A11 gets a demo in the showcase's Mobile mode
  (`packages/showcase`, alongside the existing ui-native demos), including a composed "app frame" demo: AppBar + list +
  BottomNav + SpeedDial + left Sheet.
- [ ] **A13 · Boundary and release** (S): `src/boundary.test.ts` still passes (the dist imports only `react`,
  `react/jsx-runtime` and `react-native`). Bump `packages/ui-native/package.json` to `0.5.0`, add a README section
  listing the new components, and publish to GitHub Packages through that repo's own release flow. Record the
  published version in this doc's Decisions.
- [x] **A14 · Fill the token placeholders in `@bilo-io/ui/tokens`** (M): replace `spacing`, `typography`, `shadow` and
  `motion` (all `{ placeholder: true }` today) in `packages/ui/src/tokens/index.ts` with the values in the Tokens table
  (rem strings for lengths so `toDp` reads them, e.g. `spacing['4'] = '1rem'`). Add `radius.full`, `zIndex.fab = 40`,
  `zIndex.scrim = 45`, `zIndex.sheet = 50` and `overlay.scrim = { hsl: '0 0% 0%', alpha: 0.5 }`. The values equal
  Tailwind's defaults, so no web consumer changes. Extend `tokens.test.ts` to assert that no `placeholder: true`
  remains on the four scales, and that every spacing and type value parses with `toDp`.
- [x] **A15 · Expose them on ui-native's theme** (M): `createTheme` adds `space`, `type` (`{ fontSize, lineHeight }` per
  step), `font` (`regular`, `medium`, `semibold`, `mono`, with `mono` resolved via `Platform.select`), `elevation`
  (ready style objects with iOS shadow keys + Android `elevation`), `motion` (`{ fast, base, slow, easing }`, with
  easing as `Easing.bezier(0.2, 0, 0, 1)`), `accents` (`status` and `kind` from `accentHues[scheme]`) and `scrim` (an
  `hsla` string). Add `theme/contrast.ts` (`contrastRatio(a, b)` over WCAG relative luminance) and `contrast.test.ts`
  asserting, for both schemes: `foreground`/`background` ≥ 7, `mutedForeground`/`background` ≥ 4.5, `foreground`
  over each Badge tint (0.15 alpha composited on `background`) ≥ 4.5, and `foreground` over the diff add and remove
  tints at 0.14 and 0.32 ≥ 4.5. Each `accents.status.*` and `accents.kind.*` against `background` is computed. Pairs
  under 3:1 (the WCAG 1.4.11 floor for strokes and dots; light-mode `status.wip` is expected to be one) are exported as
  `LOW_CONTRAST_ACCENTS`, and the test pins that list. Components drawing such an accent as a stroke or dot add a 1dp
  `border` outline. A failing text pair adjusts the alpha in the spec, never the token.

### B — The `apps/mobile` scaffold (M)

- [x] **B1 · Package** (S): `apps/mobile/package.json` with `"name": "@midnite/mobile"` and `"private": true`, created
  with `create-expo-app` (TypeScript + expo-router template), then trimmed. Pin the newest Expo SDK whose React Native
  and React satisfy `@bilo-io/ui-native`'s peers (`react` ^19, `react-native` >=0.79); record the SDK in Decisions.
  Dependencies: `expo`, `expo-router`, `expo-secure-store`, `expo-web-browser`, `expo-clipboard`, `expo-constants`,
  `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `react-native-gesture-handler`,
  `@expo/vector-icons`, `@tanstack/react-query`, `zod` (the workspace's version), `@bilo-io/ui-native@^0.5.0`, plus
  workspace deps `@midnite/studio-shared`, `@midnite/tasks-core`, `@midnite/forge-github-core` and
  `@midnite/studio-git-engine` (`./diff` subpath only). All are Expo Go-compatible; add nothing that is not.
- [x] **B2 · App config** (XS): `apps/mobile/app.config.ts` with name "Midnite", slug `midnite-mobile`, scheme
  `midnite-mobile`, `userInterfaceStyle: 'automatic'`, iOS `bundleIdentifier` / Android `package`
  `io.bilo.midnite.mobile`, and the icon and splash taken from ui-native's `src/brand` PNGs (copied into
  `apps/mobile/assets/`). `extra.githubClientId` reads `process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID`.
- [x] **B3 · Metro + pnpm** (M): `apps/mobile/metro.config.js` from `expo/metro-config`'s `getDefaultConfig`. Prove that
  `expo start` resolves `@midnite/studio-shared` (TS source via its `exports`) and the hoisted React under pnpm's
  isolated layout. If it does not, set `watchFolders: [workspaceRoot]` and
  `resolver.nodeModulesPaths: [app/node_modules, workspaceRoot/node_modules]`. **Never change the root `.npmrc`'s
  `node-linker`**: that would reshape every other package's install. Exactly one copy of `react` must reach the bundle
  (a dev-only check in `app/_layout.tsx` is not acceptable; verify with `npx expo export --dump-sourcemap` once and note
  the result in Decisions).
- [x] **B4 · moon tasks** (S): `apps/mobile/moon.yml` with `start` (`expo start`), `typecheck` (`tsc --noEmit`), `lint`
  (eslint on `src/**` and `app/**`) and `test` (vitest). Add `'./apps/mobile/vitest.config.ts'` explicitly to
  `NODE_GATE_PROJECTS` in root `vitest.node-gate.config.ts` (`NODE_PROJECTS` in `scripts/gate-projects-check.mjs` only
  scans `packages/*`, not `apps/*`) so `moon run root:test-node` covers it.
- [x] **B5 · vitest + react-native-web** (S): `apps/mobile/vitest.config.ts` aliases `react-native` →
  `react-native-web` and stubs `expo-secure-store`, `expo-web-browser`, `expo-router` and `expo-clipboard` with
  `vi.mock` setup files in `apps/mobile/test/mocks/`, following ui-native's own vitest setup. jsdom environment.
- [x] **B6 · Root layout** (S): `apps/mobile/app/_layout.tsx` wraps `GestureHandlerRootView` → `SafeAreaProvider` →
  `ThemeProvider` (ui-native; scheme from the More ▸ Theme pref, Theme J) → `QueryClientProvider` → `AuthGate`
  (Theme E) → `<Slot />`.
- [x] **B7 · eslint boundary** (S): a `// --- Boundary: mobile (apps/mobile) ---` block in `eslint.config.mjs`, modelled
  on the launcher block, and update the suite-app globs (`apps/!(launcher)/...`) to `apps/!(launcher|mobile)/...` so
  suite-app rules do not also fire on `apps/mobile`. It denies `@midnite/studio-app*`, `@midnite/studio-desktop*`,
  `@midnite/studio-frame*`, `@midnite/studio-runtime*`, `@midnite/studio-knowledge*`, `@midnite/studio-db-engine*`,
  every `@midnite/feature-*` and `@midnite/module-*` and `@midnite/app-*`, `electron`, `node-pty`, `node:*`, `react-dom`,
  `react-icons*` and `lucide-react*`. It allows `@midnite/studio-git-engine/diff` and denies every other git-engine
  specifier with the message "Mobile takes only the pure diff parser from git-engine (`@midnite/studio-git-engine/diff`)."
  Add matching cases to `scripts/layer-boundaries.test.mjs`.
- [ ] **B8 · Boots** (XS): `moon run mobile:start` opens in Expo Go on an iOS simulator and an Android emulator and
  shows the themed empty shell. A screenshot of each goes in the PR thread (not committed).

### C — `packages/tasks-core` (M)

- [x] **C1 · Package** (S): `packages/tasks-core` with `"name": "@midnite/tasks-core"`, `moon.yml`, `tsconfig.json`,
  `vitest.config.ts` and `src/index.ts`, depending on `@midnite/studio-shared` only. Add `'tasks-core'` to
  `NODE_PROJECTS` in `scripts/gate-projects-check.mjs` (which feeds `vitest.node-gate.config.ts`) and add its targets
  to `.github/workflows/ci.yml`'s `gate-node` job. eslint block: it may import `@midnite/studio-shared` and nothing else
  in the workspace, and no `react`, `react-dom` or `react-native`.
- [x] **C2 · Move the pure files with `git mv`** (M), keeping their tests beside them: `resolve-group-field.ts`,
  `graph-layout.ts`, `graph-filter.ts`, `graph-blockers.ts`, `filter.ts`, `sort.ts`, `status-stroke.ts`,
  `field-option-colors.ts` and `issue-order.ts`, into `packages/tasks-core/src/{board,graph,issue}/` mirroring their
  current folders.
- [x] **C3 · Cut the frame edges** (S): `graph-layout.ts` imports `Rect` and `Viewport` types from `@midnite/studio-frame`.
  Declare structurally identical `Rect` / `Viewport` types and `rectsIntersect(a: Rect, b: Rect): boolean` in
  `tasks-core/src/graph/geometry.ts` (with a unit test; they are plain object types, so frame values still satisfy
  them). `edge-appearance.ts` imports `CardGlowState` from the board, so it **stays** in `features/tasks`.
- [x] **C4 · Split `board-derive.ts`** (M): it imports `sessionPhase` / `ConnectionState` from the frame and
  `BUILTIN_AGENTS`. Move the session-free grouping (`deriveColumns(items, fields, groupFieldId)`, `BoardColumn`,
  `NO_STATUS_COLUMN_ID`) to `tasks-core/src/board/board-columns.ts`. Keep the session-aware decoration and skill
  helpers (`composeCardPrompt`, `sessionsToRehome`, `countLiveCardSessions`, `resolveMostRecentAgentId`) in
  `features/tasks/renderer/board/board-derive.ts`, importing `deriveColumns` from `@midnite/tasks-core`. Existing
  `board-derive.test.ts` assertions keep passing unchanged; new `board-columns.test.ts` covers the pure part.
- [x] **C5 · Re-point desktop** (S): every import of a moved file in `packages/features/tasks` (and any other importer
  found with `grep -rn` on each filename) now imports from `@midnite/tasks-core`. Add `@midnite/tasks-core` to
  `features/tasks/package.json`. No re-export shims are left behind in the old paths.
- [x] **C6 · Layer rule** (XS): add `@midnite/tasks-core` to the "may import" list for features in `eslint.config.mjs`
  (it sits beside `shared` in the layer diagram) and a case to `scripts/layer-boundaries.test.mjs`. Update
  `docs/APPS.md`'s placement map with a "pure cores" row.

### D — `packages/forge-github-core` (L)

- [x] **D1 · Package** (S): `packages/forge-github-core` with `"name": "@midnite/forge-github-core"`, depending on
  `@midnite/studio-shared` only, and with the same `NODE_PROJECTS` (`scripts/gate-projects-check.mjs`), `ci.yml`
  `gate-node`, eslint and vitest wiring as C1.
- [x] **D2 · Move the pure GraphQL pieces** (M): from `gh-project.ts` move the query documents used by `listProjects` /
  `projectFields` / `projectItems`, plus `parseProjectList`, `parseFields`, `parseItemsPage` and `scopeErrorKind`. From
  `gh-graphql.ts` move `reviewCommentCountsQuery`, `parseReviewCommentCounts`, `parseReviewThreads`,
  `describeGraphqlFailure`, and the threads query used by `pullThreads`. Put them in
  `forge-github-core/src/{projects,reviews,errors}.ts`. The `gh-shell` callers in forge main import them back.
  Fixture tests (`__fixtures__`, `gh-parse-fixtures.test.ts`, `gh-project.test.ts`) move or are re-pointed so every
  existing assertion still runs.
- [x] **D3 · Transport-agnostic input** (S): every moved parser takes the parsed GraphQL `data` object (`unknown`,
  validated with zod inside), **not** a `gh` stdout string. The forge-main call sites do `JSON.parse(stdout)` first.
  Where a parser today takes a string, keep a thin `…FromStdout` wrapper in forge main only.
- [x] **D4 · New queries for mobile** (L), each a `const …Query` document plus a `parse…(data): T` mapping onto existing
  shared schemas, each with a fixture test:
  - `historyQuery(owner, name, qualifiedRef, first, after)` → `parseHistory(data): { commits: Commit[]; endCursor: string | null; hasNextPage: boolean }`.
    `refs` is `[]`; `coAuthors` and `sessionTrailers` are parsed from the commit message trailers, with the same trailer
    rules `git-engine` uses (import nothing from it; copy the two regexes and note the source in a comment).
  - `pullsQuery(owner, name, scope: ForgePullScope, first, after)` → `parsePulls(data): ForgePull[]` (scope "review
    requested" via `search(query: "is:pr is:open review-requested:@me repo:o/n")`, "mine" via `author:@me`, "all" via
    `repository.pullRequests(states: OPEN)`).
  - `pullDetailQuery(owner, name, number)` → `parsePullDetail(data): ForgePullDetail` (checks rollup, review decision,
    reviewers, body, head and base refs).
  - `issuesQuery(owner, name, first, after)` → `parseIssues(data): { issues: ForgeIssue[]; endCursor: string | null; hasNextPage: boolean }`
    and `issueDetailQuery(owner, name, number)` → `parseIssueDetail(data): ForgeIssueDetail`.
  - `repoListQuery(first, after)` (viewer repos + `viewer.organizations.repositories`, sorted by `PUSHED_AT`) →
    `parseRepoList(data): { owner: string; name: string; defaultBranch: string; pushedAt: string; isPrivate: boolean }[]`.
  - `branchesQuery(owner, name, first, after)` → `parseBranches(data): string[]`.
- [x] **D5 · Mutations** (M): `submitReviewMutation(pullId, event: ForgeReviewEvent, body)`,
  `addPullCommentMutation(subjectId, body)`, `replyToThreadMutation(threadId, body)`, `setProjectFieldMutation` (single
  select, matching desktop's `gh-project-write.ts` input shape), `addProjectItemMutation(projectId, contentId)` (for H6),
  `setIssueStateMutation(issueId, state: 'OPEN' | 'CLOSED')` (for H5), `createIssueMutation(repoId, title, body)` and
  `addCommentMutation(subjectId, body)`. Each is a document plus a `parse…Result(data)` returning `GitOpResult`-style
  `{ ok: true } | { ok: false; kind: 'error'; message: string }` using `describeGraphqlFailure` for `errors[]`.
- [x] **D6 · `git-engine` `./diff` subpath** (S): add `"./diff": { "types": "./dist/parsers/diff-parser.d.ts", "default": "./dist/parsers/diff-parser.js" }`
  to `packages/git-engine/package.json` `exports`, and wire `paths` / `customConditions` in `apps/mobile/tsconfig.json`
  and `apps/mobile/vitest.config.ts` so Metro, tsc and vitest resolve `@midnite/studio-git-engine/diff` to
  `packages/git-engine/src/parsers/diff-parser.ts` without a pre-built `dist/`. Assert in a test that `diff-parser.ts`
  still imports only `@midnite/studio-shared`.

### E — The GitHub data source (L)

- [x] **E1 · `MobileDataSource` interface** (S): `apps/mobile/src/data/source.ts`. Exports
  `type RepoRef = { owner: string; name: string }` and `MobileDataSource`. Every method returns
  `Promise<Result<T>>` where `Result<T> = { ok: true; value: T } | { ok: false; kind: 'auth' | 'scope' | 'network' | 'error'; message: string }`
  (never throws, matching the IPC envelope rule). Methods: `viewer()`, `listRepos(cursor?)`,
  `listBranches(repo, cursor?)`, `history(repo, ref, cursor?)`, `commit(repo, sha)` (→ `{ commit: Commit; files: FileDiff[] }`),
  `listProjects(repo)`, `projectFields(projectId)`, `projectItems(projectId, cursor?)`, `projectGraph(projectId)`
  (→ `ForgeGraph`), `setItemField(...)`, `addProjectItem(projectId, contentId)`, `listIssues(repo, cursor?)`,
  `issue(repo, n)`, `issueComments(repo, n)`, `createIssue(...)`, `setIssueState(repo, n, state: 'OPEN' | 'CLOSED')`,
  `commentIssue(...)`, `listPulls(repo, scope, cursor?)`, `pull(repo, n)`, `pullFiles(repo, n)` (→ `FileDiff[]`),
  `pullThreads(repo, n)`, `submitReview(...)`, `commentPull(...)` and `replyToThread(...)`. A comment on the interface
  states that a future `DesktopPairedDataSource` implements the same interface.
- [x] **E2 · `GitHubDataSource`** (L): `apps/mobile/src/data/github-source.ts` implements E1 with `fetch` to
  `https://api.github.com/graphql` using Theme D's documents and parsers. REST is used only for file patches:
  `GET /repos/{o}/{r}/commits/{sha}` and `GET /repos/{o}/{r}/pulls/{n}/files?per_page=100` (paginated through the `Link`
  header), with each `patch` run through `parseUnifiedDiff` from `@midnite/studio-git-engine/diff`. A file with no
  `patch` (binary or too large) becomes a `FileDiff` with no hunks and a `tooLarge`/`binary` flag as desktop renders
  it. 401 → `kind: 'auth'`, a 403 scope message → `'scope'`, a `TypeError` from fetch → `'network'`. Unit tests use a
  stubbed `fetch` against Theme D's fixtures.
- [x] **E3 · Device flow sign-in** (M): `apps/mobile/src/auth/device-flow.ts` does
  `POST https://github.com/login/device/code` (`client_id`, `scope=repo read:org read:project project`), shows
  `user_code` (with copy via `expo-clipboard`), opens `verification_uri` with `WebBrowser.openBrowserAsync`, and polls
  `POST https://github.com/login/oauth/access_token` honouring `interval`, `slow_down` (+5 s) and `expired_token`. It is
  a pure state machine (`idle → awaiting-user → polling → done | expired | denied | error`) with an injected `fetch`
  and clock, tested without timers flaking (use `vi.useFakeTimers`, no wall-clock assertions).
- [x] **E4 · PAT fallback** (S): a "Use a personal access token" link on the sign-in screen opens a field. The token is
  validated with `viewer { login }` before saving, and the scopes it lacks (`X-OAuth-Scopes` header) are listed.
- [x] **E5 · Token storage** (S): `apps/mobile/src/auth/token-store.ts` uses
  `SecureStore.setItemAsync('github:github.com:<login>', token, { keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY })`,
  keyed like desktop's `${provider}:${host}:${login}`. The active login is kept in a non-secret pref. Tokens are never
  logged, never in React Query keys, and never in error messages. A test greps the module's log calls.
- [x] **E6 · `AuthGate` + query hooks** (M): `AuthGate` renders the sign-in screen until a token exists. A `kind: 'auth'`
  result from any call clears the token and returns to sign-in with "Your GitHub session ended — sign in again."
  `apps/mobile/src/data/queries.ts` exports `mobileQueryKeys` and one TanStack Query hook per source method (`useHistory`,
  `useProjectItems`, `usePulls`, …) with keys `[method, repoKey, ...args]` and `staleTime: 30_000`; list hooks use
  `useInfiniteQuery` on the cursor. Mutations invalidate matching keys: `setItemField` → `projectItems` +
  `projectGraph`; `submitReview` / `commentPull` / `replyToThread` → `pull` + `pullThreads` + `pulls`; `createIssue` /
  `setIssueState` / `commentIssue` → `issues` + `issue` + `projectItems`.
- [ ] **E7 · GitHub OAuth App** (XS, user action): register a GitHub OAuth App with Device Flow enabled. Its client ID is
  public and is set as `EXPO_PUBLIC_GITHUB_CLIENT_ID` in `apps/mobile/.env` (git-ignored) and documented in
  `docs/MOBILE.md`. There is no client secret anywhere.

### F — The shell (M)

- [x] **F1 · Tabs** (S): `apps/mobile/app/(tabs)/_layout.tsx` uses expo-router `Tabs` with `tabBar={(p) => <MidniteTabBar {...p} />}`,
  which renders ui-native `BottomNav`. Tabs in order: `history` (Feather `git-commit`), `tasks` (`trello`), `reviews`
  (`git-pull-request`, badge = count of review-requested PRs), `agents` (`cpu`), `more` (`more-horizontal`). The bottom
  inset comes from `useSafeAreaInsets()`.
- [x] **F2 · Title bar** (M): `apps/mobile/src/shell/title-bar.tsx` on ui-native `AppBar`. Leading: an `IconButton`
  (Feather `sidebar`) toggling the forge panel. Title: `owner/name` with the current branch as subtitle. Pressing it
  opens the repo switcher. Trailing: the viewer's `Avatar` (taps go to More ▸ Accounts). Shown on every tab; screens set
  a per-tab action slot through a `useTitleBarAction` context (e.g. the Tasks view switch on narrow screens).
- [x] **F3 · Repo switcher** (S): a bottom `Sheet` listing `listRepos` (infinite, `ListRow` with a lock icon for private
  repos) plus a filter `Input`. Selecting sets the current repo (persisted pref `mobile.currentRepo`, branch reset to the
  repo's default branch). The last five repos are pinned at the top.
- [x] **F4 · Forge panel placeholder** (S): a left `Sheet` (`apps/mobile/src/shell/forge-panel.tsx`) with the account
  header (Avatar + login), the current repo, and three disabled `ListRow`s, "Branches", "Remotes" and "Forge accounts",
  each with a "Coming soon" `Badge`. A comment notes it mirrors desktop's left repos panel and will grow in a later
  phase.
- [x] **F5 · FAB speed dial** (S): ui-native `SpeedDial` mounted once in the tabs layout above the BottomNav
  (`offsetBottom` = bar height + inset). Actions: **New issue** (→ `/tasks/new-issue`), **Open agent** (→ opens the
  last-used provider, Theme J, or the Agents tab if none), **Switch repo** (→ the F3 sheet), and **Notes** (disabled,
  "Coming soon"), mirroring desktop's quick-access leaves. Hidden on full-screen detail routes.
- [x] **F6 · Prefs store** (XS): `apps/mobile/src/state/prefs.ts`, a tiny zustand store persisted to `expo-secure-store`
  under one non-secret key `mobile.prefs`. Validated on read with `MobilePrefsSchema` (`version: 1`, `currentRepo:
  { owner, name, defaultBranch } | null`, `recentRepos: [...]` capped at 5, `branchByRepo: Record<string, string>`,
  `theme: 'system' | 'light' | 'dark'`, `lastProvider: AgentProviderId | null`, `tasksViewByProject: Record<string,
  'board' | 'list' | 'graph'>`, `seenAgentHint: boolean`); unknown keys are stripped and invalid blobs reset to defaults.

### G — History (M)

- [x] **G1 · Timeline** (M): `apps/mobile/app/(tabs)/history/index.tsx` is a `FlatList` over `useHistory` (infinite,
  `onEndReachedThreshold: 0.5`). Each row is a `CommitRow` (`apps/mobile/src/history/commit-row.tsx`): a left rail with
  a dot (hollow for merge commits, `parents.length > 1`) and a connecting line, subject (2 lines), author Avatar + name,
  relative time, and a short sha in a mono `Chip`. Day separators ("Today", "Yesterday", `Tue 11 Nov`) come from a pure,
  tested `groupByDay(commits, now)` helper.
- [x] **G2 · Branch picker** (S): the title bar subtitle (branch) is pressable on History and opens a bottom `Sheet` over
  `useBranches` with a filter. Selecting stores the branch per repo (F6).
- [x] **G3 · Commit detail** (M): `app/history/[sha].tsx` shows the full message, author and committer, parents (each
  tappable), then a file list (`ListRow`: path, `+a −d`). Tapping a file opens the shared diff viewer (I4) for that
  `FileDiff`.
- [x] **G4 · States** (XS): `Skeleton` rows while loading, an `EmptyState` with "Pick a repository" + action when none
  is selected, and an inline retry row for `kind: 'network'`.

### H — Tasks (L)

- [x] **H1 · Project picker + view switch** (S): `app/(tabs)/tasks/index.tsx`. A header `Chip` names the project (opens a
  sheet over `useProjects`). A `SegmentedControl` offers `board | list | graph`, persisted per project (F6). No projects
  → `EmptyState` ("This repo has no GitHub Projects", a link to the repo's Issues list as a plain list).
- [x] **H2 · Board** (L): `apps/mobile/src/tasks/board-view.tsx` takes columns from `deriveColumns` (`@midnite/tasks-core`)
  over the group field resolved by `resolveGroupField`. It is a horizontal paged `FlatList` (`pagingEnabled`,
  `snapToInterval` = 88% of screen width so the next column peeks) with a column header (option colour `Chip` + count)
  and a vertical list of `TaskCard`s (`apps/mobile/src/tasks/task-card.tsx`: number, title, labels as `Chip`s, assignee
  Avatars, a left status stroke from `itemStatusStroke`). Long-press a card → bottom sheet "Move to…" listing the group
  field's options → `setItemField`, applied optimistically and rolled back on `{ ok: false }` with a toast-style banner.
  Column dots above the board show the position.
- [x] **H3 · List** (M): `apps/mobile/src/tasks/list-view.tsx` is a `SectionList` grouped by the same group field,
  sorted with tasks-core `sort.ts`, and filtered with `filter.ts` through a search `Input` and filter chips (assignee:
  me, label). Rows use `ListRow` with the status stroke as `leading`.
- [x] **H4 · Graph** (L): `apps/mobile/src/tasks/graph-view.tsx` uses tasks-core `layoutForgeGraph` +
  `filterForgeGraph` + `blockedItemIds` over `useProjectGraph`. Edges are drawn with `react-native-svg` `Path` (the same
  geometry desktop uses) and nodes are absolutely positioned `View`s (compact cards: number + title + status stroke)
  inside a container transformed by a pinch + pan gesture (`react-native-gesture-handler` `Gesture.Simultaneous(Pinch, Pan)`,
  scale clamped 0.3 to 2.5). Initial viewport from `topAlignedViewport`. Tapping a node opens issue detail. Off-screen
  nodes are culled with `rectsIntersect` (from `@midnite/tasks-core`, added in C3) against the viewport (port of
  desktop's margin rule).
- [x] **H5 · Issue detail** (M): `app/tasks/issue/[number].tsx` shows title, state `Badge`, labels, assignees, the
  project field values as `Chip`s (tap one → change it in a sheet), the body rendered as plain text with links tappable
  (no markdown renderer this phase), the comment list, and a composer (`Textarea` + Send) → `commentIssue`. Close/Reopen
  in the title bar action slot.
- [x] **H6 · New issue** (S): `app/tasks/new-issue.tsx`, a modal route with title (required) and body, creating in the
  current repo. If a project is selected, it is added to that project (`addProjectItem`). On success it navigates to the
  new issue's detail.

### I — Reviews (L)

- [x] **I1 · PR lists** (M): `app/(tabs)/reviews/index.tsx` with a `SegmentedControl` `requested | mine | all` (default
  `requested`) over `usePulls` (infinite). `PullRow`: number + title, author Avatar, draft `Badge`, checks summary
  (✓ / ✗ / ● from `ForgeChecksRollup`), review decision `Badge`, `+a −d`, relative updated time. Pull to refresh.
- [x] **I2 · PR detail** (M): `app/reviews/[number].tsx`. The header has title, `head → base`, author and state. Then
  three tabs (ui-native `Tabs`): **Overview** (body as plain text, reviewers with their state, checks list with name +
  conclusion, tapping one opens its `detailsUrl` in the in-app browser), **Files** (file list → I4 viewer) and
  **Conversation** (I3).
- [x] **I3 · Threads and comments** (M): Conversation lists PR comments and review threads in time order. A thread shows
  `path:line`, a 6-line hunk excerpt rendered by I4 in compact mode, its comments, and a reply composer →
  `replyToThread`. Resolved threads are collapsed under "N resolved". A general comment composer at the bottom →
  `commentPull`.
- [x] **I4 · Diff viewer** (L): `apps/mobile/src/diff/diff-view.tsx` renders one `FileDiff` as a unified diff:
  monospace (`font.mono`, `xs`), hunk headers as sticky section headers, a two-number gutter (old/new, 32dp each),
  added rows on `success` at 0.14 alpha and removed rows on `accents.kind.bug` at 0.14 alpha (sign glyph at full
  strength), intraline ranges (`IntralineRange`) at 0.32 alpha of the same hue, long lines **wrapped**
  (a "No wrap" toggle switches to horizontal scroll), and a `FlatList` per line for large files (>2,000 lines show a
  "Load full diff" gate). Binary and too-large files show an `EmptyState`. Pure helpers (`gutterNumbers`,
  `rowsForHunk`) are tested. Used by G3, I2 and I3.
- [x] **I5 · Submit review** (M): a sticky bottom bar on PR detail with **Approve**, **Request changes** and **Comment**.
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
  ui-native version, and a "Report an issue" link opening `https://github.com/bilo-io/midnite-apps/issues/new` (the
  public issue repo used by the website and `features/report`, never naming `bilo-io/midnite-studio`) in the in-app
  browser).

### K — Docs and guards (S)

- [ ] **K1 · `docs/MOBILE.md`** (S): what the app is, running it (`moon run mobile:start`, Expo Go, the
  `EXPO_PUBLIC_GITHUB_CLIENT_ID` env), the package graph (`shared`, `tasks-core`, `forge-github-core`,
  `git-engine/diff`, `ui-native`), why provider sign-in uses the in-app browser (Google blocks embedded WebViews with
  `disallowed_useragent`), the `MobileDataSource` seam for future desktop pairing, and the "upstream first" rule for
  ui-native components.
- [ ] **K2 · Convention files** (S): add `apps/mobile` to the package-boundaries section of `CLAUDE.md`, `AGENTS.md` and
  `GEMINI.md` (identical text): what it may import, that it is Expo Go-only, that generic components go to
  `@bilo-io/ui-native` first, and the two pure cores in the layer diagram.
- [ ] **K3 · Tests in the gate** (XS): `apps/mobile` is in `vitest.node-gate.config.ts` (`NODE_GATE_PROJECTS`), and
  `packages/tasks-core` + `packages/forge-github-core` are in `NODE_PROJECTS` (`scripts/gate-projects-check.mjs`) and
  `.github/workflows/ci.yml`'s `gate-node` job. Confirm in a CI run on the PR that `gate-node` and `gate-audit` pass.
  No new CI job is added and the macOS job count stays at 5.
- [ ] **K4 · Outstanding** (XS): append to `.midnite/tasks/outstanding.md`: desktop pairing data source, GHE / GitLab /
  Bitbucket / Azure on mobile, markdown rendering, push notifications, EAS builds and store release, board drag and
  drop, native-app handoff for agent providers, and a lane graph on History.

### L — The visual pass (M)

Specified in full under [Visual & UI/UX Design](#visual--uiux-design). L1 to L4 land with Theme F, and L5 to L7 land
with each screen theme's PR.

- [ ] **L1 · No colour literals** (S): `apps/mobile/test/no-ad-hoc-colors.test.ts` scans `apps/mobile/{app,src}/**/*.tsx?`
  and fails on any `#[0-9a-f]{3,8}\b`, `rgb(`, `rgba(`, `hsl(` or `hsla(` literal, or a named colour string
  (`'white'`, `'black'`, `'red'`, …) as a style value. Every colour comes from `useTheme()`. The test names the file and
  line of each hit.
- [ ] **L2 · Icon map** (S): `apps/mobile/src/ui/icons.ts` exports `ICONS`, a `Record<IconName, FeatherGlyph>` holding
  exactly the Icon map table, plus `<Icon name size? color? />` (size default 20, colour default `foreground`). No
  other file imports `@expo/vector-icons` (eslint `no-restricted-imports` inside `apps/mobile`, except `icons.ts`).
  `icons.test.ts` asserts every value exists in Feather's glyph map
  (`@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json`), mirroring desktop's
  `icon-names.test.ts`.
- [ ] **L3 · Shell styling** (M): the title bar, BottomNav, FAB / SpeedDial, left forge sheet and bottom sheets match
  the Shell geometry spec and its two wireframes (sizes, tokens, motion, scrim, z-order: content < scrim < FAB actions <
  sheets). The FAB hides with a `motion.fast` fade on detail routes and while the keyboard is up.
- [ ] **L4 · `ScreenState`** (M): `apps/mobile/src/ui/screen-state.tsx` is `<ScreenState query={useInfiniteQuery|useQuery result} skeleton={ReactNode} empty={{ icon, title, body?, action? }}>{children}</ScreenState>`.
  It renders the skeleton while `isPending`, `EmptyState` when the data is empty, and the error copy table by
  `Result.kind` with its action. Pull to refresh refetches. The app-wide offline banner
  (`apps/mobile/src/ui/offline-banner.tsx`) shows after two consecutive `network` failures and hides on the next
  success, sitting under the AppBar and `accents.status.wip`-tinted. Tests: each state renders, each kind shows its
  copy and action, and the banner's two-failure threshold works.
- [ ] **L5 · Row and card states** (M): `CommitRow`, `TaskCard`, `PullRow`, graph nodes and settings rows implement
  the State matrix's pressed and focus column. Pressed is `accent` bg (rows) or scale 0.98 (cards) over
  `motion.fast`. Focus (hardware keyboard, switch access) is a 2dp `ring` outline via Pressable `onFocus` / `onBlur`.
  Each row composes one `accessibilityLabel` sentence (e.g. "Commit 2d4626d, feat(app): switch selected repo, by
  bilo-io, 2 hours ago, merge commit") with children `accessible={false}`. Tests: the composed label for each row type.
- [ ] **L6 · Layout classes** (M): `apps/mobile/src/ui/layout-class.ts` exports `layoutClassFor(width)` (pure, tested
  at 599/600/899/900) and `useLayoutClass()` over `useWindowDimensions`. Board column width, PR detail split
  (`expanded`), sheet max width (560) and landscape AppBar (branch folded into the title) follow the Adaptations spec.
- [ ] **L7 · Dynamic Type and reduce motion** (S): chrome text sets `maxFontSizeMultiplier={1.4}`, the BottomNav
  passes `hideLabels` when `PixelRatio.getFontScale() >= 1.3`, and one `useReducedMotion()` hook
  (`AccessibilityInfo.isReduceMotionEnabled` + its change event) switches SpeedDial stagger, sheet slide and Skeleton
  pulse to instant opacity. Tests: the hook's change event, and nav labels hidden at scale 1.3.

## Files this phase touches

| Area | Files |
|---|---|
| ui-native (other repo) | `midnite-ui/packages/ui-native/src/components/{app-bar,bottom-nav,fab,speed-dial,sheet,list-row,badge,chip,avatar,segmented-control,icon-button,empty-state,skeleton}.tsx` + tests, `src/theme/{palette,contrast}.ts` + tests, `src/index.ts`, `package.json`, `README.md`, `packages/showcase/**` |
| ui tokens (other repo) | `midnite-ui/packages/ui/src/tokens/index.ts`, `tokens.test.ts` |
| Mobile app | `apps/mobile/**` (new) |
| Pure cores | `packages/tasks-core/**`, `packages/forge-github-core/**` (new) |
| Desktop re-points | `packages/features/tasks/renderer/**`, `packages/features/forge/main/github/**`, `packages/git-engine/package.json` |
| Workspace | `eslint.config.mjs`, `scripts/layer-boundaries.test.mjs`, `scripts/gate-projects-check.mjs`, `.github/workflows/ci.yml`, `vitest.node-gate.config.ts`, `pnpm-lock.yaml` |
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
- [ ] Visual checks, per `docs/TESTING.md`'s "screenshots are never committed" rule: every screen in the Screens
  section plus the SpeedDial-open and forge-panel-open states, in **light and dark**, on an iOS simulator and an
  Android emulator. They are captured to the session scratchpad and shown in each screen theme's PR thread, and
  compared against the wireframes. The ui-native showcase's Mobile mode (react-native-web) shows the same components
  in both schemes.
- [ ] Contrast: ui-native `contrast.test.ts` (A15) passes for both schemes, and `LOW_CONTRAST_ACCENTS` is pinned with
  the outline rule applied where those accents are drawn.
- [ ] Accessibility, manual: a VoiceOver (iOS) and TalkBack (Android) pass over History, Board, a PR diff and More
  confirms the focus order AppBar → content → FAB → BottomNav, that each row reads as one sentence, and that every
  control has a label. With a hardware keyboard on the iPad simulator, Tab shows the 2dp `ring` focus outline on every
  row and card. At the largest Dynamic Type size, nav labels hide and nothing clips. With Reduce Motion on, the
  SpeedDial and sheets appear without sliding.

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
8. **Expo SDK / React Native version:** Expo SDK 58 (`expo ~58.0.25`), React Native 0.88.1, React 19.3.0 (exact, from SDK 58's `bundledNativeModules`), react-native-web ~0.21.4. Recorded by B1.
9. **Metro under pnpm:** `expo export --platform ios --dump-sourcemap` succeeds with `watchFolders` + `nodeModulesPaths`
   set in `metro.config.js` (the default config was not tried alone), and the sourcemap carries exactly one copy of
   `react`. `@midnite/studio-shared` resolution is configured but not yet exercised, since no mobile source imports it
   yet; the first import (Theme C/D) re-checks it. Root `.npmrc` untouched.
10. **ui-native published version:** to be recorded by A13.
11. **Open:** the GitHub OAuth App's owner (the `bilo-io` user or an org). This is needed before E3 can be exercised
    end to end, and E7 is the user's action.
12. **Token scales are filled upstream** (decided with the user, 2026-11-15, `/midnite-design`). Spacing, typography,
    elevation and motion become real values in `@bilo-io/ui/tokens` (A14), equal to the Tailwind defaults web already
    renders, so web and native read one source and web changes nothing. The alternative, a ui-native-only
    `metrics.ts`, was rejected because the two would drift.
13. **FAB: plain primary** (decided with the user). It is a solid `primary` disc with a `primaryForeground` icon and no
    brand gradient, so ui-native keeps its zero-dependency rule and the FAB reads the same in both schemes.
14. **Title bar: compact, a fixed 56dp** (decided with the user). It is one row on every tab (panel toggle, repo +
    branch, avatar). The tab name lives only in the BottomNav, which leaves the most vertical room for the board and
    diffs. Large collapsing titles were rejected.
15. **Status colours reuse `accentHues`** (decided with the user). There are no new `warning` / `info` / diff tokens:
    the Semantic mapping table maps them onto `success`, `accents.status.*` and `accents.kind.*`. `destructive` stays
    on destructive buttons only, because its dark value (L 30.6%) is too dim for text. Badge text is always
    `foreground` with a tone dot, because light amber cannot carry text contrast.
16. **`deriveColumns` keeps `(field, items)`** (Theme C). The C4 text names `(items, fields, groupFieldId)`, but the
    existing signature moved unchanged so every `board-derive.test.ts` assertion carries over as it was. A mobile
    caller resolves the group field with `resolveGroupField` first, as desktop does.
17. **Shared test fixture:** `ForgeProjectItem` factories (`issueItem`, `pullItem`, `draftItem`) live in
    `packages/tasks-core/src/__fixtures__` and are exported at `@midnite/tasks-core/testing`, so tasks-core and
    `features/tasks` tests use one factory and the production barrel stays clean.
