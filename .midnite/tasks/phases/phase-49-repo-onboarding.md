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

### A — The onboarding kit, its packaging, and the skill it must agree with (M) ✅ DONE (2026-09-03, PR #51)

- [x] A checked-in `templates/midnite/` tree at the repo root: `.midnite/settings.json`,
      `.midnite/tasks/_INDEX.md` (headers + an empty `## Phases` table), `.midnite/tasks/done.md`,
      `.midnite/tasks/outstanding.md`, `.midnite/tasks/phases/` (empty but for a README explaining
      the naming convention — git can't track a truly empty directory), and `.midnite/_features.md`.
- [x] The repo-agnostic skills under `templates/midnite/.claude/skills/`: `midnite-brainstorm`,
      `midnite-exec`, `midnite-exec-adhoc`, `midnite-refine`, `midnite-address-issue`,
      `midnite-triage`, `midnite-git-report`, `midnite-git-cleanup` — genericized (every
      "Midnite Studio"/package-path/org/personal-timezone mention replaced with generic phrasing or
      a placeholder), keeping every workflow mechanic verbatim. `midnite-setup` and
      `midnite-release-*` excluded, reasoning recorded in the template's own README.
- [x] Agent-file stubs: `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` with the sync rule and worktree policy
      transferred verbatim, toolchain/package-boundary/house-convention sections left as marked
      `<!-- TODO -->` placeholders.
- [x] `.agents/skills/` and `.codex/skills/` mirror `.claude/skills/` exactly (frontmatter
      reformatted per each CLI's own established convention — full frontmatter for `.claude`, a
      simplified `name`/`description` + "Invoke with:" line for `.agents`/`.codex`, matching how
      this repo's own real skills already differ).
- [x] `electron-builder.yml` ships `templates/` as an `extraResource`; `template-path.ts`'s
      `templateRoot()` is the one helper resolving `process.resourcesPath` (packaged) vs. the repo
      root (dev), mirroring `window.ts`'s `rendererEntry()` exactly. No caller yet — Theme C's
      scaffold reader is the eventual consumer; the packaged-build assertion is Theme E's.
- [x] `midnite-setup/SKILL.md` (and its `.agents`/`.codex` mirrors — found drifted from `.claude` in
      more than just the `todo/` reference) now emits `templates/midnite/` verbatim instead of
      hand-picking two skills, stripping a `midnite-` prefix, and hand-writing a tracker from
      scratch.
- [x] `README.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` all gain the "Onboarding another repo"
      paragraph.

### B — The scaffold contract in `shared` (S) — ✅ DONE (2026-09-03)

- [x] A new `shared/src/domain/scaffold.ts`: zod schemas for `ScaffoldEntry`
      (`{ path, status, bytes }`), `ScaffoldStatus` as a literal union of
      `'create' | 'unchanged' | 'stale' | 'locally-edited'`, `ScaffoldPlan`
      (`{ targetRoot, templateVersion, entries }`) and `ScaffoldApplyResult`.
- [x] The `.midnite/settings.json` schema, extended from today's `{ "version": 1 }` to carry a
      **manifest**: `{ version, template: { version, files: Record<path, sha256> } }`. This one
      field is what makes re-running Setup an upgrade rather than a guess, and it is the only
      persistent state the phase adds.
- [x] Two IPC channel constants (plan, apply) with request/response schemas, in the same file as
      the rest of the channel constants. Both responses use the house `{ ok: true, … }` |
      `{ ok: false, kind, … }` envelope — **never throw across the boundary**.
  - Keyed by `repoId` only, not `targetRoot` — matching `diag-handlers.ts`'s own rule (main
    resolves the checkout through `resolveWorkdir`, the renderer never names a raw path), settled
    under the "where does Setup get its target repo" decision below.
- [x] Round-trip tests for every schema, matching the pattern the other domain modules use.
      `scaffold.test.ts`, 12 tests.
- [x] `shared` gains no dependency: zod only, no `node:fs`, no `electron`. The template *contents*
      live under `templates/`, not inside the package — `shared` describes the plan, it does not
      carry the files.

### C — Plan and apply in main (M) — ✅ DONE (2026-09-03)

- [x] A `desktop/src/main/scaffold/` module: read the template tree, walk the target repo, sha256
      both sides, and classify each file — `create` (absent), `unchanged`, `stale` (matches the
      manifest but the template has moved on — the upgrade case), `locally-edited` (present, and
      its hash matches neither).
  - **Corrected: `unchanged` is a direct hash match against the current template, not "the
    manifest AND the template."** Requiring both would call a byte-identical file something other
    than `unchanged` whenever the manifest disagrees or is absent — but the actual thing
    `unchanged` promises (nothing needs writing) is already true the moment the target's hash
    equals the template's. Simpler, and no different in outcome.
- [x] **A target `.midnite/` with no manifest at all classifies as `locally-edited`, wholesale.**
      Someone who hand-made a tracker is exactly the person a silent overwrite would hurt most;
      absence of provenance is not permission. `classify.ts`'s own explicit branch — checked
      *before* the general hash comparison, so even a byte-identical coincidence still reads
      `locally-edited` here.
- [x] Every write goes through [`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts)'s
      confinement against the *target repo root*, so a malformed template path cannot escape it.
      A template entry that resolves outside the root fails the whole plan, loudly — no partial
      apply of a plan with a bad entry in it.
  - New `ensureConfinedDirs` there, walking one level at a time (refusing a symlink at any level)
    rather than a recursive `mkdir` — `confineParent` never created missing intermediate
    directories before this, since nothing else in the app produced a multi-segment new path. A
    fresh repo has neither `.claude/skills/<name>/` nor `.midnite/tasks/phases/` yet.
- [x] Apply writes only the entries the renderer sent back as approved, re-checking each hash
      immediately before writing (the plan the user approved may be seconds old; the file may have
      changed underneath it). A mismatch skips that one file and reports it in the result rather
      than aborting the batch.
- [x] The manifest is written **last**, after the files it describes — a crash mid-apply then leaves
      a target whose next plan reads the truth off disk rather than off a manifest that over-claims.
- [x] Unit tests over a temp-dir fixture: fresh repo (all `create`), identical re-run (all
      `unchanged`), template bumped (`stale`), user-edited file (`locally-edited` and never
      written), no-manifest pre-existing `.midnite/`, and an escaping template path.
      `scaffold.test.ts`, 11 tests; the escaping-path case needed an injectable `walk` function,
      since a real directory walk cannot produce a traversal segment to test against (`plan.ts`'s
      own doc comment). `fs-scope-write.test.ts` gained its own `ensureConfinedDirs` suite, 5 tests.

### D — The Setup dialog (M) — ✅ DONE (2026-09-03)

- [x] The Setup leaf opens a **modal preview** rather than acting: target repo path in the header,
      the template version, and counts by status. Nothing is written before Apply.
- [x] The per-file list, grouped by status, with `locally-edited` entries visibly *excluded from the
      write* and saying so — the dialog's job is to make "what will change" answerable at a glance,
      the same job the destructive-git confirm dialogs already do with `rev-list --count`.
- [x] Wording changes on re-run: a repo with no `.midnite/` reads "Set up this repo", a repo with a
      manifest reads "Update onboarding kit". **Not the version delta itself** — `hasExistingKit`
      is a plain boolean the menu already computed (`hasMidniteDir`), and the plan's own
      `templateVersion` line covers what version is being applied; a second "vN → vN+1" string
      would say the same thing a different way.
- [x] Apply / Cancel, a result state (n written, n skipped, n refused), and a failure state that
      renders the `{ ok: false }` envelope's reason rather than a generic error.
- [x] Reuses the existing dialog and confirm primitives; **no new modal system**, and no new
      ViewId. Not literally `ConfirmDialog`, though — its `body`/`warnings` props cannot express a
      grouped, counted file list; `SetupDialog` copies its overlay/focus-trap/button shell instead.
  - **Corrected, found building it:** a dialog rendered inline inside `MidniteMenu` — itself
    mounted per (possibly virtualized) repo row — had its `fixed inset-0` overlay contained by a
    transformed ancestor rather than the viewport, positioning it near the row instead of centred
    on screen. Caught by the screenshot, not the RTL tests (jsdom does not lay out real CSS
    containment). Portaled to `document.body`, the same escape `graph-row.tsx`'s own popovers use.
  - Decided: RTL component tests for the dialog's own grouping/wording logic, on top of Theme E's
    e2e pass — `setup-dialog.test.tsx`, 6 tests.

### E — Update, capability detection, and the menu (M) — ◐ PARTIAL (2026-09-03)

- [x] A repo-capability helper beside [`repo-lifecycle.ts`](../../../packages/app/src/features/repos/repo-lifecycle.ts):
      `hasMidniteDir`, `isMoonWorkspace` (reuse, don't re-derive) and `isMidniteStudioCheckout` —
      the last identified by a real marker (the workspace's own project name / the presence of
      `packages/desktop/scripts/install-local.mjs`), not by directory name, so a clone or worktree
      under any path still resolves correctly. `repo-lifecycle.ts`'s own `inspectRepoRoot` exported
      for reuse. `hasPackagedBuild` added too, for the pre-flight item below.
- [x] A sixth entry in `AGENT_COMMAND_GROUPS`
      ([`agent-commands.ts`](../../../packages/app/src/features/agent/agent-commands.ts)) —
      `project`, with a `hint` in the same voice as the other five — and the two leaves in it, with
      `react-icons/lu` glyphs.
  - **Corrected: `AgentCommandId` and `DEFAULT_AGENT_SKILLS` do NOT widen.** Both leaves are built
    directly in `midnite-menu.tsx`, not as `AGENT_COMMANDS` entries — every existing entry types a
    user-configurable skill at an agent, and `agentSkills`/`DEFAULT_AGENT_SKILLS` are a *total*
    `Record<AgentCommandId, string>` over that assumption. Setup does not type anything at all; it
    opens `SetupDialog`. Update's command is fixed, never meant to be user-edited the way a skill
    is. Forcing either in would have given the Agent settings page a "skill" field with nothing
    sensible to put in it. `agent-commands.ts`'s own comment on the group states this in full;
    `agent-commands.test.ts`'s group-coverage tests were updated to treat `project` as the one
    declared group with no `AGENT_COMMANDS` entries, by design.
- [x] **Update is disabled with a `disabledReason`** anywhere `isMidniteStudioCheckout` is false —
      "Only for the Midnite Studio checkout" — using the `disabled`/`disabledReason` fields
      [`context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx) already carries.
- [ ] A pre-flight before typing: `release/mac-arm64/Midnite Studio.app` present? If not, the leaf
      still works but the dialog-free path says what will happen (`install-local` depends on
      `~:dist`, so the command *will* build first — several minutes and ~200 MB of uncached
      artifacts; [`moon.yml`](../../../packages/desktop/moon.yml) marks `dist` `cache: false`
      deliberately). **Not done**: `hasPackagedBuild` exists and is tested, but nothing surfaces its
      answer in the menu yet — no tooltip, no inline note. Left open rather than guessed at.
- [x] Update then does exactly what the other eighteen leaves do — ~~`startAgent` types~~ **a plain
      shell session queues** `moon run desktop:install-local` into a session on the checkout and
      **stops**. The user presses Return, and so chooses the moment the app they are running gets
      replaced.
  - **Corrected, found building it: `startAgent` is the wrong mechanism.** It always composes
    `command + agentInvocationArgs(agentId) + shellQuote(toAgentPrompt(prompt, agentId))` — every
    existing leaf's `prompt` is a natural-language instruction TO an agent CLI, wrapped as its
    argument (e.g. `claude '/midnite-exec'`). Routing Update's literal command through it would
    have typed `claude 'moon run desktop:install-local'` — asking Claude to interpret that string,
    not running it. `repo-lifecycle.ts`'s `runLifecycleAction` is the actual "type, don't run"
    precedent this item points at: a plain `kind: 'shell'` session with the command queued raw, no
    agent wrapping. Update now mirrors that.
- [x] Tests: [`agent-commands.test.ts`](../../../packages/app/src/features/agent/agent-commands.test.ts)
      extended for the sixth group and its ids; unit tests for each capability predicate
      (`repo-capability.test.ts`, 8 tests); e2e in
      [`e2e/midnite-menu.spec.ts`](../../../packages/app/e2e/midnite-menu.spec.ts) covering the
      group opening, Update's disabled state on a non-studio repo, Update typing the literal
      command on the studio checkout, and the Setup dialog rendering a plan; a new screenshot in
      [`midnite-menu-shots.spec.ts`](../../../packages/app/e2e/midnite-menu-shots.spec.ts) beside
      the existing `menu-open`/`menu-tasks`/`menu-loops` set, plus one for the Setup dialog itself.
- [ ] A **packaged-build check** that the template resolves off `process.resourcesPath` — the one
      Theme A failure mode that dev mode cannot catch. **Not done** — needs a packaged build
      (`moon run desktop:dist`), not exercised this batch.

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
