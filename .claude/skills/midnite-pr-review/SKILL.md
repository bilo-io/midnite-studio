---
name: midnite-pr-review
description: Review a Midnite Studio pull request against this repo's own conventions (CLAUDE.md), flagging findings as CRITICAL, WARNING, NIT or PRAISE, and either post them as inline GitHub review comments or list them in session. Use when asked to review a PR, check a diff for bugs or convention breaks, or when the user says "midnite-pr-review" or "pr-review".
argument-hint: "[PR number or URL] [--no-post | --post]"
allowed-tools: Bash, Read, Glob, Grep
---

# PR review, Midnite Studio

Reviews one PR in `bilo-io/midnite-studio` against the conventions in `CLAUDE.md`. Every finding
carries a severity: CRITICAL, WARNING, NIT or PRAISE. Read `CLAUDE.md` first if this session has
not; the rubric below is its checklist, not a replacement for it.

**Repo and auth.** The repo is `bilo-io/midnite-studio`. The active `gh` account is often not
`bilo-io`, so every `gh` call is `GH_TOKEN="$(gh auth token -u bilo-io)" gh …`. Never
`gh auth switch`.

**Scope.** Review only what the PR changes. Do not flag pre-existing code, untouched files or
repo-wide concerns. A changed line may be explained by its surroundings, but the issue itself must
come from the diff.

**Tone.** Constructive. Assume reasonable choices; phrase findings as suggestions or questions.
Reserve CRITICAL for real bugs, data loss, security holes and broken boundaries. When in doubt,
NIT. Give PRAISE where it is earned.

**Severity follows the cost of the fix.** A mechanical slip fixed in seconds that CI catches at
once (a stale snapshot, an unsorted import) is a NIT.

## Rubric: this repo's conventions

Apply only the sections the diff touches.

### Git engine (`packages/git-engine`, anything shelling out to git)
- **NUL-delimited parsing.** `-z` and `%x00` separators. Splitting git output on whitespace or
  newlines is CRITICAL (branch names and commit subjects contain both).
- **Writes go through the per-repo write queue** (`git-engine/src/exec/write-queue.ts`). A git
  write that bypasses it races on `index.lock`: CRITICAL.
- **Lane layout runs in main**, inside git-engine. The renderer receives laid-out `GraphRow`
  batches; layout work on the render thread is a WARNING.
- **Destructive ops need a confirm dialog showing blast radius** (`rev-list --count` of the
  commits about to be orphaned). A destructive op without one is CRITICAL.
- **Force-push is `--force-with-lease` with an explicit `ref:expect`**, never a bare `--force`,
  never a boolean, never from the title bar's sync cluster. It is reachable only through the
  per-ref badge menu, offered after a rejected plain push, behind the default-off
  `Allow force-push (with lease)` setting and the blast-radius confirm. Anything else: CRITICAL.

### IPC and the wire (`packages/shared`, handlers in `packages/desktop` and feature `main/`)
- **IPC ops never throw across the boundary.** They return the `GitOpResult` envelope
  (`{ok:true}` or `{ok:false, kind:'conflict'|'error', …}`). A handler that throws, or a conflict
  surfaced as an exception: CRITICAL.
- New channels and payloads are zod schemas in `shared`, with the channel constant and the preload
  bridge type updated together.
- **A credential never lives in renderer `localStorage`.** Secrets go through the vaults (forge
  account vault, credential vault, secrets vault). A token in a persisted ui-store blob, or a
  secret value sent to the renderer rather than a `hasToken`-style boolean: CRITICAL.

### Package boundaries (eslint enforces these; a disabled rule or an `eslint-disable` is itself a finding)
- `shared` is zod only: no other workspace package, never `electron`.
- `git-engine` never imports `electron`. The renderer (`app`) reaches main only through
  `window.midniteStudio` and imports no git-engine, desktop, electron or node builtins.
- `runtime` is main-process only and imports no `electron`, `node-pty` or `electron-updater`.
- An app composes modules, features and the frame and never imports another app. A module
  (`packages/modules/<id>`) never imports an app or another module (it takes what it needs from a
  host port), its `manifest.ts` imports `shared` only, and nothing below an app (feature, frame,
  runtime) imports a module. A feature imports the frame and `shared` and never an app or another
  feature (they meet through the link router and `shared` ids). The frame never imports a feature.
- A new feature package is listed in `apps/studio/src/composition.ts`.
- `apps/launcher` and `packages/website` stay off the graph. The website never links to or names
  `bilo-io/midnite-apps` and never copies `quick-kiss.ttf`.
- **The fix for a boundary rule firing is an IPC channel, not an exception.**

### Renderer and UI
- **Icons come from `react-icons`, one set at a time** (`react-icons/lu`, `react-icons/md`), never
  the package root and never `lucide-react`. A new `Lu…` name must exist
  (`components/icons/icon-names.test.ts` checks).
- New commands are declared in `shared/src/keybindings.ts` (`COMMANDS`), not a chord literal
  elsewhere. `Mod+r`, `Mod+Shift+r`, `Mod+l` and `Mod+Shift+l` keep their meanings. `Ctrl+`` stays
  the terminal toggle.
- Standard React hygiene applies (hook deps, effect cleanup, list keys, icon-only buttons need an
  `aria-label`), as do TypeScript basics (no `any`, no unjustified `!`, no unhandled promises).

### Tests
- **The decision rule.** A new test is vitest/jsdom unless it needs a real browser capability
  (layout, CSS, pointer drag, xterm, canvas, focus order, multi-view flow). A Playwright e2e or
  visual spec names which capability in its header comment. An e2e where vitest would do: WARNING.
- **No wall-clock asserts** (`expect(elapsed).toBeLessThan(…)`) and no sleeps; use fake timers or
  event waits: WARNING.
- Logic changes without a test that fails without them: WARNING.
- `scripts/e2e-budget.mjs` ratchets declared e2e tests and visual baselines; growing either needs
  a stated reason.
- **Screenshots are taken with the repos panel closed** (`installMockBridge` from
  `e2e/shots-helper.ts` seeds `reposOpen: false`) unless the shot is about that panel. A visual PR
  without screenshots in its body: WARNING.

### CI and platform
- A job that exercises platform behaviour stays on a `macos-*` runner. Adding a macOS job must be
  counted against the **5 concurrent macOS jobs** cap. A `ubuntu-*`/`windows-*` leg on a default
  gate is a decision, not a drive-by: WARNING.
- Nothing in the local loop starts a container.

### Tracker and docs hygiene
- A phase PR leaves `.midnite/tasks/` consistent: an entry appended to `done.md`, the theme's
  narrative in the phase doc's `## Headlines` paragraph, and **only the row** touched in
  `_INDEX.md`. Prose added to `_INDEX.md` is a WARNING.
- **`CLAUDE.md`, `AGENTS.md` and `GEMINI.md` stay in sync.** An edit to one without the same edit
  in the others: WARNING.
- Skills ship as byte-identical copies in `.claude/`, `.agents/` and `.codex/`
  (`scripts/skill-copies.test.mjs`).
- Commits carry no `Co-Authored-By`, `Signed-off-by` or other attribution trailer, and are authored
  as `bilo-io`.

## Workflow

**Never create a worktree for a review.** Work from `gh pr diff` and the GitHub API.

1. **Fetch the diff.** `GH_TOKEN="$(gh auth token -u bilo-io)" gh pr diff <n> --repo
   bilo-io/midnite-studio`. Note file paths (to pick rubric sections) and line positions (to anchor
   comments).
2. **Choose the output mode.** `--no-post`, "just show me", "in chat" or a call from
   `midnite-check-yourself` means in-session with no GitHub write of any kind. "post it" or
   `--post` means inline comments. With neither, ask once: post to the PR or list in session.
3. **Deliver** by the mode below.
4. **Summarise**: areas reviewed, overall quality, systemic patterns.

**Approval is opt-in.** A posted review is `event: "COMMENT"`, never `APPROVE` or
`REQUEST_CHANGES`, unless the user opted in; a nit-only PR is then reported as approve-ready, and
an approving body is `LGTM` or `🚀` alone. **A red CI check is not a finding**; the branch
protection already blocks on it. Report it in one line, unless it points at a real defect in the
diff, in which case the finding is that defect at its line.

**No reviewer is ever requested by this skill.** A draft never has one; see
`midnite-check-yourself`.

### Mode A: inline review comments on the PR

Post every finding as one review, so each is a resolvable thread on its line:

```bash
GH_TOKEN="$(gh auth token -u bilo-io)" gh api repos/bilo-io/midnite-studio/pulls/<n>/reviews \
  --method POST --input review.json
```

`review.json` carries `commit_id` (the PR's `headRefOid`), `body`, `event: "COMMENT"` and
`comments[]` with `path`, `line`, `side: "RIGHT"` (`start_line` for ranges) and `body`. Build it as
a file; bodies hold backticks and newlines. The review `body` opens with the header from
[`review-header.md`](review-header.md). Never `gh pr comment`.

Open each comment with the GitHub alert for its severity, then one synopsis line inside it, and the
explanation and fix below it:

| Severity | Alert |
|---|---|
| CRITICAL | `> [!CAUTION]` |
| WARNING | `> [!WARNING]` |
| NIT | `> [!NOTE]` |
| PRAISE | `> [!TIP]` |

```markdown
> [!WARNING]
> `fetchBranches` splits on newlines

Branch names may contain newlines, so `git for-each-ref` must run with `-z`.

**Fix:** `--format=%(refname)%x00` and split on `\0`.
```

Rules: no em dashes; no square brackets outside links and the alert marker; the synopsis is a
claim, not a category; never write the severity word inside the alert; length follows the fix;
language-tagged fences; a `suggestion` block when the fix is a literal replacement; link PRs and
files rather than bare paths.

### Mode B: in session

Print findings, most severe first, PRAISE included, with no GitHub call at all:

```markdown
🔴 **CRITICAL** short claim
[path/to/file.ts:42](path/to/file.ts#L42)

What breaks.

**Fix:** the concrete change.
```

Circle plus bold word (🔴 CRITICAL, 🟡 WARNING, ⚪ NIT, 🟢 PRAISE), because alerts do not render in
a terminal. The prose rules above still apply.

### Summary

```markdown
## Summary

- **Areas reviewed:** …
- **Overall quality:** …
- **Systemic patterns:** …
```
