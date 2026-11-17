# Phase 151 — Skill scripts and local LLM offload

Planned 2026-11-15 · grounded against `origin/main` `3889a0547` and an audit of all 47 `midnite-*` skills under `.agents/skills/`.

**Model:** Themes A, B, C, D and E are spec'd builds for `sonnet` (pure Node/ESM scripts + Bash + unit tests). Theme F (`SKILL.md` wiring across `.agents/`, `.claude/`, `.codex/`) is mechanical with careful frontmatter/tool-name preservation.

All 47 `midnite-*` skills currently spend 60–80% of their frontier LLM tokens on deterministic work: `git`/`gh` JSON pipelines, `.midnite/tasks/` markdown table/bar math, ASCII chart/DAG/Gantt rendering, worktree/gate boilerplate, static diff rubric checks, and repetitive media parameter validation/polling. Meanwhile, local Ollama models are already present on disk (`gemma4:e2b`, `ministral-3:3b`, `qwen3.5:9b`, `qwen3.5:9b-64k`).

**Scripts-first rollout:** Themes **A–E** land standalone `.mjs` and `.sh` scripts under `scripts/skills/` **first**, delivering immediate token savings and deterministic CLI tools without touching any `SKILL.md` or breaking `scripts/skill-copies.test.mjs`. Theme **F** then wires the 47 `SKILL.md` files (across `.agents/skills/`, `.claude/skills/`, and `.codex/skills/`) to invoke those scripts.

> **Existing repo helpers reused (not rebuilt):**
> - `scripts/tracker-check.mjs` (roadmap consistency)
> - `scripts/changelog-attribution.mjs`, `scripts/changelog-sections-check.mjs`, `scripts/version-check.mjs`, `packages/shared/src/release.ts`
> - `scripts/audit.mjs` + `scripts/audit-suppressions.json`, `scripts/e2e-budget.mjs`, `scripts/no-quick-kiss.mjs`
> - `scripts/perf/{startup-report,idle-cpu,bundle-report}.mjs`
> - `.agents/skills/midnite-git-cleanup/cleanup.sh`, `.agents/skills/midnite-sanitize/scan.py`, `.agents/skills/midnite-git-report/pdf-template.html`
>
> **Scope guardrails:**
> - All new scripts live under `scripts/skills/` (never duplicated across `.agents/`, `.claude/`, `.codex/`).
> - Every `.mjs` script is deterministic-first: succeeds with `--no-llm` or heuristic fallback if `ollama` (`localhost:11434`) is not running.
> - All git parsing in scripts uses `-z` / `%x00` NUL-delimited fields (`AGENTS.md`).
> - Never commit `SCRATCHPAD.md`; never add attribution trailers.
> - Every `.mjs` script has unit tests (`*.test.mjs`) run via `moon run root:test-node`.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h.

## Headlines

**Theme A — Skill runtime library & Ollama router (`PR-1`, M).** ✅ Landed. `scripts/skills/lib/` holds `ollama.mjs` (`run({task,prompt,fallback})` routes classify/note to `gemma4:e2b`→`ministral-3:3b` and draft/audit to `qwen3.5:9b` (`-64k` past 8k chars), probes `MSTUDIO_OLLAMA_URL`, and always resolves with the deterministic fallback under `--no-llm`/`MSTUDIO_NO_LLM=1`/daemon down/model missing), NUL-safe `git.mjs`, envelope-returning `gh.mjs`, `format.mjs` (bars, diff cell, tables) and `tasks-index.mjs` (`_INDEX.md` row parse/update, checkbox counts). `scripts/skills/sync-skills.mjs` audits the three skill mirrors, treating `argument-hint`/`allowed-tools`/`AskUserQuestion`/`Invoke with:` as intentional variants, and `--write` propagates bodies while keeping each target's frontmatter. Every wrapper takes an injectable runner/fetch, so the 46 tests need no git, gh or Ollama; they run in `root:test-node` via the existing `scripts/**/*.test.mjs` glob.

**Theme B — Sitrep & forge triage CLI (`PR-2`, M).** ✅ Landed. `scripts/skills/sitrep.mjs <table|graph|timeline|histogram|sequence|ci|all>` takes `gh pr view` JSON (stdin, `--input`, `--pr`, or open PRs) and renders each sitrep skill's exact shape; `scripts/skills/triage.mjs [prs|issues|all]` renders the triage table and footer. Both are pure renderers exported for tests, offline under `--no-llm`; Ollama only phrases 6-word Notes (`gemma4:e2b`), CI failure lines (`classify` route, ministral fallback) and the triage recommendation (`draft`). Replaces LLM table/graph/timeline/histogram/sequence-diagram/CI rendering and `midnite-triage` with `scripts/skills/sitrep.mjs` and `scripts/skills/triage.mjs`, yielding the single highest recurring token savings across sessions.

**Theme C — Git, report, retro & release scripts (`PR-3`, M).** ✅ Landed. `scripts/skills/git-report.mjs` (SAST day/week/month windows from `sast.mjs`, merged PRs pinned with `+02:00` bounds, phase progress read from the category `_INDEX.md` tables only, `done.md` items shipped in range, a PDF made by injecting a `DATA` block into `pdf-template.html` and printing with headless Chrome — skipped, never failed, when no Chrome is found). `retro.mjs` takes a required scope + `1m|3m|6m|1y`, harvests merged PRs and releases, counts bot PRs instead of listing them, classifies by conventional prefix, clusters by phase then scope, scores novelty from evidence in the PR (measured number, new package, exploratory) and lets `qwen3.5:9b` add evidence and theme names only when it parses. `release-prep.mjs` plans by default (preconditions, base tag, `planRelease`, per-app attribution, drafted changelog) and `--apply` branches, bumps, writes every changelog and commits — never tags or pushes. `release-complete.mjs` checks the skill's preconditions as a state machine and executes tag/push steps only with `--confirm vX.Y.Z` matching exactly, plain tag last and pushed alone, stopping and reporting at the first failure; `--verify vX.Y.Z` checks the Release assets, `version.json`, `latest-mac.yml` and `catalog.json`. Merging the release PR stays a human step. Needs `moon run shared:build` (the planner is read from `packages/shared/dist`). Tests: `git-report.test.mjs`, `retro.test.mjs`, `release-scripts.test.mjs`, all with mocked git/gh/fetch.

**Theme D — PR, review, sanitize & issue scripts (`PR-4`, M).** ◻ TODO. Static rubric pre-linter (`pr-review-lint.mjs`), PR creation/description/feedback/audit CLIs, `address-issue.mjs` board scanner/scorer, and `sanitize-wrap.sh` sandboxed clone + `scan.py` + provenance wrapper.

**Theme E — Orchestrate, build, verify & media scripts (`PR-5`, L).** ◻ TODO. Machine CPU/RAM/cap daemon (`orchestrate-cap.sh`), `worktree-lifecycle.sh`, `verify-phase.mjs`, `test-classify.mjs`, and `scripts/skills/media/` validators, job pollers, map/sprite calculators, and scaffolders.

**Theme F — Wire 47 `SKILL.md` files & reconcile copies (`PR-6`, M).** ◻ TODO. Updates `.agents/skills/midnite-*/SKILL.md`, `.claude/skills/midnite-*/SKILL.md` (preserving `allowed-tools`/`AskUserQuestion`), and `.codex/skills/midnite-*/SKILL.md` to invoke `scripts/skills/*`, and removes stale `docs/screenshots/` commit instructions in `midnite-pr-description-image`.

## Deliverables

### Theme A — Skill runtime library & Ollama router (`M`)

- [x] **151.A.1** Create `scripts/skills/lib/ollama.mjs`: probes `http://localhost:11434/api/tags` (configurable via `MSTUDIO_OLLAMA_URL`), routes `classify`/`note` tasks to `gemma4:e2b` or `ministral-3:3b` and `draft`/`audit` tasks to `qwen3.5:9b` (or `qwen3.5:9b-64k` for >8k chars), enforces `--no-llm` flag / `MSTUDIO_NO_LLM=1`, and invokes a caller-supplied deterministic `fallback()` when Ollama is unreachable.
- [x] **151.A.2** Create `scripts/skills/lib/git.mjs` and `scripts/skills/lib/gh.mjs`: NUL-delimited (`-z`, `%x00`) git helpers (`shortstat`, `logRange`, `worktreeList`, `isTracked`) and batched `gh` JSON wrappers (`prView`, `prList`, `prChecks`, `issueList`, `runList`) with clear auth/rate-limit error envelopes.
- [x] **151.A.3** Create `scripts/skills/lib/tasks-index.mjs` and `scripts/skills/lib/format.mjs`: parses/updates `.midnite/tasks/<CATEGORY>/_INDEX.md` tables, counts `- [x]`/`- [ ]` checkboxes in `phase-*.md`, renders 10-cell/20-cell progress bars (`█`/`░`), `🟩 +A 🟥 -D 📄 F` diffs, and markdown tables.
- [x] **151.A.4** Create `scripts/skills/sync-skills.mjs`: audits `.agents/skills/`, `.claude/skills/`, and `.codex/skills/` parity while preserving intentional Claude-specific frontmatter (`argument-hint`, `allowed-tools`) and `AskUserQuestion` vs runtime-neutral prompts.
- [x] **151.A.5** Add unit tests (`scripts/skills/lib/*.test.mjs`) covering Ollama fallback/routing, NUL-delimited git parsing, progress bar math, and `_INDEX.md` table round-tripping.

### Theme B — Sitrep & forge triage CLI (`M`)

- [x] **151.B.1** Create `scripts/skills/sitrep.mjs` with subcommands matching the sitrep family: `table` (10-cell bars, `🟩/🟥/📄` diffs, batch line), `graph` (hard `──▶` & soft `┄┄` file-overlap edges, topological merge order), `timeline` (wave slot scheduler under `--cap N`, critical path `★`), `histogram` (`diff`/`ci`/`age`/`stage` 30-cell bars with `┊ median` and `2×` outlier `⚠️`), `sequence` (chronological `git`/`gh` timeline), and `ci` (job grid, stale-head detection, 5-job macOS cap queue, billing-stop match).
- [x] **151.B.2** Integrate optional Ollama 6-word `Notes` (`gemma4:e2b`) and CI `--log-failed` 1-line error summarization (`ministral-3:3b`) into `sitrep.mjs`, with deterministic regex/title fallbacks under `--no-llm`.
- [x] **151.B.3** Create `scripts/skills/triage.mjs`: batches `gh pr list` + `gh issue list`, computes status emoji rollups (`✅/❌/🟡/⚪`, `👍/🔴/👀`, `🟢/⚔️`, `🤖/📝/👤`, `🕐/🕒/🕗`), priority-sorts rows, renders the markdown triage table + footer counts, and optionally drafts the 1-sentence next action via Ollama.
- [x] **151.B.4** Add unit tests (`scripts/skills/sitrep.test.mjs`, `scripts/skills/triage.test.mjs`) with fixture JSON payloads for all 6 sitrep views and triage sorting.

### Theme C — Git, report, retro & release scripts (`M`)

- [x] **151.C.1** Create `scripts/skills/git-report.mjs`: computes SAST (`+02:00`) date windows (`day`/`week`/`month`), fetches merged PRs + `.midnite/tasks/` phase progress, injects JSON into `.agents/skills/midnite-git-report/pdf-template.html`, renders tables + optional Ollama 1-line headline, and invokes headless Chrome `--print-to-pdf`.
- [x] **151.C.2** Create `scripts/skills/retro.mjs`: enumerates active org/user repos, harvests merged PRs/releases in `1m`/`3m`/`6m`/`1y` windows, filters bot PRs, tags conventional prefixes, and optionally batches PRs through `qwen3.5:9b` for novelty scoring and theme clustering.
- [x] **151.C.3** Create `scripts/skills/release-prep.mjs` and `scripts/skills/release-complete.mjs`: automates clean-tree/tag preconditions, runs `planRelease` + `scripts/changelog-attribution.mjs` + `scripts/version-check.mjs`, optionally drafts categorized `CHANGELOG.md` entries via `qwen3.5:9b`, verifies `changelog-sections-check.mjs` + `gh secret list` + post-publish `version.json`/`latest-mac.yml`/`catalog.json` checks.
- [x] **151.C.4** Add unit tests (`scripts/skills/git-report.test.mjs`, `scripts/skills/release-scripts.test.mjs`) covering SAST window math, template injection, and release tag/precondition state machines.

### Theme D — PR, review, sanitize & issue scripts (`M`)

- [ ] **151.D.1** Create `scripts/skills/pr-review-lint.mjs`: deterministic static rubric scanner checking diffs for missing `-z`/`%x00` in git commands, `write-queue.ts` bypasses, `lucide-react` / Quick Kiss imports, hardcoded chords outside `COMMANDS`, wall-clock `toBeLessThan` / bare `waitForTimeout`, `SCRATCHPAD.md` tracked, and `Co-Authored-By` trailers; outputs JSON findings + optional `qwen3.5:9b` draft suggestions.
- [ ] **151.D.2** Create `scripts/skills/pr-create.mjs`, `scripts/skills/pr-description.mjs`, `scripts/skills/pr-feedback.mjs`, and `scripts/skills/pr-audit.mjs`: automates branch/duplicate guards, trailer/scratchpad checks, `gh pr create --draft`, CI flake matching + single rerun, comment-hygiene scanning, and L1–L4 contract/schema JSON extraction (`channels.ts`, zod schemas).
- [ ] **151.D.3** Create `scripts/skills/address-issue.mjs`: scans `midnite-studio` + `midnite-apps` open issues excluding claimed/wontfix, strips prompt-injection markers, scores/sizes (`[XS]`–`[XL]`) via `qwen3.5:9b` or label heuristics, and outputs the 4-option selection table.
- [ ] **151.D.4** Create `scripts/skills/sanitize-wrap.sh`: sandboxes `git clone --no-checkout` + `core.hooksPath=/dev/null`, runs `python3 -I .agents/skills/midnite-sanitize/scan.py --json`, fetches GitHub repo/author provenance, optionally runs `qwen3.5:9b` prose intent check, and performs commit-pinned `git archive` install on confirmation.
- [ ] **151.D.5** Add unit tests (`scripts/skills/pr-review-lint.test.mjs`, `scripts/skills/pr-scripts.test.mjs`) for all static rubric rules and CI flake classification.

### Theme E — Orchestrate, build, verify & media scripts (`L`)

- [ ] **151.E.1** Create `scripts/skills/orchestrate-cap.sh` and `scripts/skills/worktree-lifecycle.sh`: polls `top` + `memory_pressure` to compute the 2–6 subagent cap state machine + ASCII bars, checks subagent context token usage via `jq`, detects stalled worktrees, and standardizes worktree create/install/`SCRATCHPAD.md`/remove/prune.
- [ ] **151.E.2** Create `scripts/skills/verify-phase.mjs` and `scripts/skills/test-classify.mjs`: locates oldest incomplete phase in `_INDEX.md`, runs `moon run :typecheck :lint :test` / `tracker-check.mjs`, partitions automated vs human checklist items, updates `_INDEX.md` + `done.md`, and classifies test failures (boundary, TS, `index.lock`, auth, timeout) via regex + `ministral-3:3b`.
- [ ] **151.E.3** Create `scripts/skills/media/validate.mjs`, `scripts/skills/media/map-calc.mjs`, `scripts/skills/media/sprite-calc.mjs`, `scripts/skills/media/poll-job.mjs`, and `scripts/skills/media/scaffold.sh`: enforces audio/image/docs/sfx/model/terrain constraints, map `sideM` & power-of-2+1 grid math, sprite spend (`≤200`) & method switch, MCP job polling, and project scaffolding without clobbering app-owned sidecars.
- [ ] **151.E.4** Add unit tests (`scripts/skills/media/media-scripts.test.mjs`, `scripts/skills/verify-phase.test.mjs`) covering cap state transitions, phase checkbox partitioning, map/sprite math, and media validators.

### Theme F — Wire 47 `SKILL.md` files & reconcile copies (`M`)

- [ ] **151.F.1** Update `midnite-sitrep*` (7), `midnite-triage`, `midnite-git-report`, `midnite-retro`, `midnite-release-*` (2), and `midnite-deploy` `SKILL.md` files in `.agents/skills/` to invoke `scripts/skills/*.mjs` as their primary execution path.
- [ ] **151.F.2** Update `midnite-pr-*` (6), `midnite-check-yourself`, `midnite-address-issue`, `midnite-sanitize`, `midnite-maintain`, `midnite-build*` (2), `midnite-orchestrate`, `midnite-fleet`, `midnite-swarm`, `midnite-agents`, `midnite-plan*` (2), `midnite-refine`, `midnite-design`, `midnite-setup`, `midnite-test`, and `midnite-verify` `SKILL.md` files in `.agents/skills/` to invoke `scripts/skills/*`, and remove stale `docs/screenshots/` commit steps in `midnite-pr-description-image`.
- [ ] **151.F.3** Update all 10 `midnite-media-*` `SKILL.md` files in `.agents/skills/` to invoke `scripts/skills/media/*` validators, calculators, pollers, and optional Ollama prompt/spec generators.
- [ ] **151.F.4** Propagate updated `SKILL.md` files to `.claude/skills/` and `.codex/skills/` via `scripts/skills/sync-skills.mjs` (preserving Claude frontmatter and `AskUserQuestion`) and verify `moon run root:test-node` (`skill-copies.test.mjs` + `tracker-check.mjs`).

## Verification

- [ ] `node scripts/tracker-check.mjs` passes with Phase 151 registered in `.midnite/tasks/FEATURES/_INDEX.md`.
- [ ] `moon run root:test-node` passes all new `scripts/skills/**/*.test.mjs` suites with `--no-llm` (no live Ollama daemon required in CI).
- [ ] Smoke-test `node scripts/skills/sitrep.mjs table --no-llm` and `node scripts/skills/triage.mjs --no-llm` against live `gh` output in a worktree.
- [ ] Smoke-test `ollama` integration locally with `gemma4:e2b` / `qwen3.5:9b` running on `localhost:11434`.
