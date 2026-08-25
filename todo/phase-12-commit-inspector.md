# Phase 12 — Commit inspector, live ref badges, real diffs

Phase 5 shipped the commit detail panel as an explicit stub — `%B` dumped into a
`whitespace-pre-wrap` div, a flat file list, and `git show --stat` in a `<pre>` that repeats the
numbers the file list already shows. Phase 12 turns that stub into the thing you actually read a
commit in: rendered message with clickable references, a collapsible file tree, a restrained
unified diff, and ref badges that stop being decoration and start being controls.

> **Builds on:** Phase 5 (graph rows, `useRefsBySha`, the detail stub), Phase 6 (`fetch`/`pull`/`push`
> ops and `Upstream {ahead, behind, gone}`), Phase 7 (`MenuItem` context menus, `confirm-dialog`),
> Phase 9 (keybinding registry), Phase 10 (watch invalidation — new queries must join the map).

> **Scope guardrails:** no force-push, still (`outstanding.md` keeps `--force-with-lease` deferred).
> No side-by-side diff, no syntax highlighting inside diff lines, no per-hunk staging, no blame,
> no PR/forge API calls — link-out only. Lane layout stays in main; nothing here moves parsing to
> the renderer.

> **Effort tags:** **S** ≈ half a day · **M** ≈ 1–2 days · **L** ≈ 3+ days.

Themes are parallelisable with one hard edge: **A depends on E** for `#123` resolution (SHAs, URLs
and emails in A do not). Everything else is independent.

---

## Theme A — Rendered commit message with live references · M

The body is markdown often enough to be worth parsing, and full of references that should be
clickable regardless. Two passes: markdown first, then linkify the resulting text nodes.

- [ ] Add `react-markdown` + `remark-gfm` to [`packages/app`](../packages/app/package.json); render `CommitDetail.body` through it. **No `rehype-raw`** — raw HTML in a commit message stays inert text, which removes the sanitisation problem rather than solving it **S**
- [ ] `app/src/features/commit/linkify.tsx` — a remark/rehype plugin (or a post-render text-node walker) recognising, in priority order: 40-char and 7–12-char hex SHAs · bare `http(s)://` URLs · `#\d+` issue refs · RFC-5322 emails. Pure function + unit test; no React inside the matcher **M**
- [ ] Link targets: SHA → `selectCommit(sha)` (Theme B) · URL → `<a target="_blank" rel="noreferrer">`, which already reaches [`window.ts:83`](../packages/desktop/src/main/window.ts#L83)'s `setWindowOpenHandler` and opens externally · `#123` → `shell.openExternal(issueUrl)` via Theme E · email → `mailto:` **S**
- [ ] Trailer block styling — `Co-Authored-By:`, `Signed-off-by:`, `Reviewed-by:` split off the body tail and rendered as a muted metadata list rather than prose **S**
- [ ] Guard the SHA matcher against false positives: a bare 7-hex word inside a code fence or a URL path must not linkify. Test the nasty cases (`deadbeef` as an English-ish word, `#1` in a markdown ordered list) **S**

## Theme B — Inspector panel rebuild · L

[`commit-detail.tsx`](../packages/app/src/features/commit/commit-detail.tsx) is 70 lines and does
none of this. Rebuild it as a real panel.

- [ ] **Header row:** full sha, monospace, with a **copy-to-clipboard icon button top-right** next to it. Use Electron's `clipboard` module through a new preload affordance — `navigator.clipboard` needs a secure context and the packaged app loads from `file://`. Copied-state feedback on the button (checkmark, ~1.2s) **S**
- [ ] **Metadata block:** author, committer (only when it differs from author), authored + committed dates. This needs `CommitDetail` extending — see the schema item below **S**
- [ ] **Kill the redundant `<pre>{stat}</pre>`.** The `files[]` list already carries every number in it. Drop `stat` from the response entirely rather than leaving a dead field **S**
- [ ] **Tree ⇄ list toggle** — two icon buttons top-right (`IconButton` from [`components/icon-button.tsx`](../packages/app/src/components/icon-button.tsx)), each with a `Tooltip`. Persist the choice in [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts) so it survives repo switches **M**
- [ ] **Tree view:** build a path trie from `files[]`; collapsible directories; single-child directories collapsed into one row (`packages / desktop / scripts`) as in the current screenshot; per-file `+n −n` right-aligned; directory rows roll up their subtree totals **M**
- [ ] **List view:** flat, full paths, sorted by change size descending — the "what actually moved" view **S**
- [ ] Selecting a file opens its diff inline below (or in a lower pane) — Theme D provides the renderer **S**
- [ ] **Commit navigation:** `selectCommit(sha)` in [`graph-store.ts`](../packages/app/src/features/graph/graph-store.ts) becomes the single entry point. Clicking a parent SHA, or any linkified SHA from Theme A, selects that commit and re-renders the panel — **including commits outside the currently loaded graph window** (fall back to fetching detail directly rather than requiring a row) **M**
- [ ] Parent SHAs rendered as an explicit row of clickable short-shas; merge commits show all parents labelled `parent 1` / `parent 2` **S**
- [ ] Extend `CommitDetailResponse` in [`schemas.ts`](../packages/shared/src/ipc/schemas.ts#L93) → add `parents: string[]`, `subject`, `author {name, email, date}`, `committer {name, email, date}`; drop `stat`. Update [`readCommitDetail`](../packages/git-engine/src/commands/log.ts#L150) (one `git show --no-patch --pretty=format:` with NUL-separated fields — **not** whitespace-split) and the `ipc.test.ts` coverage assertions **M**

## Theme C — Ref badges as a control surface · M

[`ref-badge.tsx`](../packages/app/src/features/graph/ref-badge.tsx) already has `Ref.isHead` and
`Ref.upstream {ahead, behind, gone}`. It renders them as static text. Make them actionable.

- [ ] **Active-branch glow:** `isHead` badges get a slow pulsating gradient border/halo. Keyframes go in [`tailwind.config.ts`](../packages/app/tailwind.config.ts) alongside the existing `fade-in` precedent. Deliberately *subtle* — low opacity, ~2.4s cycle, no size change (a badge that resizes reflows the row). `html[data-motion='reduced']` from `@bilo-io/shell` disarms it for free; verify that **M**
- [ ] **Hover-expand sync affordance:** when `upstream.ahead > 0 || upstream.behind > 0`, hovering the badge expands it to the right revealing icon buttons — ↓ pull when behind, ↑ push when ahead, both when diverged. Expansion must not reflow neighbouring badges or the subject column (overlay/absolute, or reserve the width) **M**
- [ ] Each icon button carries a `Tooltip` ([`components/tooltip.tsx`](../packages/app/src/components/tooltip.tsx)) stating exactly what it does with real numbers — "Push 3 commits to origin/main", "Pull 2 commits from origin/main", "Publish branch to origin (sets upstream)" when `upstream` is null **S**
- [ ] Replace the badge's native `title=` attribute with the `Tooltip` component so the hover story is one system, not two **S**
- [ ] **Branch context menu gains sync verbs** in [`use-graph-actions.ts`](../packages/app/src/features/graph/use-graph-actions.ts): Push `<branch>` · Pull into `<branch>` · Fetch `<remote>` · Publish (`push -u`, only when no upstream). Wire to the existing `usePush/usePull/useFetch` in [`queries.ts`](../packages/app/src/services/queries.ts) — **no new IPC needed**; `mgit:op:push` already takes `setUpstream` **M**
- [ ] Disabled items carry their reason as a tooltip, per the Phase 7 convention (e.g. "Nothing to push", "No upstream configured") **S**
- [ ] In-flight state: the icon button shows a spinner and the badge is non-interactive until the op resolves; failures surface through the existing `GitOpResult` envelope, never a throw **S**

## Theme D — Real diff rendering · L — ✅ DONE (2026-08-25)

Landed on `feature/phase-12-diffs`. Diffs are parsed in main and painted by one
`<DiffView>` shared by the inspector and the status panel. Items moved to
[`done.md`](done.md).

Beyond the plan, three things this shook out:

- **A pathspec filters before rename detection.** `git diff -M -- new-name` sees only
  the addition and reports a brand-new file, every line green. Both requests gained an
  `oldPath` so the pathspec can name both sides; it comes from `StatusEntry.origPath` in
  the status panel and from `parseNumstat`'s rename token — which was being discarded —
  in the inspector.
- **`git show` prints nothing for a merge commit.** `-m --first-parent` is what makes a
  merge's files inspectable at all.
- **Body lines can look exactly like file headers.** A deleted `-- comment` reads
  `--- comment` in the patch. Parsing headers anywhere but before the first hunk dropped
  the line, under-counted the deletion and shifted every following line number.

Deferred out of this theme, now in [`outstanding.md`](outstanding.md): syntax highlighting
inside diff lines, and a side-by-side mode.

## Theme E — Remotes and forge links · M

Nothing in the repo models a git remote today — no domain type, and no command ever runs
`git remote -v`. `#123` links need it, and so does everything "open on GitHub"-shaped later.

- [ ] `shared/src/domain/remote.ts` — `Remote {name, fetchUrl, pushUrl}` + a derived `forge {host, owner, repo, kind: 'github'|'gitlab'|'unknown'}` **S**
- [ ] `git-engine/src/commands/remotes.ts` — `listRemotes` via `git config --get-regexp '^remote\..*\.url$'` (more parseable than `git remote -v`), NUL-safe **S**
- [ ] **URL normaliser**, pure + unit-tested: `git@github.com:o/r.git`, `ssh://git@host:22/o/r.git`, `https://host/o/r.git`, and self-hosted GitLab subpaths all → `{host, owner, repo}`. Unknown hosts degrade to `kind: 'unknown'` and simply do not linkify **M**
- [ ] Issue-URL builder: GitHub `/{owner}/{repo}/issues/{n}`, GitLab `/{owner}/{repo}/-/issues/{n}` **S**
- [ ] Channel `mgit:remotes:list` + a **`mgit:shell:open-external`** channel whose schema `refine`s to http/https only — a renderer-supplied `file://` or `javascript:` must never reach `shell.openExternal` **M**
- [ ] Expose `shell` and `remotes` on the bridge + preload `Pick<>`; extend `ipc.test.ts` coverage **S**

## Theme F — Graph row polish · S/M

- [ ] Selected-row treatment: `bg-accent/70` reads as barely-distinct from `hover:bg-accent/30`. Give selection a left accent bar or a stronger tint so the selected row is unambiguous in the screenshot **S**
- [ ] Lane colour contrast pass in [`lane-colors.ts`](../packages/app/src/features/graph/lane-colors.ts) — verify adjacent lane colours are distinguishable in both light and dark, and for the common colour-vision deficiencies **S**
- [ ] Description column: badges currently share a `shrink` group with the subject, so a long branch name eats the message. Give badges a max share and truncate them first **S**
- [ ] Row density option (comfortable/compact) driven from `ROW_HEIGHT` in [`graph-svg.tsx`](../packages/app/src/features/graph/graph-svg.tsx#L21) — the virtualizer already reads it; verify the SVG geometry scales rather than clipping **M**
- [ ] The uncommitted-changes pseudo-row gets visually distinguished from real commits (dashed node, muted text) **S**

---

## Files this phase touches

| Area | Files |
|---|---|
| Contract | [`shared/src/ipc/channels.ts`](../packages/shared/src/ipc/channels.ts) · [`schemas.ts`](../packages/shared/src/ipc/schemas.ts) · [`bridge.ts`](../packages/shared/src/ipc/bridge.ts) · [`domain/remote.ts`](../packages/shared/src/domain/) *(new)* · [`ipc.test.ts`](../packages/shared/src/ipc/ipc.test.ts) |
| Engine | [`commands/log.ts`](../packages/git-engine/src/commands/log.ts) · `commands/remotes.ts` *(new)* · `commands/diff.ts` · `parsers/diff-parser.ts` *(new)* |
| Main | [`main/ipc/`](../packages/desktop/src/main/ipc/) *(new handlers)* · [`preload/index.ts`](../packages/desktop/src/preload/index.ts) |
| Renderer | [`features/commit/commit-detail.tsx`](../packages/app/src/features/commit/commit-detail.tsx) *(rebuild)* · `features/commit/{linkify,file-tree,commit-header}.tsx` *(new)* · `features/diff/diff-view.tsx` *(new)* · [`features/status/file-diff.tsx`](../packages/app/src/features/status/file-diff.tsx) · [`features/graph/ref-badge.tsx`](../packages/app/src/features/graph/ref-badge.tsx) · [`use-graph-actions.ts`](../packages/app/src/features/graph/use-graph-actions.ts) · [`graph-row.tsx`](../packages/app/src/features/graph/graph-row.tsx) · [`graph-store.ts`](../packages/app/src/features/graph/graph-store.ts) · [`lane-colors.ts`](../packages/app/src/features/graph/lane-colors.ts) · [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts) · [`services/queries.ts`](../packages/app/src/services/queries.ts) · [`services/watch-invalidation.ts`](../packages/app/src/services/watch-invalidation.ts) · [`tailwind.config.ts`](../packages/app/tailwind.config.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green; no boundary-lint exception added anywhere
- [x] **A renderer test harness exists.** ✅ DONE — Playwright driving the real app against a mocked `window.midniteGit` ([`packages/app/e2e/`](../packages/app/e2e/), `moon run app:e2e`), chosen over an RTL/jsdom harness because the bridge *is* the renderer's only route to main, so replacing it covers every UI path without Electron, a repo or a git binary. `@testing-library/react` remains unused; drop it or adopt it when a non-visual component needs a unit test.
- [ ] Unit tests: linkify matcher (incl. the false-positive cases), diff hunk parser (rename/binary/mode-only/no-EOL/empty), remote URL normaliser (ssh/https/self-hosted)
- [ ] Integration test for `readCommitDetail`'s new fields and the commit-scoped file diff, using [`TempRepo`](../packages/git-engine/src/testing/temp-repo.ts)
- [ ] Manual: click a parent SHA in a commit body → the sidebar follows, **including for a commit below the loaded graph window**
- [ ] Manual: a commit whose message contains a URL, a `#123`, a bare SHA and a `Co-Authored-By` trailer renders all four correctly against a real GitHub remote — and against a repo with **no** remote (must degrade, not error)
- [ ] Manual: copy button puts the full 40-char sha on the clipboard **in the packaged app**, not just the dev server
- [ ] Manual: a branch that is ahead, one behind, one diverged, and one with no upstream each show the right hover affordance and the right tooltip text; pushing/pulling from the badge updates the counts without a manual refresh (watch invalidation)
- [ ] Reduced motion (`html[data-motion='reduced']`) stops the badge pulse
- [ ] Screenshot captured: inspector in tree mode with a diff open, and a diverged branch badge hover-expanded

## Decisions / open questions

1. **"Gradient glow pulsating effect should have a sub…"** — the seed line was cut off. Planned as *subtle*: low-opacity, slow, no reflow. If it meant a **sub-label** (upstream name under the badge name), say so and Theme C grows one item. — *unresolved, assumption stated*
2. **Markdown + linkify, not linkify alone** — resolved. Accepted cost: a runtime dependency and the rule that raw HTML in commit messages stays inert (no `rehype-raw`).
3. **`#123` links are in scope**, which is why Theme E exists — resolved. Worth noting E is ~5 files across all four packages for one link type; its real payoff is the "open commit/branch/PR on the forge" verbs that become trivial afterwards.
4. **`stat` gets dropped from `CommitDetailResponse`** rather than left unused. — *deferred to Theme B: Theme D removed the `<pre>` that rendered it, so the field is now unread but still on the wire.*
5. **Clipboard via Electron's `clipboard` module**, not `navigator.clipboard`, because the packaged app is a `file://` origin and may not be a secure context. — *recommended, still open (Theme B)*
6. **No syntax highlighting inside diff lines** — *resolved, deferred.* Word-level intraline marking landed instead, which is what actually distinguishes a one-token edit from a rewrite.
7. **No side-by-side diff** — *resolved, deferred.* The inspector is a narrow panel; split view earns its keep only in a full-width diff surface, which does not exist yet.
8. **Navigation history (back/forward through selected commits)** — deliberately left out. Add it if clicking parents proves disorienting in use; it would register in the Phase 9 keybinding registry. — *deferred*
9. **Theme ordering under `/exec`:** E before A (A's `#123` links need it), otherwise free. B and D pair naturally; C and F are fully independent and are the best candidates to run in parallel.
