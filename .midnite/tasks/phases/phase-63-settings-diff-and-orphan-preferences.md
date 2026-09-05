# Phase 63 — The preferences with nowhere to live

Small and additive: one settings page, four preferences that have never had a home, and one test
that stops a fifth from being orphaned later. No IPC, no new dependency, no persistence version
bump, no behaviour change to anything that already works.

`useUiStore` persists **77 keys**. Every preference cluster among them has a settings page that owns
it — `activityTimelineStyle` has `settings/activity-timeline-settings.tsx`, `hiddenMetrics` has
`monitor-page.tsx`, `loopModifierDefaults` has `agent-page.tsx`, `autoFetchIntervalMs` has
`sidebar-page.tsx`. Four do not:

| Preference | Declared | In `PersistedUi` | Default | Only reachable from |
|---|---|---|---|---|
| `diffShowOldGutter` | [`ui-store.ts:759`](../../../packages/app/src/store/ui-store.ts) | `:1136` | `false` (`:1372`) | [`diff-toolbar.tsx:19`](../../../packages/app/src/features/diff/diff-toolbar.tsx) |
| `diffLayout` | `:761` | `:1137` | `'unified'` (`:1373`) | `diff-toolbar.tsx:21` |
| `commitFileView` | `:772` | `:1143` | `'tree'` (`:1375`) | [`commit-detail.tsx:76`](../../../packages/app/src/features/commit/commit-detail.tsx) |
| `changesFileView` | `:791` | `:1145` | `'list'` (`:1377`) | [`status-panel.tsx:64`](../../../packages/app/src/features/status/status-panel.tsx) |

**And the two diff controls are conditionally rendered, which is what turns a gap into a real
problem.** `diff-toolbar.tsx:19` renders the old-gutter button as `{!isSplit ? <IconButton …/> : null}`
and `:21` renders the layout toggle as `{canSplit(diff) ? <IconButton …/> : null}`. So the layout
control **does not exist** while you are looking at a binary or deleted file — you can enter split
layout on a text diff, open a binary one, and have no way back to unified until you find another
text file. A preference you can only change when the thing it governs happens to be in the right
state is not a preference the user owns.

The third theme is the reason this is a phase rather than a chore. A settings page fixes four keys
once; nothing stops the fifth. So the phase also lands **an explicit, annotated partition of all 77
persisted keys** into *preference* (must be reachable from Settings) and *session state* (must not
be), asserted by a test. That is the same instrument this repo already uses where a rule matters
more than a reviewer's memory.

**Builds on.**
- [`settings-pages/sidebar-page.tsx`](../../../packages/app/src/features/settings/settings-pages/sidebar-page.tsx) —
  the template, copied in shape: `Accordion` from `@bilo-io/ui`, `Choice`/`Field` from
  [`./controls`](../../../packages/app/src/features/settings/settings-pages/controls.tsx), one
  `useUiStore` selector per value and one per setter, a `<div className="flex flex-col gap-3">` of
  `<Accordion title icon defaultOpen>` blocks each wrapping `<div className="p-3">`.
- `Choice<T>` in [`controls.tsx`](../../../packages/app/src/features/settings/settings-pages/controls.tsx) —
  takes `options: [value, label, hint][]`. All four preferences are two-valued, so all four are a
  `Choice`; none needs a new control.
- [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — the existing setters:
  `toggleDiffOldGutter` (`:1587`), `setDiffLayout` (`:1588`), `toggleDiffLayout` (`:1590`),
  `setCommitFileView` (`:1592`), `setChangesFileView` (`:1594`). The page calls the `set*` forms;
  no new store action is needed.
- [`settings-pages/terminal-page.test.tsx`](../../../packages/app/src/features/settings/settings-pages/terminal-page.test.tsx)
  and [`workflows-page.test.tsx`](../../../packages/app/src/features/settings/settings-pages/workflows-page.test.tsx) —
  the render-test shape. (`sidebar-page.test.ts` is *not* the model: it unit-tests a pure helper,
  and this page has no derived logic to unit-test.)

**Scope guardrails.**
- **`packages/app` only.** No IPC channel, no `shared` schema, no `desktop` change, no dependency.
- **No persistence change.** All four keys are already in `PersistedUi` and `partialize` at
  `version: 8`. This phase adds no key, so it bumps no version and writes no `migrate` arm. If a
  theme finds itself editing `migrate`, it has gone wrong.
- **The existing controls stay exactly where they are.** The toolbar and the two file-view toggles
  keep working and keep their conditional rendering; Settings is a *second* way in, not a
  replacement. See Decision 2.
- **No new settings control primitive.** Four `Choice` blocks. If a preference seems to need
  something `controls.tsx` does not have, it is the wrong preference for this phase.
- **Theme C partitions keys; it does not move or rename any.** The audit is a list plus a test.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The page (M)

- [ ] Add [`packages/app/src/features/settings/settings-pages/diff-page.tsx`](../../../packages/app/src/features/settings/settings-pages/diff-page.tsx)
      — **new.** `export function DiffPage(): JSX.Element`, structured exactly as
      [`sidebar-page.tsx`](../../../packages/app/src/features/settings/settings-pages/sidebar-page.tsx):
      a `<div className="flex flex-col gap-3">` of `<Accordion>` blocks, each wrapping
      `<div className="p-3">`.
- [ ] Two accordions, not one: **"Diff view"** (`icon={<LuDiff className="h-4 w-4" />}`, `defaultOpen`)
      holding `diffLayout` and `diffShowOldGutter`; **"File lists"**
      (`icon={<LuFolderTree className="h-4 w-4" />}`) holding `commitFileView` and `changesFileView`.
      They are two clusters governing two different surfaces, and a single flat list of four would
      hide that.
- [ ] `diffLayout` as `<Choice<DiffLayout> label="Layout" value={diffLayout} onChange={setDiffLayout}
      options={[['unified', 'Unified', 'One column, changes inline'], ['split', 'Split', 'Old and new side by side']]} />`,
      with a `hint` naming the constraint the toolbar hides: *"The toolbar's toggle only appears for
      files that can be split — binary and deleted files have no side-by-side form."*
- [ ] `diffShowOldGutter` as a `Choice` over `on`/`off` (not a bare switch), because
      `toggleDiffOldGutter` is a toggle and a `Choice` makes the current value readable without
      inferring it from a control's pressed state. Its `hint` names the other constraint: *"Only
      applies in unified layout."*
- [ ] `commitFileView` as `<Choice<FileView> label="Commit files" …
      options={[['tree', 'Tree', 'Nested by directory'], ['list', 'List', 'Flat, full paths']]} />`,
      and `changesFileView` the same with `label="Uncommitted changes"`. Two entries, not one shared
      setting — they have different defaults today (`'tree'` vs `'list'`) and unifying them would
      silently change one.
- [ ] A **"Reset to defaults"** button per accordion, writing the literal defaults from
      `ui-store.ts:1372-1377` (`false`, `'unified'`, `'tree'`, `'list'`). Import them as named
      exports rather than retyping — add `export const DIFF_PREF_DEFAULTS` to `ui-store.ts` if they
      are currently inline, so the page and the store cannot disagree about what "default" means.
- [ ] One `useUiStore` selector per value and one per setter — never a single selector returning an
      object, which would re-render the page on every unrelated store write. `sidebar-page.tsx` is
      the precedent and does it this way.
- [ ] `diff-page.test.tsx` in the shape of
      [`workflows-page.test.tsx`](../../../packages/app/src/features/settings/settings-pages/workflows-page.test.tsx)
      (RTL; note this project has **no `setupFiles`** and no `jest-dom`, so assertions read
      `expect(x).not.toBeNull()`): all four controls render; each reflects the store's current value;
      choosing an option calls the matching setter; "Reset to defaults" restores all four.

### B — Registration, and the one the compiler will not catch (S)

There are four registration points, not the three a reader would guess.

- [ ] Add `| 'diff'` to the `SettingsPageId` union at
      [`ui-store.ts:139`](../../../packages/app/src/store/ui-store.ts).
- [ ] Add `{ id: 'diff', label: 'Diff', group: 'general' }` to the `SETTINGS_PAGES` array at
      [`ui-store.ts:181`](../../../packages/app/src/store/ui-store.ts), positioned beside the other
      view-appearance pages rather than appended — the array *is* the display order.
- [ ] Add a `diff` entry to the `PAGE_CONTENT` record at
      [`settings-view.tsx:37`](../../../packages/app/src/features/settings/settings-view.tsx), plus
      its import. **The record is named `PAGE_CONTENT`, not `PAGES`** — a doc that says otherwise is
      wrong.
- [ ] Add a glyph to `SETTINGS_PAGE_ICON` at
      [`nav-icons.ts:87`](../../../packages/app/src/components/nav-icons.ts). This one is
      `Record<SettingsPageId, IconType>`, so omitting it is a **typecheck failure**, not a runtime
      blank — which is exactly why the other three deserve the test in Theme C and this one does not.
- [ ] Confirm and record that **no edit is needed** in
      [`services/palette/providers.ts:117`](../../../packages/app/src/services/palette/providers.ts)
      or [`components/title-bar-nav.tsx:220`](../../../packages/app/src/components/title-bar-nav.tsx):
      both derive from `SETTINGS_PAGES`, so the page reaches the command palette and the title-bar
      nav for free. Verify it rather than assume it — a palette entry that silently never appears is
      the failure mode.

### C — No orphan preference (S)

The durable half. Four keys were orphaned because nothing said they could not be.

- [ ] Add `packages/app/src/store/persisted-keys.ts` — **new.** Export two `readonly` string-literal
      arrays partitioning every key in `PersistedUi`:
      `PREFERENCE_KEYS` (a user choice that must be settable from Settings) and
      `SESSION_STATE_KEYS` (position, selection, collapse state — things a settings page must
      *not* offer). Every entry in `SESSION_STATE_KEYS` carries a trailing comment giving the
      one-clause reason it is not a preference.
- [ ] Type the partition so it cannot rot: assert
      `PREFERENCE_KEYS[number] | SESSION_STATE_KEYS[number]` is exactly `keyof PersistedUi`, via a
      `satisfies`/never-check in the same file. A key added to `PersistedUi` and to neither list is
      then a typecheck failure at the point of adding it.
- [ ] Add `persisted-keys.test.ts`: every `PREFERENCE_KEYS` entry is named in at least one file under
      [`settings-pages/`](../../../packages/app/src/features/settings/settings-pages/) — a source-text
      grep, in the spirit of this repo's other structural tests. Crude on purpose: it cannot prove a
      control works, only that the key is not orphaned, which is the failure this phase is about.
- [ ] Seed `SESSION_STATE_KEYS` with the obvious ones — `selectedRepoId`, `selectedWorktreePath`,
      `layout`, `collapsedNavSections`, `collapsedSettingsGroups`, `collapsedRepoSections`,
      `settingsPage`, `fabPanelOpen`, the three `*Detached` flags — and put everything genuinely
      ambiguous in `PREFERENCE_KEYS`, because a false positive costs a settings control and a false
      negative costs the invariant.
- [ ] Where the test fails on a key **other** than the four this phase fixes, **do not add a control
      for it** — add it to `SESSION_STATE_KEYS` with its reason, or note it in
      [`outstanding.md`](../../../.midnite/tasks/outstanding.md) as a preference wanting a home.
      Widening scope to whatever the audit turns up is how a 26-item phase becomes a 60-item one.

---

## Files this phase touches

| File | What |
|---|---|
| [`packages/app/src/features/settings/settings-pages/diff-page.tsx`](../../../packages/app/src/features/settings/settings-pages/diff-page.tsx) | **new** — the page |
| `packages/app/src/features/settings/settings-pages/diff-page.test.tsx` | **new** — render, reflect, set, reset |
| `packages/app/src/store/persisted-keys.ts` + `persisted-keys.test.ts` | **new** — the partition and its guard |
| [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | `SettingsPageId` (`:139`), `SETTINGS_PAGES` (`:181`), and `DIFF_PREF_DEFAULTS` exported. **No `PersistedUi`, `partialize`, `version` or `migrate` change** |
| [`packages/app/src/features/settings/settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx) | the `PAGE_CONTENT` entry (`:37`) |
| [`packages/app/src/components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) | `SETTINGS_PAGE_ICON` (`:87`) — typecheck-enforced |
| [`packages/app/src/features/settings/settings-pages/controls.tsx`](../../../packages/app/src/features/settings/settings-pages/controls.tsx) | (**unchanged**) — `Choice`/`Field` cover all four; do not widen |
| [`packages/app/src/features/diff/diff-toolbar.tsx`](../../../packages/app/src/features/diff/diff-toolbar.tsx) | (**unchanged**) — keeps its conditional controls; Decision 2 |
| [`packages/app/src/features/commit/commit-detail.tsx`](../../../packages/app/src/features/commit/commit-detail.tsx) · [`features/status/status-panel.tsx`](../../../packages/app/src/features/status/status-panel.tsx) | (**unchanged**) — the two file-view toggles keep working |
| [`packages/app/src/services/palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts) · [`components/title-bar-nav.tsx`](../../../packages/app/src/components/title-bar-nav.tsx) | (**unchanged, load-bearing**) — both derive from `SETTINGS_PAGES`; verified, not edited |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] `Settings ▸ Diff` appears in the settings nav, in the command palette, and in the title-bar
      settings nav — all three, without any of the three being edited.
- [ ] Each of the four controls shows the store's current value on open, and changing it in Settings
      is visible in the corresponding surface without a reload.
- [ ] Changing `diffLayout` **from Settings while a binary file is open** takes effect — the case the
      toolbar cannot serve, and the reason the page exists.
- [ ] "Reset to defaults" restores `false` / `'unified'` / `'tree'` / `'list'`.
- [ ] `localStorage`'s `midnite-studio.ui` is still `version: 8` after using the page — no migration,
      no new key.
- [ ] Removing a key from `PREFERENCE_KEYS` and `SESSION_STATE_KEYS` while leaving it in
      `PersistedUi` fails typecheck. Check by hand once, then revert the probe.
- [ ] `persisted-keys.test.ts` passes, and deleting `diff-page.tsx` makes it fail — otherwise the
      test proves nothing.

---

## Not in this phase

- **Removing the toolbar's controls.** Decision 2 — they are the fast path and stay.
- **Giving a home to every orphan the Theme C audit finds.** The audit records them; fixing them is
  the next phase's if there are many, and a follow-up commit's if there are one or two.
- **Any new `controls.tsx` primitive.** Four two-valued preferences need `Choice` and nothing else.
- **Unifying `commitFileView` and `changesFileView`.** They have different defaults and govern
  different panes; merging them silently changes one for every existing user.

---

## Decisions / open questions

1. **Resolved — a `Choice`, not a switch, for `diffShowOldGutter`.** The store action is
   `toggleDiffOldGutter`, and a toggle's current value has to be inferred from a control's pressed
   state. In a settings list the value should be readable at a glance, and `Choice` puts both
   options on screen. The setter stays `toggleDiffOldGutter`; the page calls it only when the chosen
   option differs from the current value.

2. **Resolved — the toolbar keeps its controls.** Settings is where you set a preference
   deliberately; the toolbar is where you flip it while reading a diff. Removing the toolbar buttons
   would make a one-click action a four-click one to fix a discoverability problem, which is the
   wrong trade. The conditional rendering stays too — a split toggle on a binary file would be a
   control that does nothing.

3. **Resolved — two accordions, not one.** "Diff view" and "File lists" govern different surfaces
   and different components. One flat group of four would put `commitFileView` next to
   `diffShowOldGutter`, which share nothing but a settings page.

4. **Resolved — the partition lives in `store/`, not in the settings feature.** `persisted-keys.ts`
   is a statement about `PersistedUi`, and it belongs beside the type it partitions so the two are
   edited in the same file view. The *test* reaching into `settings-pages/` is the dependency, and it
   only runs one way.

5. **Open — should `persisted-keys.test.ts` grep source text, or assert against a rendered tree?**
   Theme C picks the grep: it is a few lines, it has no jsdom cost, and it catches the exact failure
   (a key nothing mentions). *Recommendation:* keep the grep. Rendering all seventeen settings pages
   to check for four control labels is slower, more brittle, and would fail for reasons unrelated to
   the invariant.

6. **Open — how many orphans will Theme C actually find?** Unknown until it runs; `PersistedUi` has
   77 keys and most are plainly session state. *Recommendation:* if the count is under three, fix
   them in this phase and say so; if it is more, list them in
   [`outstanding.md`](../../../.midnite/tasks/outstanding.md) and let the invariant be the
   deliverable. Do not let the audit's result silently redefine the phase's size.
