# Phase 49 — Onboarding a repo: Setup and Update

The midnite menu ([`features/agent/midnite-menu.tsx`](../../../packages/app/src/features/agent/midnite-menu.tsx))
has had exactly one shape since it was built: five groups, eighteen leaves, and every leaf does
the same thing — [`startAgent`](../../../packages/app/src/features/terminal/start-agent.ts) opens a
terminal session on the repo checkout and **types the command without pressing Return**, because
Return is the user's confirmation, not the app's. That posture is why the menu has never needed an
IPC channel of its own. This phase adds the first two entries that are *about the repository
itself* rather than about an agent working in it, and only one of them can keep that posture.

**Setup is net-new, and the audit is unambiguous about how new.** Nothing under `packages/` or
`scripts/` has ever read, written or copied a `.midnite/` directory — the only `.midnite` strings
in the source are comments in [`app/moon.yml`](../../../packages/app/moon.yml) and the two
Playwright configs pointing at phase docs; every other match is the unrelated `window.midniteStudio`
bridge. The closest prior art is not code at all but a skill,
[`.claude/skills/midnite-setup/SKILL.md`](../../../.claude/skills/midnite-setup/SKILL.md), and it is
**stale by a rename**: it still scaffolds a `todo/` folder, the name this repo abandoned when the
tracker moved to `.midnite/tasks/`. So the phase has two jobs at once — build the writer, and stop
the app and the skill from disagreeing about what an onboarded repo looks like.

**Update is misnamed, and the phase says so rather than pretending otherwise.**
[`scripts/install-local.mjs`](../../../packages/desktop/scripts/install-local.mjs) does not take a
repo: it `ditto`s **this** repo's `release/mac-arm64/Midnite Studio.app` into `/Applications`,
removes the legacy `midnite-git.app` names, strips the quarantine xattr, and exits 1 with *"Run
`moon run desktop:dist` first"* when no build exists. `moon run desktop:install-local` is therefore
a meaningful command in exactly one checkout — Midnite Studio's own — and the honest design is a
leaf that **detects that and disables itself with a reason everywhere else**, not one that types a
command which cannot work. [`context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx)'s
`MenuItem` already carries `disabled` + `disabledReason`; the pattern exists, this is its first
repo-capability use.

**Builds on, and does not repeat.** Phase 24's scoped write plumbing
([`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts), `fs-scope.ts`) stays
exactly as it is — this phase's writer calls it, it does not add a second confinement primitive.
[`repo-lifecycle.ts`](../../../packages/app/src/features/repos/repo-lifecycle.ts) already detects a
moon workspace and produces `moon run :<action>`, then types it into a terminal without running it;
Theme E extends that detection rather than inventing a parallel one. And the IPC envelope stays the
house `GitOpResult`-shaped discriminated union — a scaffold that would clobber a file is a **normal
outcome the dialog renders**, not an exception thrown across the boundary.

**Scope guardrails.** **Setup writes files and touches git in the target repo not at all** — no
`git add`, no commit, no `.gitignore` edit; what the user does with the new files is the user's
next, separate action, exactly as [Phase 48](phase-48-apply-suggested-changes.md) settled for an
externally-authored change landing on disk. **Setup never clobbers a locally-edited file** —
"locally edited" is a first-class plan status with its own refusal, and a `.midnite/` that predates
the manifest counts as locally edited. **Update types, it does not execute**: a multi-minute
`desktop:dist` that ends by replacing the `.app` under the running process is not something this
phase automates, and it is not something the pty broker's build-fingerprinted socket
(`brokerSocketName`) should meet unannounced. **macOS only** — `install-local.mjs` is `ditto` and
`xattr`. **No Onboarding view**: the preview is a modal, and a dedicated ViewId with per-file
checkboxes is a later phase's idea if it is anyone's.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The onboarding kit, its packaging, and the skill it must agree with (M)

- [ ] A checked-in `templates/midnite/` tree at the repo root — the **skeleton**, deliberately not
      a snapshot of this repo's own `.midnite/` (which is 1.8 MB of real phase docs). Contents:
      `.midnite/settings.json`, `.midnite/tasks/_INDEX.md` (the headers and an empty `## Phases`
      table, matching [`_INDEX.md`](../_INDEX.md)'s own format), `.midnite/tasks/done.md`,
      `.midnite/tasks/outstanding.md`, an empty `.midnite/tasks/phases/`, and `.midnite/_features.md`.
- [ ] The repo-agnostic **skills** in the same tree, under `templates/midnite/.claude/skills/`. Of
      the eleven in [`.claude/skills/`](../../../.claude/skills), ship the workflow core —
      `midnite-brainstorm`, `midnite-exec`, `midnite-exec-adhoc`, `midnite-refine`,
      `midnite-address-issue`, `midnite-triage`, `midnite-git-report`, `midnite-git-cleanup`.
      **Exclude `midnite-setup`** (a repo that has just been set up does not need the bootstrapper)
      **and the `midnite-release-*` pair**, which assume the `bilo-io/midnite-apps` release repo,
      the namespaced `midnite-studio/vX.Y.Z` tag scheme and the `generic` updater feed — all three
      specific to this product, none true of an arbitrary target. Record that reasoning in the
      template's own README so the exclusion isn't re-litigated.
- [ ] Agent-file **stubs**, not copies. `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` here are 199 identical
      lines of midnite-studio conventions; what transfers is the *sync rule* between the three and
      the tracker/worktree/phase-workflow sections, with the repo-specific parts left as marked
      placeholders. A stub that reads as a template is honest; a copy that names this repo's
      package boundaries in someone else's repo is not.
- [ ] The `.agents/skills/` and `.codex/skills/` mirrors are produced from the **same** source in
      the same apply pass — this repo keeps three verbatim copies of the skill set (140 K / 124 K /
      124 K) precisely because each CLI reads its own path, and scaffolding one without the others
      hands the target a half-onboarded repo.
- [ ] **Get the tree into the packaged app.** A root `templates/` directory is not in the bundle by
      default: add it to [`electron-builder.yml`](../../../packages/desktop/electron-builder.yml) and
      resolve it in main off `process.resourcesPath` in production versus the repo root in dev, with
      one helper that owns the branch. This is the item most likely to pass in `moon run
      desktop:start` and fail in a dmg — assert it in Theme E's packaged check, not by eye.
- [ ] Fix [`midnite-setup/SKILL.md`](../../../.claude/skills/midnite-setup/SKILL.md): `todo/` →
      `.midnite/tasks/`, and point it at `templates/midnite/` as the layout it must emit, so the
      skill and the app cannot drift again. Mirror the edit into `.agents/` and `.codex/`.
- [ ] `README.md` gains a short "Onboarding another repo" note; the `CLAUDE.md`/`AGENTS.md`/
      `GEMINI.md` trio gains the same paragraph, per this repo's own sync rule.

### B — The scaffold contract in `shared` (S)

- [ ] A new `shared/src/domain/scaffold.ts`: zod schemas for `ScaffoldEntry`
      (`{ path, status, bytes }`), `ScaffoldStatus` as a literal union of
      `'create' | 'unchanged' | 'stale' | 'locally-edited'`, `ScaffoldPlan`
      (`{ targetRoot, templateVersion, entries }`) and `ScaffoldApplyResult`.
- [ ] The `.midnite/settings.json` schema, extended from today's `{ "version": 1 }` to carry a
      **manifest**: `{ version, template: { version, files: Record<path, sha256> } }`. This one
      field is what makes re-running Setup an upgrade rather than a guess, and it is the only
      persistent state the phase adds.
- [ ] Two IPC channel constants (plan, apply) with request/response schemas, in the same file as
      the rest of the channel constants. Both responses use the house `{ ok: true, … }` |
      `{ ok: false, kind, … }` envelope — **never throw across the boundary**.
- [ ] Round-trip tests for every schema, matching the pattern the other domain modules use.
- [ ] `shared` gains no dependency: zod only, no `node:fs`, no `electron`. The template *contents*
      live under `templates/`, not inside the package — `shared` describes the plan, it does not
      carry the files.

### C — Plan and apply in main (M)

- [ ] A `desktop/src/main/scaffold/` module: read the template tree, walk the target repo, sha256
      both sides, and classify each file — `create` (absent), `unchanged` (hash matches the
      manifest **and** the current template), `stale` (matches the manifest but the template has
      moved on — the upgrade case), `locally-edited` (present, and its hash matches neither).
- [ ] **A target `.midnite/` with no manifest at all classifies as `locally-edited`, wholesale.**
      Someone who hand-made a tracker is exactly the person a silent overwrite would hurt most;
      absence of provenance is not permission.
- [ ] Every write goes through [`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts)'s
      confinement against the *target repo root*, so a malformed template path cannot escape it.
      A template entry that resolves outside the root fails the whole plan, loudly — no partial
      apply of a plan with a bad entry in it.
- [ ] Apply writes only the entries the renderer sent back as approved, re-checking each hash
      immediately before writing (the plan the user approved may be seconds old; the file may have
      changed underneath it). A mismatch skips that one file and reports it in the result rather
      than aborting the batch.
- [ ] The manifest is written **last**, after the files it describes — a crash mid-apply then leaves
      a target whose next plan reads the truth off disk rather than off a manifest that over-claims.
- [ ] Unit tests over a temp-dir fixture: fresh repo (all `create`), identical re-run (all
      `unchanged`), template bumped (`stale`), user-edited file (`locally-edited` and never
      written), no-manifest pre-existing `.midnite/`, and an escaping template path.

### D — The Setup dialog (M)

- [ ] The Setup leaf opens a **modal preview** rather than acting: target repo path in the header,
      the template version, and counts by status. Nothing is written before Apply.
- [ ] The per-file list, grouped by status, with `locally-edited` entries visibly *excluded from the
      write* and saying so — the dialog's job is to make "what will change" answerable at a glance,
      the same job the destructive-git confirm dialogs already do with `rev-list --count`.
- [ ] Wording changes on re-run: a repo with no `.midnite/` reads "Set up", a repo with a manifest
      reads "Update onboarding kit" with the version delta. One dialog, two honest framings.
- [ ] Apply / Cancel, a result state (n written, n skipped, n refused), and a failure state that
      renders the `{ ok: false }` envelope's reason rather than a generic error.
- [ ] Reuses the existing dialog and confirm primitives; **no new modal system**, and no new
      ViewId.

### E — Update, capability detection, and the menu (M)

- [ ] A repo-capability helper beside [`repo-lifecycle.ts`](../../../packages/app/src/features/repos/repo-lifecycle.ts):
      `hasMidniteDir`, `isMoonWorkspace` (reuse, don't re-derive) and `isMidniteStudioCheckout` —
      the last identified by a real marker (the workspace's own project name / the presence of
      `packages/desktop/scripts/install-local.mjs`), not by directory name, so a clone or worktree
      under any path still resolves correctly.
- [ ] A sixth entry in `AGENT_COMMAND_GROUPS`
      ([`agent-commands.ts`](../../../packages/app/src/features/agent/agent-commands.ts)) —
      `project`, with a `hint` in the same voice as the other five — and the two leaves in it, with
      `react-icons/lu` glyphs. The `AgentCommandCategory` union and `AgentCommandId` in
      [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) widen accordingly.
- [ ] **Update is disabled with a `disabledReason`** anywhere `isMidniteStudioCheckout` is false —
      "Only for the Midnite Studio checkout" — using the `disabled`/`disabledReason` fields
      [`context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx) already carries.
- [ ] A pre-flight before typing: `release/mac-arm64/Midnite Studio.app` present? If not, the leaf
      still works but the dialog-free path says what will happen (`install-local` depends on
      `~:dist`, so the command *will* build first — several minutes and ~200 MB of uncached
      artifacts; [`moon.yml`](../../../packages/desktop/moon.yml) marks `dist` `cache: false`
      deliberately).
- [ ] Update then does exactly what the other eighteen leaves do — `startAgent` types
      `moon run desktop:install-local` into a session on the checkout and **stops**. The user
      presses Return, and so chooses the moment the app they are running gets replaced.
- [ ] Tests: [`agent-commands.test.ts`](../../../packages/app/src/features/agent/agent-commands.test.ts)
      extended for the sixth group and its ids; unit tests for each capability predicate; e2e in
      [`e2e/midnite-menu.spec.ts`](../../../packages/app/e2e/midnite-menu.spec.ts) covering the
      group opening, Update's disabled state on a non-studio repo, and the Setup dialog rendering a
      plan; a new screenshot in
      [`midnite-menu-shots.spec.ts`](../../../packages/app/e2e/midnite-menu-shots.spec.ts) beside
      the existing `menu-open`/`menu-tasks`/`menu-loops` set.
- [ ] A **packaged-build check** that the template resolves off `process.resourcesPath` — the one
      Theme A failure mode that dev mode cannot catch.

## Files this phase touches

| Area | Path |
|---|---|
| New | `templates/midnite/**` (the onboarding kit: `.midnite/` skeleton, the eight repo-agnostic skills, agent-file stubs, its own README explaining the exclusions) |
| New | `packages/shared/src/domain/scaffold.ts` (plan/entry/result schemas + the extended settings manifest) |
| New | `packages/desktop/src/main/scaffold/` (template resolution, hashing, classification, apply) |
| New | `packages/app/src/features/agent/setup-dialog.tsx` (the modal preview) and a repo-capability helper beside `repo-lifecycle.ts` |
| Edited | [`features/agent/agent-commands.ts`](../../../packages/app/src/features/agent/agent-commands.ts) (sixth group + two leaves), [`features/agent/midnite-menu.tsx`](../../../packages/app/src/features/agent/midnite-menu.tsx) (gating, dialog launch), [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (`AgentCommandId`) |
| Edited | [`electron-builder.yml`](../../../packages/desktop/electron-builder.yml) (ship `templates/` into the bundle) |
| Edited | [`.claude/skills/midnite-setup/SKILL.md`](../../../.claude/skills/midnite-setup/SKILL.md) + its `.agents/` and `.codex/` mirrors (`todo/` → `.midnite/tasks/`, point at the template) |
| Edited | `README.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` (the onboarding note, applied to all three per the sync rule) |
| Reused, unchanged | [`main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) + `fs-scope.ts` (confinement against the target root — no second primitive), [`features/terminal/start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts) (Update rides it exactly as the other eighteen leaves do), [`components/context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx) (`disabled` / `disabledReason`) |
| Read, not modified | [`scripts/install-local.mjs`](../../../packages/desktop/scripts/install-local.mjs) and [`packages/desktop/moon.yml`](../../../packages/desktop/moon.yml) (the command Update types, and why it is checkout-specific), [`features/repos/repo-lifecycle.ts`](../../../packages/app/src/features/repos/repo-lifecycle.ts) (the type-don't-run precedent) |
| Untouched by design | this repo's own [`.midnite/`](../../../.midnite) — the template is a skeleton, never a snapshot of it |

## Verification

*(The assertions live in Themes C and E rather than being duplicated here.)*

- [ ] `moon run :typecheck :lint :test` green.
- [ ] A human pass: run Setup against a scratch repo, confirm the dialog's counts match what lands
      on disk, then re-run it unchanged and confirm every entry reads `unchanged` and nothing is
      written.
- [ ] A human pass on a **packaged** build (`moon run desktop:dist` + install): the template
      resolves, and Update is enabled in the studio checkout and disabled with its reason elsewhere.

## Not in this phase

- **Executing the build.** Update types `moon run desktop:install-local` and stops. Real execution
  through [`process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) with streamed
  output would need a long-running-task surface, cancellation, and an answer to what happens when
  the bundle under the running process is swapped mid-flight — including the broker's build-
  fingerprinted socket. A later phase's scope if it is anyone's.
- **A dedicated Onboarding view.** The preview is a modal; per-file include/exclude checkboxes and
  a scaffold file tree are a ViewId's worth of work, and a plan you scroll past is a worse place to
  approve an overwrite than a dialog.
- **Symlinked skills.** Zero drift by construction, and broken the moment the repo is opened on
  another machine — the manifest solves the same problem without leaving a machine-local path in a
  git repo.
- **Touching git in the target repo.** No `git add`, no commit, no `.gitignore` edit.
- **Non-macOS Update.** `install-local.mjs` is `ditto` + `xattr`; Windows/Linux packaging is already
  deferred scope in [`outstanding.md`](../outstanding.md).
- **Merging file *contents*.** A `locally-edited` file is skipped and reported, never three-way
  merged. A scaffolder that tries to merge markdown is a scaffolder that eventually loses someone's
  phase doc.

## Decisions / open questions

- **Settled — the scaffold is a checked-in `templates/midnite/` tree, not a copy of this repo's
  `.midnite/`.** Deterministic, reviewable in a diff, unit-testable without a fixture repo, and it
  lets the skeleton and this repo's own tracker diverge on purpose.
- **Settled — the kit is the full onboarding: `.midnite/` plus `.claude/skills/` plus agent-file
  stubs, mirrored into `.agents/` and `.codex/`.** Half a kit is a repo that cannot actually run
  the workflow the tracker assumes.
- **Settled — drift is handled by a hash manifest in `.midnite/settings.json`.** Idempotency and
  upgrade fall out of one mechanism, and it is what makes the preview worth building.
- **Settled — Setup previews in a modal and never clobbers a locally-edited file.**
- **Settled — Update types rather than executes, and is gated to the Midnite Studio checkout with a
  `disabledReason` elsewhere.**
- **Open — which eight skills, exactly?** Theme A proposes excluding `midnite-setup` and the
  `midnite-release-*` pair. *Recommendation:* ship those eight. `midnite-triage` and
  `midnite-address-issue` assume a GitHub forge but not *this* forge, so they transfer;
  `midnite-release-*` assume the `midnite-apps` repo, the namespaced tag scheme and the `generic`
  feed, none of which do.
- **Open — does the template carry a `version` the target can compare against, or is the per-file
  hash enough?** *Recommendation:* both, but only the hashes are load-bearing. The version is for
  the dialog to say "kit v1 → v2"; the per-file hashes are what decide each row, so a template
  edited without a version bump still classifies correctly.
- **Open — should Setup offer to write a `.gitignore` entry (or deliberately *not* ignore
  `.midnite/`)?** *Recommendation:* neither, and say so in the dialog. The tracker is meant to be
  committed — that is the whole point of `done.md` being append-only — and a scaffolder editing
  `.gitignore` is exactly the kind of git-touching this phase's guardrails rule out.
- **Open — where does Setup get its target repo?** The menu is already scoped to a repo
  (`{ repoId, repoName, cwd }` on [`MidniteMenu`](../../../packages/app/src/features/agent/midnite-menu.tsx)),
  so the answer is "the repo whose row you opened it from". *Recommendation:* keep it to that, and
  do not add an arbitrary folder picker — a scaffolder that can be pointed anywhere is a scaffolder
  that will one day be pointed at `$HOME`.
