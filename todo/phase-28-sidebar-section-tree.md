# Phase 28 — Worktrees first, and the section tree that can say so

[`view-sections.ts`](../packages/app/src/features/repos/view-sections.ts) exports `ALL_SECTIONS`
under the comment *"Every section, in the order the tree renders them."* That sentence is not true
and has not been true since Phase 17 wrote it. The order it declares is `local, remotes, tags,
worktrees`; the order the sidebar actually renders is whatever order the four literal
`<TreeSection>` blocks happen to sit in inside `RepoTree` — which today is the same order, by
coincidence and by nobody's decision. Reordering the sidebar means moving JSX, and the constant that
claims to own the order gets to keep claiming it. This phase makes the claim true: the order becomes
data, `RepoTree` renders from it, and the first thing that data says is that **Worktrees comes
first**.

The nesting arrives with it. `RefSectionKey` has held `local` and `remotes` side by side as peers
since Phase 4, and [`repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx) carries
an explicit comment defending that arrangement:

> *"'Local', not 'Branches': the section below it is remote branches too, and a heading that only
> says 'Branches' leaves the reader to work out which of the two they are looking at."*

The objection is correct about a *rename* and says nothing about a *parent*. A `Branches` heading
that owns `Local` and `Remotes` as children resolves it rather than contradicting it — the reader is
never left working out which of the two they are looking at, because both are still labelled and
both are still there, one level down. The comment is now false as written, and Theme H rewrites it,
the same way Phase 24 rewrites Phase 16's four "read-only" doc comments rather than leaving them to
mislead.

**Nothing here is new capability.** This phase adds no git command, no IPC channel, no zod schema and
no query. `packages/shared` and `packages/git-engine` are untouched. It is renderer structure and one
store key, and its whole value is that the next phase to add a section registers one instead of
hand-editing six files — which is exactly what Phase 22 Theme B is currently written to do.

**Builds on.** Phase 4 (the repositories sidebar and the worktree section), Phase 13 (`TreeSection`
promoted out of the status panel, and `TREE_INDENT`), Phase 16 (the grouped, collapsible settings
sidebar — the precedent for `collapsedSettingsGroups`), Phase 17 (`view-sections.ts`, `VIEW_FILTERS`,
`sectionMenu`, the per-worktree counts and the forge sections), Phase 19 (the nav rail's
`collapsedNavSections`, the second precedent).

**Scope guardrails.** **The tree is declared once.** After Theme A there is exactly one place that
says what sections exist, what order they are in, and which owns which — and a renderer that reads
that place. A section rendered from a literal JSX block that the declaration does not know about is
the bug this phase exists to make impossible. **A parent is never a fifth thing to fetch.** `Branches`
and `Forge` own children and render a count; they have no data of their own, no query, and no empty
state that is not simply "every child is empty". **The reserved slot renders nothing.** `stashes`
enters the declaration in Theme A and renders nowhere until Phase 22 supplies it — a section heading
with no data behind it is worse than no heading. **Folds are per repo, not global.** Two repositories
open at once must be able to disagree about whether Remotes is folded; that is the whole reason the
existing state is per-`RepoTree` and the reason the persisted key is a map rather than a list.
**Visual parity at depth 1.** Worktrees, Tags and the forge sections must look byte-identical after
Theme C — only their position changes. Anything that moves *down* a level is expected to move; nothing
that stays at depth 1 may shift by a pixel.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The section tree becomes data (M) ✅ DONE (2026-08-28)

Pure, DOM-free and testable, in the module that already claims to own this. Everything else reads off
this shape, so it lands first.

- [x] `SectionKey` in [`view-sections.ts`](../packages/app/src/features/repos/view-sections.ts) gains
      `'branches'`, `'forge'` and `'stashes'`. `RefSectionKey` is **unchanged** — a parent has no refs
      and `sectionMenu` has nothing to build from one, which is the same reason the narrower union
      exists at all.
- [x] `SectionNode` type: `{ key: SectionKey; children?: readonly SectionNode[] }`, and
      `SECTION_TREE: readonly SectionNode[]` as the single ordered declaration —
      `worktrees`, `branches → [local, remotes]`, `tags`, `stashes`, `forge → [actions, reviews,
      issues, tests]`.
- [x] `ALL_SECTIONS` is **derived** from `SECTION_TREE` by a `flattenSections()` walk rather than
      hand-written, so the two can no longer disagree. Its doc comment stops being aspirational.
- [x] `parentOf(key): SectionKey | null` and `childrenOf(key): readonly SectionKey[]` as exported
      lookups built once from the tree, so no consumer walks it by hand.
- [x] `VIEW_FILTERS` reworked so a filter may name a parent and mean its subtree: `sections:
      ['worktrees']` keeps meaning exactly what it means today, and `expandFilter(sections)` resolves
      a named parent to itself plus its descendants before `visible()` consults it. The
      `WORK_IN_PROGRESS` and `UNFILTERED` constants keep their current meaning — `UNFILTERED` is now
      `ALL_SECTIONS` including the parents, which is what makes a parent visible at all.
      `expandFilter` also walks a named leaf's ancestors, not just a named parent's descendants —
      otherwise today's leaf-only entries (`actions`, `reviews`, `issues`, `tests`) could never make
      `Forge` answer "admitted" once Theme F nests a heading over them.
- [x] `useViewSections().visible(key)` unchanged in signature. Its behaviour for a **parent** is new
      and is the load-bearing rule: a parent is visible when the filter admits it **and** at least one
      child is visible. A parent whose children are all filtered away does not render an empty
      heading. The rule (`isSectionVisible`) recurses through `childrenOf` rather than assuming one
      level of nesting, and is exported as a pure function so it needs no React to test.
- [x] Vitest in [`view-sections.test.ts`](../packages/app/src/features/repos/view-sections.test.ts):
      `ALL_SECTIONS` equals the flattened tree; every `SectionKey` appears exactly once in
      `SECTION_TREE`; `parentOf` round-trips against `childrenOf`; a filter naming `branches` admits
      `local` and `remotes`; a filter naming only `worktrees` hides `branches`; the existing per-view
      expectations still hold unmodified (25 tests, up from 15).
- [x] *(incidental, forced by the type change)* `SECTION_LABELS` in
      [`sidebar-page.tsx`](../packages/app/src/features/settings/settings-pages/sidebar-page.tsx) —
      Theme G's own record — gained placeholder entries for `branches`/`forge`/`stashes` because it is
      `Record<SectionKey, string>` and the widened union made it a compile error otherwise. Theme G
      still owns making `describeNarrowed` read the nesting; these three labels never render today
      since no `VIEW_FILTERS` entry names a parent.

### B — The indent ladder gets a fifth rung (S) ✅ DONE (2026-08-28)

Small, mechanical, and it must land before C or the nesting has nowhere to go.

- [x] [`tree-indent.ts`](../packages/app/src/components/tree-indent.ts): `TREE_INDENT` gains a fifth
      entry (`pl-17`, keeping the 12px step), and its table comment is rewritten for the new ladder —
      `0` panel sections, `1` a repository's top-level sections, `2` a nested section, `3` their rows
      and a group heading, `4` a group's own rows.
- [x] [`tree-section.tsx`](../packages/app/src/components/tree-section.tsx): the `depth` prop widens
      from `0 | 1 | 2` to `0 | 1 | 2 | 3`, and its doc comment follows the new ladder. Nothing else in
      the component changes — it already indexes `TREE_INDENT` by depth.
- [x] `RemoteGroup` in [`repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx) moves
      from `depth={2}` to `depth={3}`, and the `RefRow`s inside it from `3` to `4`.
- [x] Local branch `RefRow`s move from `depth={2}` to `depth={3}`; `WorktreeRow` and the Tags rows
      stay at `2`, because their sections stay at depth 1.
- [x] The nested run groups in
      [`forge-sections.tsx`](../packages/app/src/features/repos/forge-sections.tsx) and their `Note`
      rows are left at their current rung — Theme F, not this slice, is what nests them under Forge,
      and `SECTION_BODY['forge']` (Theme C) mounts them exactly as before until then.
- [x] Confirmed the deepest row (`origin/some-long-branch-name` at depth 4) at the panel's true
      180px `LAYOUT_BOUNDS.reposWidth.min` (dragged the real splitter, not a simulated width): it
      truncates with an ellipsis exactly like every shallower row already does at that width — the
      12px step introduces no new breakage, so no rung-4-only tightening is needed.
- [x] **Bug found and fixed**: `pl-17` is not a Tailwind default-scale utility (the scale jumps
      `14 → 16 → 20`, skipping `17`), so it silently generated no CSS — depth-4 rows (a remote's
      branches) rendered flush left, outside the tree's indentation entirely, escaping their
      collapsible container visually. Fixed by adding `spacing: { 17: '4.25rem' }` to
      `tailwind.config.ts`'s `theme.extend`, continuing the existing +12px step. Caught via a
      Playwright screenshot with a real `origin` remote group — not by the vitest suite, which never
      renders real CSS.

### C — `RepoTree` renders from the tree (M) ✅ DONE (2026-08-28)

The theme that deletes the coincidence. Four hand-written blocks become one recursive renderer that
cannot render a section the declaration does not contain.

- [x] A `renderSection(node: SectionNode)` walk inside `RepoTree`
      ([`repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx)) driven by
      `SECTION_TREE`, replacing the four literal `<TreeSection>` blocks and their source order.
- [x] A `SECTION_BODY` map from leaf `SectionKey` to the renderer for its rows, so each section's body
      keeps the code it has today — the extraction is a move, not a rewrite. `stashes` has no entry
      and renders nothing (see the scope guardrail).
- [x] `SECTION_TITLE` widens from `Record<RefSectionKey, string>` to `Record<SectionKey, string>` and
      gains `Branches`, `Stashes` and `Forge`. Its exhaustive `Record` is what makes a forgotten label
      a compile error rather than an `undefined` heading.
- [x] A parent `TreeSection` renders its children as its `children`, at `depth + 1`, and passes
      `hideWhenEmpty={false}` down to nothing — emptiness is still each leaf's own business, and a
      parent's own visibility comes from Theme A's `visible()` rule.
- [x] Worktrees renders first, and its section is otherwise **unchanged** — same `WorktreeRow`, same
      `worktreeHealth`, same counts, same menu. The promotion is positional only.
- [x] `ForgeSections` and `TestsSection` keep their own components and are mounted **by** the walk
      rather than after it, so their position is declared in the same place as everything else.
      `ForgeSections`' `index` prop (`worktrees.length` before) is now `forgeIndex`, recomputed from
      `ALL_SECTIONS`' own order rather than a positional guess.
- [x] Vitest in [`repos-panel.test.ts`](../packages/app/src/features/repos/repos-panel.test.ts) (moved
      to `.test.tsx` — the first RTL-rendered test in this file): the rendered heading order matches
      the flattened, visibility-filtered tree, Worktrees first, and a parent (`Branches`) disappears
      entirely once every child is filtered away.

### D — Folds survive (M) — ✅ DONE (2026-08-28)

`useSectionToggles()` is a per-`RepoTree` `useState` of *closed* keys, deliberately scoped "while the
repo stays expanded". Re-parenting is the moment to fix it: the keys are changing anyway, and a
five-level tree that forgets its shape on every repo collapse is meaningfully worse than a flat one
that does.

- [x] `collapsedRepoSections: Record<string, string[]>` joins `UiState` in
      [`ui-store.ts`](../packages/app/src/store/ui-store.ts), keyed by repo id, holding *closed*
      sections — same inversion, same reason, as the `collapsedNavSections` and
      `collapsedSettingsGroups` it sits beside. Value type is `string[]` from the start (not
      `SectionKey[]`), for the reason the `RemoteGroup` bullet below gives.
- [x] `toggleRepoSection(repoId, key: SectionKey)`, but not on the store: it lives in
      [`view-sections.ts`](../packages/app/src/features/repos/view-sections.ts) as a typed wrapper
      around the store's untyped `toggleRepoSectionKey(repoId, key: string)`, because `ui-store.ts`
      cannot import `SectionKey` without a cycle (`view-sections.ts` already imports `useUiStore`).
      `pruneRepoSections(repoId)` joins it on the store.
- [x] `collapsedRepoSections` added to the `PersistedUi` union and to `partialize`, and the persist
      `version` bumped `2 → 3` with a `migrate` arm that supplies `{}` for a v2 payload. The union
      type exists precisely so this cannot be half-done.
- [x] `useSectionToggles(repoId)` reads and writes the store instead of local state, and now takes
      the repo id it never needed before. Returns `{ section, remoteGroup }`: `section(key)` is the
      typed getter the four `SectionKey` call sites already used; `remoteGroup(name)` is `RemoteGroup`'s
      own, over the composite key below.
- [x] `RemoteGroup`'s bare `useState(true)` is gone — `open`/`onToggle` are now props, computed by
      `RepoTree` via `useSectionToggles`'s `remoteGroup(name)` against the composite key
      (`remotes:origin`), so folding `origin` is remembered like everything else in the tree.
- [x] Pruning: **not `repo-lifecycle.ts`** — that file guesses install/build/test/launch commands
      and has nothing to do with a repo leaving. The real precedent was `workbench.tsx`'s own
      `useEffect` reconciling `useRepos()` against its tabs; extracted into a new
      `use-prune-closed-repos.ts` that prunes both `workbench-store`'s tabs and
      `collapsedRepoSections` from one place, mounted once from `Shell` (`app.tsx`) rather than
      from `Workbench` — which only renders while the Changes view is active, so a repo closed
      while looking at the Graph used to keep its tabs and folds around unpruned.
- [x] Vitest on the store (`ui-store.test.ts`, `describe('repo section folds')`): toggling twice
      returns to the initial state; two repo ids hold independent sets; a composite `RemoteGroup`
      key joins the same map; pruning drops one repo's entry without touching another's, and is a
      no-op for a repo with none; the fold map persists; a v2 persisted payload migrates to an
      empty fold map without dropping `collapsedNavSections`.
- [x] Playwright (`e2e/repo-section-folds.spec.ts`, new): folding `Remotes` survives collapsing and
      re-expanding the repo row (which unmounts `RepoTree` outright — the regression a per-mount
      `useState` could not survive) and a full reload; a `RemoteGroup`'s own fold persists across a
      reload independently of `Remotes`.

### E — The Branches heading earns itself (S) — ◐ PARTIAL (2026-08-28)

- [x] The `Branches` heading carries a combined count — local branches plus remote-tracking branches,
      matching how each child already counts (`branches.length`, `remoteGroups.length`) rather than
      inventing a third arithmetic. Landed as a pure, unit-tested `branchesCount()` plus a
      `SECTION_COUNT` lookup table read by `renderSection`'s generic parent-wrapping branch.
- [x] A heading `⋮` menu for `branches` via a new arm in
      [`use-repo-actions.ts`](../packages/app/src/features/repos/use-repo-actions.ts)'s `sectionMenu`.
      Because `RefSectionKey` stays narrow (Theme A), this is a **separate** `parentSectionMenu` rather
      than a widening of the ref-section union — the existing function has nothing to offer a section
      with no refs, and widening its parameter would replace a compile error with a menu that opens
      empty.
- [x] Menu contents: **New branch…** (the existing `local` action, unchanged), **Fetch all** and
      **Prune remote-tracking refs** — all three already exist as verbs elsewhere in
      `use-repo-actions.ts`; none is new git. The latter two both call the same `fetch` mutation, since
      pruning is already the default on every fetch this app makes.
- [ ] `Forge` gets a count of its visible children and **no menu** — **deferred to Theme F**, not
      dropped. `forge` has no `TreeSection` heading to attach a count to yet: its `SECTION_BODY` entry
      renders `<ForgeSections>`/`<TestsSection>` directly today, and the code comment on that entry is
      explicit that Theme F is what "gives Forge a real nested heading." A count with nothing to sit
      beside would be new UI this theme does not own; Theme F's own checklist inherits this bullet.
- [x] The parent heading's accessible name reads `Branches 12`, matching what `TreeSection` already
      does for every other counted section — `Branches` today renders as a non-collapsible heading
      (no fold arrow of its own; only its children fold), so this is the count sitting beside the
      title in the DOM rather than a single focusable name string, the same as it would read for any
      other non-collapsible counted section.

### F — Forge sections get a parent (M)

- [ ] `Actions`, `Reviews`, `Issues` and `Tests` nest under `Forge` in `SECTION_TREE`, and their
      `TreeSection`s move from `depth={1}` to `depth={2}` in
      [`forge-sections.tsx`](../packages/app/src/features/repos/forge-sections.tsx) and
      [`tests-section.tsx`](../packages/app/src/features/tests/tests-section.tsx).
- [ ] Their nested run/job groups and `Note` rows shift one rung each, per Theme B.
- [ ] `Forge` hides entirely when the repo has no forge remote — which is already each child's own
      condition, so this is Theme A's parent rule doing its job, not a new check. Verify against a
      repo with **no remote at all**, which is the state this repository itself is in.
- [ ] `Tests` under `Forge` is the one arguable membership: it is a repo capability, not a forge one.
      Recorded as an open decision below rather than settled silently.
- [ ] **Inherited from Theme E:** once `Forge` gets a real nested `TreeSection` heading, give it a
      count of its visible children and **no menu** — `SECTION_COUNT`/`SECTION_ACTIONS` in
      [`repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx) already support a
      `forge` entry; Theme E only left it unpopulated because there was no heading yet to attach it to.

### G — Settings ▸ Sidebar catches up (S)

- [ ] `SECTION_LABELS` in
      [`sidebar-page.tsx`](../packages/app/src/features/settings/settings-pages/sidebar-page.tsx)
      covers `branches`, `forge` and `stashes`. It is a `Record<SectionKey, string>`, so this is a
      compile error until it is done — which is the point.
- [ ] `describeFilter()` reads the nesting: a filter admitting a whole subtree says *"Branches"*, not
      *"Local and Remotes"*, and one admitting a single child still says the child's name.
- [ ] The page's per-view narrowing rows keep working unmodified against the reworked `VIEW_FILTERS`
      — if they do not, Theme A got the compatibility wrong and this is where it shows.
- [ ] `stashes` is labelled but noted as arriving with Phase 22, so the page does not offer a control
      for a section that renders nothing.

### H — Reconciliation (S)

- [ ] Rewrite the `"'Local', not 'Branches'"` comment in
      [`repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx) — it argued against a
      rename, this phase did not do a rename, and left standing it reads as a rule the code is
      breaking.
- [ ] `view-sections.ts`'s module doc explains the tree, the parent-visibility rule, and why
      `RefSectionKey` stayed narrow — the three things a future section-adder needs and cannot infer.
- [ ] A short **"adding a section"** note at the top of `view-sections.ts`: add a node to
      `SECTION_TREE`, a label to `SECTION_TITLE` and `SECTION_LABELS`, a body to `SECTION_BODY`. Three
      exhaustive `Record`s mean the compiler names the other two once the first is done.
- [ ] A coordination line in this doc's *Not in this phase* recording that
      [Phase 22 Theme B](phase-22-stash-and-safety-net.md) now registers `stashes` against the slot
      rather than hand-editing six files. **Phase 22's own doc is not edited here** — reconciling it
      is `/refine`'s job, not a doc-only phase plan's.
- [ ] [`outstanding.md`](outstanding.md) checked for any sidebar-ordering entry this closes.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | **None.** [`packages/shared`](../packages/shared) and [`packages/git-engine`](../packages/git-engine) are untouched — no channel, no schema, no git command. |
| Main | **None.** |
| Renderer — declaration | [`features/repos/view-sections.ts`](../packages/app/src/features/repos/view-sections.ts) (`SectionNode`, `SECTION_TREE`, derived `ALL_SECTIONS`, `parentOf`/`childrenOf`, `expandFilter`, the parent rule in `visible`) |
| Renderer — tree | [`features/repos/repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx) (`renderSection`, `SECTION_BODY`, `SECTION_TITLE`, `useSectionToggles`, `RemoteGroup`, every `depth={}`), [`features/repos/forge-sections.tsx`](../packages/app/src/features/repos/forge-sections.tsx), [`features/tests/tests-section.tsx`](../packages/app/src/features/tests/tests-section.tsx), [`features/repos/use-repo-actions.ts`](../packages/app/src/features/repos/use-repo-actions.ts) (`parentSectionMenu`), [`features/repos/repo-lifecycle.ts`](../packages/app/src/features/repos/repo-lifecycle.ts) (fold pruning) |
| Renderer — primitives | [`components/tree-section.tsx`](../packages/app/src/components/tree-section.tsx) (`depth` widened to `0\|1\|2\|3`), [`components/tree-indent.ts`](../packages/app/src/components/tree-indent.ts) (fifth rung) |
| Store | [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts) — `collapsedRepoSections`, `toggleRepoSection`, `PersistedUi`, `partialize`, `version: 3` + `migrate` arm |
| Settings | [`features/settings/settings-pages/sidebar-page.tsx`](../packages/app/src/features/settings/settings-pages/sidebar-page.tsx) (`SECTION_LABELS`, `describeFilter`) |
| Tests | [`features/repos/view-sections.test.ts`](../packages/app/src/features/repos/view-sections.test.ts), [`features/repos/repos-panel.test.ts`](../packages/app/src/features/repos/repos-panel.test.ts), a new store test for the fold map and its migration, [`e2e/`](../packages/app/e2e) sidebar spec |
| Docs | [`todo/outstanding.md`](outstanding.md), [`docs/INITIAL_PLAN.md`](../docs/INITIAL_PLAN.md) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean — trivially, since this phase touches only `packages/app`.
- [ ] Vitest (A): `ALL_SECTIONS` is the flattened tree; every key appears exactly once; a filter
      naming a parent admits its children; a parent with all children filtered away is not visible.
- [ ] Vitest (A): every pre-existing `VIEW_FILTERS` expectation passes **unmodified** — the per-view
      narrowing is not what this phase is changing, and a diff there is a regression.
- [ ] Vitest (C): rendered heading order equals the visible flattened tree, with Worktrees first.
- [ ] Vitest (D): fold state round-trips, two repos stay independent, and a `version: 2` persisted
      payload migrates without dropping `collapsedNavSections`, `collapsedSettingsGroups` or
      `layout`.
- [ ] Typecheck proves the three exhaustive `Record`s (`SECTION_TITLE`, `SECTION_BODY`,
      `SECTION_LABELS`) are complete — deliberately verified by *removing* one arm and confirming the
      build fails, once, by hand.
- [ ] Playwright: fold `Remotes`, collapse the repo, re-expand it, and confirm `Remotes` is still
      folded; reload the app and confirm it is still folded.
- [ ] Playwright: switch to the Changes view (work-in-progress filter) and confirm `Branches`
      disappears entirely rather than rendering an empty heading.
- [ ] Screenshot, per the visual-phase convention: the full tree expanded to depth 4
      (`Branches ▸ Remotes ▸ origin ▸ origin/main`), the tree with `Branches` folded, and the
      forge-grouped lower half — all in both themes.
- [ ] Visual parity check: Worktrees, Tags and the collapsed forge heading render pixel-identical to
      `main` at depth 1. Only their vertical position may differ.
- [ ] **Open, for a human:** a repository with several remotes and a few hundred branches — confirm
      the depth-4 rows read at the panel's minimum width, and that the extra rung has not made the
      deepest names unreadable. This is the theme most likely to be fine in a fixture and unpleasant
      in a real repository.
- [ ] **Open, for a human:** relaunch a packaged build with a v2 `midnite-git.ui` in localStorage and
      confirm the migration lands without resetting panel sizes.

## Not in this phase

- **User-reorderable or hideable sections.** Making the order data is the prerequisite for a
  Settings ▸ Sidebar reorder control, and it is deliberately not the same phase: one is a
  refactor with a fixed answer, the other is a preference with persistence, a reset affordance and a
  drag interaction. Revisit once the declaration has survived a phase or two.
- **Path-segmented branch folders** (`feature/` as a folder inside `Local`). It is the obvious next
  thing the ladder makes possible and it is a different problem — it needs a grouping function over
  ref names, a collapse state per *folder* rather than per section, and a decision about single-child
  folders. A tree that is one rung deeper is the wrong time to also make it dynamically deep.
- **The stash engine and any real stash data.** [Phase 22](phase-22-stash-and-safety-net.md) owns it.
  This phase reserves the slot and renders nothing in it; Phase 22 Theme B then registers a section
  against the substrate instead of hand-editing `SectionKey`, `ALL_SECTIONS`, `VIEW_FILTERS`,
  `SECTION_TITLE`, `useSectionToggles`, `sectionMenu` and `sidebar-page.tsx` as it is currently
  written to. Phase 22's doc is not edited by this phase.
- **Editing Phase 22's plan** to match. `/refine` reconciles a plan against landed substrate; a
  brainstorm writes one.
- **Any git command, IPC channel or schema.** Stated as a guardrail and repeated here because it is
  the cheapest thing to check a PR against.
- **The repo-level expand/collapse-all control** learning about sections. It is about repositories and
  should stay about repositories — see the decisions below.
- **Non-macOS shapes.** Verified on darwin like every phase before it.

## Decisions / open questions

- **Resolved — Worktrees first.** Which checkout you are looking at is the app's primary context in
  every view (`VIEW_FILTERS` already says so: Actions and Tests keep Worktrees beside their own
  section for exactly this reason). The section that answers the app's primary question should not be
  fourth.
- **Resolved — `branches` is a real `SectionKey`, not a presentational wrapper.** A wrapper would have
  been a smaller diff and would have left the parent unable to be filtered, labelled in settings, or
  folded as a unit — three things that are the difference between a heading and a section.
- **Resolved — a tree, not a flat list with a `parent` field.** Both express the same structure; the
  tree makes "render in order, recursively" a five-line walk and makes an orphaned child
  unrepresentable rather than merely wrong.
- **Resolved — `RefSectionKey` stays narrow.** `sectionMenu` has nothing to offer a parent, so Theme E
  adds a `parentSectionMenu` beside it rather than widening the union. This preserves the existing
  comment's reasoning exactly.
- **Resolved — extend the indent ladder rather than flatten the remote groups.** Dropping the `origin`
  grouping to save a rung would have removed working structure to make room for new structure. The
  fifth rung costs 12px at a depth most users rarely open.
- **Resolved — folds persist per repo.** Two repositories open at once must be able to disagree, which
  is why the existing state is per-`RepoTree`; persistence keeps that and adds durability.
  `collapsedNavSections` and `collapsedSettingsGroups` are two existing precedents for the exact
  shape, including the closed-set inversion.
- **Resolved — the `stashes` slot renders nothing until Phase 22.** Declaring a position is free;
  rendering an empty heading for a feature that does not exist is a bug report.
- **Open — does `Tests` belong under `Forge`?** It is a repo capability that happens to sit beside
  three forge ones. *Recommendation:* yes, for now — the alternative is a fifth top-level heading with
  one child, and the grouping the user actually perceives is "the lower half of the tree, about CI and
  review". If a second local-capability section ever arrives, rename the parent rather than splitting
  it.
- **Open — does the repo-level "collapse all" also fold sections?** *Recommendation:* no. It is
  labelled and reasoned about in terms of repositories (`allCollapsed` is computed over `matched`
  repos), and making it also reach two levels down would make its inverse, "expand all", open a tree
  four levels deep on every repo — which is the state the control exists to escape.
- **Open — does folding a parent remember its children's states?** *Recommendation:* yes, keep them as
  independent keys and let a re-opened `Branches` restore exactly what it had. The alternative
  (a parent fold that closes its children) throws away information the user set deliberately.
- **Open — what is the parent count when a child is filtered out?** A view showing `local` but not
  `remotes` gives `Branches` a count that does not match what is under it. *Recommendation:* count
  only visible children, so the number always describes what is on screen — the same rule the
  worktree counts already follow under `dirtyOnly`.
- **Open — does the depth-4 row survive the panel's minimum width?** *Recommendation:* measure before
  committing to the 12px step (Theme B), with a real long remote branch name rather than a fixture.
  If it does not fit, tighten rung 4 alone to 8px and say so in `tree-indent.ts`'s table — a
  documented irregular rung beats a truncated name.
- **Open — should the persisted fold map be pruned on repo close, or on read?** *Recommendation:* on
  close (`repo-lifecycle.ts`), because it is the one moment the app knows a repo is gone rather than
  merely absent — a read-time prune would delete state for a repo the user is about to re-open.
