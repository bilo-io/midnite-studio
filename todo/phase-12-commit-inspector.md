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

## Theme A — Rendered commit message with live references · M — ✅ DONE (2026-08-26)

Landed on `feature/phase-12-inspector`. Markdown first (`react-markdown` + `remark-gfm`, no
`rehype-raw`), then a rehype pass that linkifies references in the resulting text nodes — in
that order, because at the hast stage a code span is a real `code` element, so "don't linkify
inside a fence" is an ancestor test rather than a lookaround in a regex. Items moved to
[`done.md`](done.md).

Three matcher decisions turned out to be load-bearing, and each has a test:

- **URL wins the alternation.** `https://github.com/o/r/commit/7c521fed00d` contains a valid
  abbreviated sha and an issue-shaped fragment; SHA-first shreds it into three links, one of
  which navigates the inspector somewhere unrelated.
- **An abbreviation needs both a digit and a hex letter.** `deadbeef`, `facade` and `defaced`
  are pure hex and pure English; `12345678` is a record count. It costs ~3.7% of genuine
  7-character shas, and that is the right trade — a missed link renders as the text the author
  typed, a false one is a control that goes somewhere unrelated.
- **`#\d{1,7}` needs its trailing `(?!\d)`.** Without it `#12345678` links `#1234567` and
  orphans the `8`: a link to a real but unrelated issue, which beats no link only in the sense
  that it is harder to notice.

The one defect that survived into review was about ancestry: `unist-util-visit` hands a visitor
only the *immediate* parent, so `a > strong > text` — what a markdown link with a bold label
produces — passed the opacity check and was linkified inside the anchor. A control nested in a
link fires both on one click, so `[**deadbeef1**](https://evil.example)` in a commit message
would select a commit *and* open the URL. The walk is written out now, carrying an inherited
flag, which also dropped the dependency.

## Theme B — Inspector panel rebuild · L — ✅ DONE (2026-08-26)

Landed on `feature/phase-12-inspector`. A real header (full sha + copy button, author/committer
identities, parents as clickable short shas), a collapsible file tree with a list alternative,
and a draggable split between the file list and the diff. Items moved to [`done.md`](done.md).

Three contract changes came with it: `CommitDetailResponse` gained `parents`, `subject`,
`author` and `committer` and lost `stat` — and with `stat`, one of the three `git show`
invocations per selection; `readCommitDetail` returns **null** for a sha the repo does not have,
rather than the empty-but-well-formed record that conflated "repo closed" with "no such commit";
and a new `mgit:repo:rev-parse` channel resolves an abbreviation *before* it becomes a selection,
because the selection is also what the graph highlights and what the diff key is built from.

Beyond the plan, three of the four review findings were about *when* rather than *what*:

- **Resetting selection in an effect is one render too late.** The render that first observes a
  new sha still holds the previous commit's path, and issues a real `git diff` for it — cached
  under `staleTime: Infinity`. Theme D hit this same shape once already; the fix is the one
  `useContextReset` in `use-file-diff.ts` already uses.
- **Absolute pixel bounds cannot know how tall the window is.** A 720px file list in a short
  window collapsed the message above and the diff below to nothing, persistently, leaving a
  zero-height handle as the only way back.
- **react-markdown keys its element map by component identity**, so a `components` object built
  inline remounts every sha button on each render and drops keyboard focus.

## Theme C — Ref badges as a control surface · M — ✅ DONE (2026-08-26)

Landed on `feature/phase-12-badges-rows`, together with Theme F. The chip is a control now:
the checked-out one glows, and one that is ahead or behind expands on hover into the buttons
that fix it. Items moved to [`done.md`](done.md).

Three decisions worth carrying forward:

- **The verbs are derived once, as data.** `syncActions(ref, currentBranch, remoteNames)` returns
  the four verbs with their enablement and their reason already resolved, and the hover buttons
  and the context menu both render that array. Deriving twice is how a menu ends up offering a
  pull the button greys out.
- **Push is not restricted to the checked-out branch; pull is.** The push refspec names the
  branch, so it works from anywhere; `git pull` merges into HEAD and nothing else. The one
  exception is a branch tracking a *differently named* upstream (`main` → `origin/trunk`): the
  request carries a single `branch`, not a `local:remote` pair, so pushing it by name would
  create `origin/main` beside the `origin/trunk` it meant to update. It now omits the branch and
  lets git resolve the destination from the branch's own config — which it can only do on the
  branch you are standing on, so that is the one push that asks for a checkout first.
- **Reduced motion got a design, not a disabled feature.** The glow is two layers: a still halo
  that stands on its own, and a gradient border sweeping over it. The sweep is an animation, so
  `html[data-motion='reduced']` stops it — and stopping it leaves the halo rather than a frozen
  frame of something that was meant to move.

Beyond the plan, the overlay had to be **portalled**. An absolutely-positioned strip inside the
row is clipped by the BRANCH / TAG cell's `overflow-hidden` — and a clipped element still has a
bounding box, so it reads as "visible" to a test while being entirely absent for the user. Each
virtualized row also carries a `transform`, which makes it the containing block for `fixed`
descendants and opens a stacking context: the same two traps `Tooltip` already documents. An
e2e assertion that the subject column does not move on hover is what caught it.

## Theme D — Real diff rendering · L — ✅ DONE (2026-08-25)

Landed on `feature/phase-12-diffs`. Diffs are parsed in main and painted by one
`<DiffView>` shared by the inspector and the status panel. Items moved to
[`done.md`](done.md).

Beyond the plan, this shook out a set of cases where the pane rendered something
plausible that was simply not the file in front of you — the failure mode a diff
viewer can least afford, because nothing about it looks wrong:

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
- **`git diff` on an unmerged path emits a *combined* diff** — `@@@ -1,3 -1,3 +1,7 @@@`,
  one marker column per parent. An `^@@ -`-anchored parser matches none of it, so
  mid-merge the one file you most need to see reported "No changes to show for this
  file." The parser now reads N-parent headers and flags `combined`, and the view says
  the old line numbers are the first parent's.
- **A pathspec is glob-matched.** `pages/[id].tsx` is a character class matching
  `pages/i.tsx`, so the pane rendered a *different file's* content under the requested
  name. `--literal-pathspecs` fixes it — and it is a MAIN git option, not a subcommand
  one: `git diff --literal-pathspecs` exits 255, which reads downstream as an empty diff
  rather than as an error.
- **"No output and not staged" is not the same as "untracked".** A tracked file with
  nothing unstaged looks identical, and the `/dev/null` fallback painted it entirely
  green. Now settled with `ls-files --error-unmatch`.
- **A query outside the invalidation prefix is never refreshed.** The diff key sat at
  `['diff', …]` rather than under `keys.status`, and with the client's
  `staleTime: Infinity` the pane kept its first-loaded hunks for the life of the process
  — through edits, stages and discards.
- **Resetting state in an effect is one render too late.** The context reset ran after
  the render that had already issued a query, so the click following a "show the whole
  file" fetched the *next* file in full — exactly what the reset exists to prevent.
- **The dev port is contended across worktrees.** Playwright's `reuseExistingServer`
  attached to whichever Vite got to 5173 first, silently running the suite against
  another checkout's source. The e2e config owns its own port now.

Deferred out of this theme, now in [`outstanding.md`](outstanding.md): syntax highlighting
inside diff lines, and a side-by-side mode.

## Theme E — Remotes and forge links · M — ✅ DONE (2026-08-26)

Landed on `feature/phase-12-remotes`. `Remote {name, fetchUrl, pushUrl, forge}` ships from main
with the URL already normalised; the renderer reads it through `useRemotes` and each Remotes
group in the sidebar gains a link to its project page. Items moved to [`done.md`](done.md).

Two decisions worth carrying forward:

- **The normaliser lives in git-engine, and `forge` ships on the wire.** The renderer may not
  import git-engine, so deriving it on that side would mean a second implementation of git's five
  remote-URL syntaxes — exactly the kind of duplicate that agrees until it doesn't. The pure
  *consumers* of the derived shape (`pickForgeRemote`, the issue/project URL builders) do live in
  `shared`, because both sides want them.
- **`openExternal` also accepts `mailto:`**, not just http/https. Theme A linkifies the author
  emails a commit trailer is full of, and routing those through the same guarded channel beats a
  second channel with a second, weaker check.

Beyond the plan, the guard needed to be more than a schema refine: main re-checks on the line
that makes the call and opens the *normalised* href, because the URL parser strips leading
control characters — so `\njavascript:` and `javascript:` validate identically and only one of
them is the string the OS would otherwise have received. See [`done.md`](done.md) for the rest,
including the `github.com.evil.example` classification hole and the `decodeURIComponent` throw.

## Theme F — Graph row polish · S/M — ✅ DONE (2026-08-26)

Landed with Theme C. Items moved to [`done.md`](done.md).

The lane-contrast item turned out to be the substantial one. The palette held every lane inside
a 0.63–0.77 band of perceptual lightness, which looks tidy and is exactly what breaks it:
red–green deficiency collapses hue, and two equally-light lanes then have nothing left to tell
them apart. Simulated protanopia put violet and indigo **0.0097 apart in OKLab** — one colour,
on a graph whose entire job is telling branches apart. The retune spreads lightness deliberately
and takes the worst pair under any simulated deficiency to 0.068, a 7× improvement;
`lane-contrast.test.ts` measures it under normal/protan/deutan/tritan vision and fails if a
future edit gives it back.

That also exposed a real bug it had been hiding: `laneInk` flipped on the **HSL** lightness
component, which is not a measure of how light a colour looks. At `l: 48%` the cyan is the
brightest thing in the palette and was being handed white ink. It compares actual WCAG contrast
ratios now and takes the winner, so there is no threshold left to land on the wrong side of —
and the old test could not have caught it, because it restated the same wrong rule.

Row density became a second axis rather than five more styles, bounded by the drawing rather
than by taste: `scaleTheme` shrinks the node a little and the row a lot, and `minRowHeight`
stops the compression where the geometry would break. A flat 0.8 multiplier put `git-graph`'s
arriving segment at 3px, under `MIN_ARROW_RUN` — an arrowhead overhanging the row edge above a
line too short to see.

**One item was not in the repo to polish.** The last checklist entry assumed an
uncommitted-changes pseudo-row existed; nothing in `features/graph/` rendered one. It was built
rather than deferred — dashed node, dashed lane, italic count, click-through to Changes — as a
sibling of the scroller rather than a synthetic `GraphRow`, so the virtualizer's index space is
still exactly the commits.

---

## Files this phase touches

| Area | Files |
|---|---|
| Contract | [`shared/src/ipc/channels.ts`](../packages/shared/src/ipc/channels.ts) · [`schemas.ts`](../packages/shared/src/ipc/schemas.ts) · [`bridge.ts`](../packages/shared/src/ipc/bridge.ts) · [`domain/remote.ts`](../packages/shared/src/domain/) *(new)* · [`ipc.test.ts`](../packages/shared/src/ipc/ipc.test.ts) |
| Engine | [`commands/log.ts`](../packages/git-engine/src/commands/log.ts) · `commands/remotes.ts` *(new)* · `commands/diff.ts` · `parsers/diff-parser.ts` *(new)* |
| Main | [`main/ipc/`](../packages/desktop/src/main/ipc/) *(new handlers)* · [`preload/index.ts`](../packages/desktop/src/preload/index.ts) |
| Renderer | [`features/commit/commit-detail.tsx`](../packages/app/src/features/commit/commit-detail.tsx) *(rebuild)* · `features/commit/{linkify,file-tree,commit-header}.tsx` *(new)* · `features/diff/diff-view.tsx` *(new)* · [`features/status/file-diff.tsx`](../packages/app/src/features/status/file-diff.tsx) · [`features/graph/ref-badge.tsx`](../packages/app/src/features/graph/ref-badge.tsx) · [`use-graph-actions.ts`](../packages/app/src/features/graph/use-graph-actions.ts) · [`graph-row.tsx`](../packages/app/src/features/graph/graph-row.tsx) · [`graph-store.ts`](../packages/app/src/features/graph/graph-store.ts) · [`lane-colors.ts`](../packages/app/src/features/graph/lane-colors.ts) · [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts) · [`services/queries.ts`](../packages/app/src/services/queries.ts) · [`services/watch-invalidation.ts`](../packages/app/src/services/watch-invalidation.ts) · [`tailwind.config.ts`](../packages/app/tailwind.config.ts) |

## Verification

- [x] `moon run :typecheck :lint :test` green; no boundary-lint exception added anywhere ✅ (715 unit tests + the e2e suite)
- [x] **A renderer test harness exists.** ✅ DONE — Playwright driving the real app against a mocked `window.midniteGit` ([`packages/app/e2e/`](../packages/app/e2e/), `moon run app:e2e`), chosen over an RTL/jsdom harness because the bridge *is* the renderer's only route to main, so replacing it covers every UI path without Electron, a repo or a git binary. `@testing-library/react` remains unused; drop it or adopt it when a non-visual component needs a unit test.
- [x] Unit tests: linkify matcher (incl. the false-positive cases), diff hunk parser (rename/binary/mode-only/no-EOL/empty), remote URL normaliser (ssh/https/self-hosted) ✅ — plus the rehype plugin's ancestor rule, the trailer splitter and the file-tree collapse
- [x] Integration test for `readCommitDetail`'s new fields and the commit-scoped file diff, using [`TempRepo`](../packages/git-engine/src/testing/temp-repo.ts) ✅ — merge commits, root commits, unknown shas and annotated-tag peeling
- [x] Click a parent SHA in a commit body → the sidebar follows, **including for a commit below the loaded graph window** ✅ — covered by [`commit-inspector.spec.ts`](../packages/app/e2e/commit-inspector.spec.ts); the fixture graph holds one row and the linkified target is not it
- [x] A commit whose message contains a URL, a `#123`, a bare SHA and a `Co-Authored-By` trailer renders all four correctly against a GitHub remote — and against a repo with **no** remote ✅ (e2e, mocked bridge). ⏳ Still worth one pass against a real clone.
- [x] A branch that is ahead, one behind, one diverged, and one with no upstream each show the
      right hover affordance and the right tooltip text ✅ — covered by [`ref-sync.spec.ts`](../packages/app/e2e/ref-sync.spec.ts)
      against the mocked bridge, including that the op reaches git scoped to the right branch
- [x] Reduced motion (`html[data-motion='reduced']`) stops the badge pulse ✅ — and leaves the
      still halo behind rather than nothing; the sweep is the only animated layer
- [x] Screenshot captured: inspector in tree mode with a diff open ✅ ([`docs/screenshots/phase-12/`](../docs/screenshots/phase-12/), regenerated by the e2e suite)
- [x] Screenshot captured: a diverged branch badge hover-expanded, the selected row + working-copy
      row, the density picker, and the graph at compact density
      ([`docs/screenshots/phase-12-badges-rows/`](../docs/screenshots/phase-12-badges-rows/)) ✅
- [ ] Manual: copy button puts the full 40-char sha on the clipboard **in the packaged app**, not just the dev server — *the e2e asserts the bridge is handed all 40 characters; the `file://` secure-context question can only be answered in the dmg*
- [ ] Manual: pushing/pulling from the badge updates the counts against a REAL remote without a
      manual refresh (watch invalidation) — the mocked bridge cannot prove this one

## Decisions / open questions

1. **"Gradient glow pulsating effect should have a sub…"** — the seed line was cut off. Resolved
   as *subtle*: a still halo plus a slow gradient border sweep, no reflow, and the halo alone
   under reduced motion. The upstream name did end up under the chip, but in the tooltip rather
   than as a sub-label — the chip is 11px in a 180px column and had no room for a second line.
2. **Markdown + linkify, not linkify alone** — resolved. Accepted cost: a runtime dependency and the rule that raw HTML in commit messages stays inert (no `rehype-raw`).
3. **`#123` links are in scope**, which is why Theme E exists — resolved. Worth noting E is ~5 files across all four packages for one link type; its real payoff is the "open commit/branch/PR on the forge" verbs that become trivial afterwards.
4. **`stat` gets dropped from `CommitDetailResponse`** rather than left unused. — *resolved in Theme B: the field is gone, and so is the `git show --stat` invocation that produced it.*
5. **Clipboard via Electron's `clipboard` module**, not `navigator.clipboard`, because the packaged app is a `file://` origin and may not be a secure context. — *resolved in Theme B: `mgit:clipboard:write-text`, write-only (no `readText`, so renderer code cannot observe whatever the user last copied anywhere).*
6. **No syntax highlighting inside diff lines** — *resolved, deferred.* Word-level intraline marking landed instead, which is what actually distinguishes a one-token edit from a rewrite.
7. **No side-by-side diff** — *resolved, deferred.* The inspector is a narrow panel; split view earns its keep only in a full-width diff surface, which does not exist yet.
8. **Navigation history (back/forward through selected commits)** — deliberately left out. Add it if clicking parents proves disorienting in use; it would register in the Phase 9 keybinding registry. — *deferred*
9. **Theme ordering under `/exec`:** E before A (A's `#123` links need it), otherwise free. B and D pair naturally; C and F are fully independent and are the best candidates to run in parallel. — *resolved: A, B, D and E landed first; C and F then landed together as one slice, and did not touch anything A or B needs.*
10. **`git pull` for a branch you are not on** — deliberately left out rather than implemented as
    `fetch` + a fast-forward-only ref update. That is a new engine command and a new failure mode
    (non-fast-forward) this phase did not scope; the menu item is disabled with the reason
    instead. Revisit if reaching for it proves common.
