# Phase 98 — Setup wizard overlay

Brainstormed with the user · 2026-09-26 · grounded against the tree as of `006b224f`.

Midnite Studio greets a new user with two small modals, one after the other. One is a health checklist and the other is a two-step frame
(`welcome`, `forges`). This phase replaces both with **one full-window setup overlay**. The brand
mark opens it: centred, with a blinking caret, it types out **Midnite** in the gradient brand face,
then glides into place as the fixed anchor beside every page title. Each page title is typed, and
each body fades in underneath. The pages walk the machine from nothing to ready:

1. git
2. forges and their CLIs
3. accounts and git identity
4. the Midnite CLI
5. the rest of the toolchain
6. local models with Ollama

A completion transition then lands on **"Welcome to [logo] Midnite Studio"**.

Leaving early is a first-class path, not a failure. **X** or **Skip >** says you can pick setup
up again from the FAB, fades the FAB in with an arrow pointing at it, and then dissolves. The FAB
gains a **Resume setup** leaf for that.

> **Builds on.**
> - **The current wizard.** There are two surfaces, both mounted from [`app.tsx`](../../../packages/app/src/app.tsx):
>   - [`first-run-modal.tsx`](../../../packages/app/src/features/onboarding/first-run-modal.tsx)
>     is gated on `ui-store.onboardedAt === null` and renders `HealthChecklist compact`.
>   - [`onboarding-modal.tsx`](../../../packages/app/src/features/onboarding/onboarding-modal.tsx)
>     is gated on `showOnboarding`. It is driven by the flat
>     [`ONBOARDING_STEPS`](../../../packages/app/src/features/onboarding/onboarding-steps.ts) registry
>     (`WizardStep {id, title, optional, Component}`,
>     [`wizard-step.ts`](../../../packages/app/src/features/onboarding/wizard-step.ts)), and it
>     persists skips into `onboardingSkippedStepIds`, which
>     [`accounts-page.tsx`](../../../packages/app/src/features/settings/settings-pages/accounts-page.tsx) reads back.
>   - [`forge-connect-step.tsx`](../../../packages/app/src/features/onboarding/steps/forge-connect-step.tsx)
>     already adds GitHub, GitLab, Bitbucket and Azure accounts through `useAddForgeAccount`.
> - **Brand and motion.**
>   - [`brand.tsx`](../../../packages/app/src/components/brand.tsx) provides `BrandMark` (the `logo.png`
>     disc) and `Wordmark` ("Midnite" in `--font-brand`, which is Quick Kiss). `--rainbow-ramp` is the brand gradient, and
>     `.agent-count-text` is the gradient-text precedent.
>   - A `caret-blink` keyframe already exists in `styles.css`.
>   - [`use-title-typewriter.ts`](../../../packages/app/src/features/slides/use-title-typewriter.ts) (from slides) already types a
>     title and honours reduced motion.
>   - [`use-reveal.ts`](../../../packages/app/src/components/use-reveal.ts) provides `motionMs()`, which returns 0 under
>     `data-motion='reduced'`.
>   - [`styles-motion-guards.ts`](../../../packages/app/src/styles-motion-guards.ts) fails the
>     build on any keyframe that is unguarded or any loop that is ungated.
> - **Chrome.**
>   - [`ThemeToggle`](../../../packages/app/src/components/theme-toggle.tsx) is a
>     portalled, window-clamped menu designed for a top-right trigger.
>   - The FAB is inline in `app.tsx` (`data-testid="fab-button"`, `absolute bottom-4 right-4 z-20`). It calls
>     `toggleQuickAccess()` and is hidden while `fabPanelDocked || companionDocked`.
>   - **There is no coachmark or spotlight mechanism yet.**
> - **Overlay infrastructure.**
>   - [`useDismiss`](../../../packages/app/src/components/use-dismiss.ts)
>     with `layer: 'dialog', blocking: true` also registers the occluder, which hides the browser `WebContentsView`.
>     Do not call `useOccluder` as well, or the count doubles.
>   - `useFocusTrap` handles focus.
>   - [`occluder-coverage.test.tsx`](../../../packages/app/src/components/occluder-coverage.test.tsx)
>     lists every overlay.
> - **Probes.**
>   - [`system-health.ts`](../../../packages/desktop/src/main/system-health.ts) has
>     `probeBinary(name, paths)`, which checks known paths, then `which`, then `--version`. It already covers git, brew, node, pnpm, moon,
>     ollama and the Ollama daemon, over the `systemHealth` channel.
>   - [`git-version.ts`](../../../packages/app/src/features/settings/settings-pages/git-version.ts)
>     parses git versions.
>   - **Installs are never run headless.** `health-page.tsx` types `brew install …` into a
>     real terminal session via `submitCommand`, and this phase keeps that rule.
> - **Midnite CLI (Phase 33).** The `cliStatus`/`cliInstall` channels, plus
>   [`cli-path.ts`](../../../packages/desktop/src/main/cli-path.ts).
> - **Forge accounts (Phase 90).**
>   - [`forge-accounts.ts`](../../../packages/desktop/src/main/forge/forge-accounts.ts)
>     provides `listForgeAccounts`, `addForgeAccount` and `switchActiveForgeAccount`.
>   - [`whoami.ts`](../../../packages/desktop/src/main/forge/whoami.ts) returns `{login, displayName, avatarUrl}`.
>   - `ghStatus` ([`gh-shell.ts`](../../../packages/desktop/src/main/forge/github/gh-shell.ts))
>     is the only forge-CLI probe; there is **no glab or az detection**.
>   - [`ForgeAccountSchema`](../../../packages/shared/src/domain/forge-account.ts) has **no email**.
>   - **Nothing reads `git config user.name/email` over IPC.**
> - **Ollama (Phase 96).**
>   - `ollamaPull` / `ollamaPullCancel`, with the `ollamaPullProgress` event.
>   - Main's [`pull-queue.ts`](../../../packages/desktop/src/main/ollama/pull-queue.ts)
>     keeps a pull alive whatever the renderer shows.
>   - **But** [`models-pull-queue-store.ts`](../../../packages/app/src/features/models/models-pull-queue-store.ts)
>     is only fed while [`models-view.tsx`](../../../packages/app/src/features/models/models-view.tsx) is mounted,
>     so a pull started anywhere else loses its progress.
>   - Total RAM exists only in the metrics stream
>     ([`memory.ts`](../../../packages/desktop/src/main/metrics/memory.ts)). There is no one-shot read.

> **Scope guardrails.**
> - **macOS only**, per `CLAUDE.md`, with Homebrew as the recommended installer.
> - **Every install runs in a visible integrated-terminal session**, so a sudo or password prompt can be answered.
>   Main never installs anything headlessly.
> - It opens automatically **on first run only**. Existing users reach it from the FAB and the palette,
>   and it never re-pops unasked.
> - It is not repo onboarding. That is [Phase 49](phase-49-repo-onboarding.md)'s job.
> - Package boundaries hold:
>   - the catalogues and schemas live in `shared`;
>   - probes and git-config reads/writes live in `desktop` (and `git-engine`);
>   - the renderer reaches all of it through `window.midniteStudio`.

> **Effort tags.** S ≈ ≤½ day · M ≈ 1–2 days · L ≈ 3+ days.

---

## Deliverables

### A — Overlay frame and first-run gate (M)

- [ ] `features/setup/setup-overlay.tsx` covers the app window at `z-dialog`, registered through
      `useDismiss({layer: 'dialog', blocking: true})` and `useFocusTrap`. It is added to
      `occluder-coverage.test.tsx`.
- [ ] Chrome:
      - an **X** icon button at top left;
      - `ThemeToggle` at top right;
      - **pagination dots** bottom-centre, where the current dot is active and completed dots are filled;
      - a **"Skip >"** text link underneath the dots.
- [ ] The step registry grows from `ONBOARDING_STEPS` into `SETUP_PAGES`. It keeps the
      flat-array rule (a page is added by appending a row). Each row gains `titleTyped: string` and an
      optional `canAdvance` predicate, and the frame keeps its Back/Next controls.
- [ ] A page state machine: `intro → page[i] → finale → closed`. Back/Next plus ←/→ step
      between pages, and Esc routes to the X path (Theme C). Every non-intro, non-finale page is
      optional.
- [ ] One persisted gate replaces both latches:
      - `setupState: {completedAt, dismissedAt, lastPageId, skippedPageIds}`, entered in `persisted-keys.ts`.
      - Migration: `onboardedAt !== null` **or** `showOnboarding === false` counts as done, so existing users never see it.
      - The old `onboardingSkippedStepIds` maps into `skippedPageIds`.
- [ ] Remove `FirstRunModal` and `OnboardingModal` along with their mounts in `app.tsx`. Move
      `ForgeConnectStep`'s card logic into Theme E/F pages. Point the `accounts-page.tsx` "resume
      skipped step" affordance at the overlay.
- [ ] Add a chord-free `setup.open` command ("Run setup wizard") in
      [`keybindings.ts`](../../../packages/shared/src/keybindings.ts) `COMMANDS`, handled in
      `use-command-handlers.ts`.
- [ ] Vitest:
      - gate and migration: fresh profile, old-onboarded profile, old-skipped profile;
      - page navigation and key handling;
      - the frame renders X, theme toggle, dots and Skip.

### B — Brand choreography (M)

- [ ] **Intro.** `BrandMark` is centred with a blinking caret beside it (reusing `caret-blink`). "Midnite" is
      typed character by character in `font-brand` with the `--rainbow-ramp` gradient clipped to the text.
- [ ] **Hand-off to the anchor.** The wordmark fades while the mark **translates and scales**
      (FLIP: measure the anchor slot, then transform) into the title anchor at the left of page 1's title.
- [ ] **A fixed anchor.** The mark is rendered once by the frame, not by pages, so it never moves
      between pages. It moves only at intro → page 1 and at the last page → finale (Theme J).
- [ ] **Typed titles and fading bodies.** Each page title types via `useTitleTypewriter`. The body mounts with an
      opacity-only transition after the title completes, and the caret parks at the title's end.
- [ ] **Reduced motion.** Under `data-motion='reduced'`, every step resolves instantly: the title is shown whole, the body
      appears without a fade, and the mark is placed at the anchor. The new keyframes pass
      `styles-motion-guards.ts`, with no allowlist additions.
- [ ] Vitest for the choreography sequencer (intro phases, typed-then-reveal ordering,
      reduced-motion short-circuit), using fake timers.

### C — Skip / X → FAB handoff and resume (S/M)

- [ ] **Both X and Skip >** start the handoff:
      1. the page content fades out;
      2. the hint "You can always continue setup from here" appears near the bottom right;
      3. the FAB fades in (it is kept hidden behind the overlay until now);
      4. an arrow points at it with a **repeating pointing (nudge) animation**;
      5. after a beat, or on any click, the overlay dissolves.
- [ ] If the FAB is hidden (`fabPanelDocked || companionDocked`), the hint is re-worded to name the
      palette command instead, and no arrow is shown.
- [ ] Skip records the current page in `skippedPageIds`, and both paths set `dismissedAt` and `lastPageId`.
- [ ] The FAB quick-access menu gains a **Resume setup** leaf while `completedAt === null`. It reopens
      at the first page that is neither complete nor skipped, and it skips the intro and plays the
      mark straight into the anchor.
- [ ] Playwright e2e (needs real layout: the arrow aims at the FAB's `getBoundingClientRect`):
      Skip, then the hint and arrow are visible and target the FAB, the overlay is gone, and
      Resume reopens at the right page.

### D — Setup catalogue, probes and the install runner (M)

- [ ] `shared/src/setup.ts` holds the **setup catalogue**. Each item is
      `{id, label, group, probe: {bin, versionArg}, install: {brew: formula | cask}, icon, brandColor}`
      and is zod-validated. The icon is a `react-icons` set name plus an export name, e.g. `si`/`SiGithub`, resolved in `app`.
- [ ] Add a `setupProbe(ids)` channel and schema. `desktop` generalises `system-health.ts`'s
      `probeBinary` into a catalogue-driven probe returning `{id, installed, version, path}`.
      Existing `systemHealth` callers are unchanged.
- [ ] **Install runner (renderer).**
      - Compose one `brew install …` / `brew install --cask …` line for the ticked items.
      - Run it in a **visible terminal session** via the existing `submitCommand` path.
      - Re-probe when that command exits and on window focus.
- [ ] **Homebrew bootstrap.** If brew is missing, offer its official install script (in the terminal)
      before anything else.
- [ ] **git fallback.** With no brew, offer `xcode-select --install`.
- [ ] Shared **status row** component: *checking* (spinner) → *installing* (spinner and a
      "running in terminal" link) → *ready*. *Ready* is a circle check that **pulses green, with a
      box-shadow glow around the stroke**, and it is gated and guarded like any loop.
- [ ] Vitest: catalogue schema round-trip, the probe parser, brew line composition (formula vs
      cask, no duplicates) and status-row states.

### E — Git, forge selection and forge CLIs (M)

- [ ] **Git page.**
      - Detected version (`parseGitVersion`) against a recommended minimum.
      - Missing or old → **Install git** via brew (or the Xcode CLT fallback), using the Theme D status row.
      - Present and current → a ready check.
- [ ] **Forge page.** Multi-select toggle buttons with each forge's icon and name (GitHub, GitLab,
      Bitbucket, Azure DevOps). They are checked-style and more than one can be selected. The selection persists in `setupState`.
- [ ] **Forge CLI page.** One Theme D status row per selected forge:
      - `gh` for GitHub (reusing `ghStatus`, so *not-authenticated* shows a `gh auth login` action);
      - `glab` for GitLab;
      - `az` plus the `azure-devops` extension for Azure.
      - **Bitbucket shows "token-based, no CLI needed"** instead of a spinner.
- [ ] Add the `glab` and `az` probes to the Theme D catalogue.
- [ ] Vitest: forge toggles, CLI rows derived from the selection, and Bitbucket's no-CLI state.

### F — Accounts and git identity (M)

- [ ] Add `gitIdentityGet` / `gitIdentitySet` channels and schemas: global `user.name` / `user.email`.
      Reading and writing happen in `desktop` via `git config --global`. This is not the per-repo write queue, because
      it is a global file rather than a repo. Writes return the `GitOpResult` envelope.
- [ ] **Account detection.** Merge the vault's accounts (`listForgeAccounts`) with a `gh`-delegated
      GitHub account discovered from `ghStatus`. Add a best-effort **email** from the forge API where the
      token's scope allows it (GitHub `/user/emails` needs `user:email`), falling back to the git config email.
- [ ] **Account cards** show `UserAvatar`, display name, login and email, plus the forge icon. Selecting one
      sets it active (`switchActiveForgeAccount`) and pre-fills the identity form.
- [ ] **Identity form.** Name and email are editable and prefilled from the selected account, falling back to the current
      git config. **Set as git identity** writes them globally.
- [ ] An **Add account** path reuses the old `ForgeConnectStep` token flow for any selected forge
      with no account yet.
- [ ] Vitest: identity schema, merge and de-dupe of vault plus gh accounts, and the email fallback order.

### G — Midnite CLI page (S)

- [ ] A page of its own:
      - what `midnite` does from a shell;
      - `cliStatus` shown in a Theme D status row;
      - **Install** calls `cliInstall({target: 'auto'})`;
      - the `pathExportLine` hint when the target is not on `PATH`.
- [ ] Vitest: installed, missing and not-on-PATH states.

### H — Toolchain checklist (M)

- [ ] Catalogue entries in four groups:
      - **Agent CLIs:** claude, codex, gemini.
      - **JS runtime:** node, pnpm, bun, proto.
      - **Containers / DB:** Docker or OrbStack (either satisfies the item).
      - **Media / misc:** ffmpeg, ripgrep, jq.
- [ ] Each row has a checkbox, then the **tool's brand icon on the left of its name in its brand colour**, a version once
      detected, and a Theme D status row. Rows that are already installed are checked and disabled.
- [ ] **Install selected** runs one brew line in the terminal, then re-probes.
- [ ] Vitest: grouping, default selection (missing items unchecked by default), and every
      catalogue icon resolving to a defined `react-icons` export (like `icon-names.test.ts`).

### I — Local models with Ollama (M)

- [ ] **Educational panel.** What Ollama is (local model runtime and why it matters to agents here), the
      recommended RAM to start (16 GB comfortable, 8 GB for small models) and a link to the Models page.
- [ ] Ollama is detected with `ollamaStatus`. If it is missing, `brew install --cask ollama-app` runs through Theme D, and a
      stopped daemon offers `open -a Ollama`.
- [ ] Add a `systemMemory` one-shot channel returning `{totalBytes}` (from `os.totalmem()` in `desktop`).
- [ ] A **curated model catalogue** in `shared`:
      - small, coder and reasoning tiers, each `{tag, label, sizeBytes, minRamGb, blurb}`;
      - rows are badged **fits / tight / too big** against this Mac's RAM;
      - too-big rows can still be ticked, behind a warning.
- [ ] **Start downloads.** Ticked models call `ollamaPull`. Progress shows inline, and the pull **keeps running
      when the wizard moves on or closes**.
- [ ] Lift the pull-progress subscription (`useRefetchModelsOnPullDone` and the
      `onPullProgress` feed into `useModelsPullQueueStore`) from `models-view.tsx` to app level, so
      the Models page shows pulls the wizard started.
- [ ] Vitest: RAM badge thresholds, catalogue schema, and progress reaching the store with the Models
      view unmounted.

### J — Completion transition and Welcome finale (S/M)

- [ ] **Leaving the last page** starts a completion transition. The page body dissolves, a brand-gradient
      bloom/ring sweeps outward from the anchor, and the dots resolve into one filled state.
- [ ] **Finale.** The heading reads "Welcome to [mark] **Midnite** Studio". The mark leaves the title anchor and
      **moves into the line** between "to" and the wordmark. Only "Midnite" wears `--font-brand` and the
      gradient, and "Studio" stays in the UI font, mirroring `Wordmark`.
- [ ] **Get started** sets `completedAt` and fades the overlay out to the app, and the FAB's Resume leaf disappears.
- [ ] Reduced motion swaps the transition for a static finale, with no bloom.
- [ ] One Playwright visual baseline of the finale, which needs real fonts and gradient rendering, within the
      `e2e-budget.mjs` caps.

---

## Files this phase touches

| Area | Files |
|---|---|
| Overlay + pages | new `packages/app/src/features/setup/` (overlay, choreography, pages, status row); removes [`first-run-modal.tsx`](../../../packages/app/src/features/onboarding/first-run-modal.tsx), [`onboarding-modal.tsx`](../../../packages/app/src/features/onboarding/onboarding-modal.tsx); folds [`forge-connect-step.tsx`](../../../packages/app/src/features/onboarding/steps/forge-connect-step.tsx) |
| Mount, FAB, commands | [`app.tsx`](../../../packages/app/src/app.tsx), [`keybindings.ts`](../../../packages/shared/src/keybindings.ts), `services/keybindings/use-command-handlers.ts` |
| State | [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts), [`persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts), [`accounts-page.tsx`](../../../packages/app/src/features/settings/settings-pages/accounts-page.tsx) |
| Brand / motion | [`brand.tsx`](../../../packages/app/src/components/brand.tsx), `styles.css`, [`styles-motion-guards.ts`](../../../packages/app/src/styles-motion-guards.ts), [`use-title-typewriter.ts`](../../../packages/app/src/features/slides/use-title-typewriter.ts) |
| Contract | new `packages/shared/src/setup.ts`; [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) |
| Main | [`system-health.ts`](../../../packages/desktop/src/main/system-health.ts), [`forge-accounts.ts`](../../../packages/desktop/src/main/forge/forge-accounts.ts), [`whoami.ts`](../../../packages/desktop/src/main/forge/whoami.ts), [`memory.ts`](../../../packages/desktop/src/main/metrics/memory.ts), new git-identity handler |
| Models | [`models-pull-queue-store.ts`](../../../packages/app/src/features/models/models-pull-queue-store.ts), [`models-view.tsx`](../../../packages/app/src/features/models/models-view.tsx), [`use-models.ts`](../../../packages/app/src/features/models/use-models.ts) |
| Tests | [`occluder-coverage.test.tsx`](../../../packages/app/src/components/occluder-coverage.test.tsx), new vitest suites per theme, one e2e spec (C), one visual baseline (J) |

## Verification

- [ ] A fresh profile opens the overlay on first launch. The intro types "Midnite", and the mark glides into
      the title anchor and does not move again until the finale.
- [ ] A profile onboarded under the old modals never sees the overlay, and can open it from the
      palette or the FAB.
- [ ] X and Skip both play the FAB handoff with a pointing arrow, and Resume setup reopens at the
      first unfinished page.
- [ ] On a Mac without brew or git, the git page bootstraps Homebrew and installs git in a visible
      terminal, and the row turns into a pulsing green check.
- [ ] With GitHub and GitLab selected, `gh` and `glab` rows probe and install. Bitbucket shows no-CLI.
- [ ] Choosing an account and **Set as git identity** changes `git config --global user.email`.
- [ ] The toolchain page shows brand-coloured icons, and **Install selected** runs one brew line.
- [ ] Ollama models started in the wizard keep downloading after it closes, with progress visible
      on the Models page.
- [ ] Finishing plays the completion transition and the "Welcome to [mark] Midnite Studio" finale.
- [ ] With reduced motion on, every animation resolves instantly and nothing loops.
- [ ] Human pass on the packaged app: first-run feel, timing and legibility in light and dark.
- [ ] `moon run :typecheck :lint :test` green; the e2e and visual budget are within the caps.

## Not in this phase

- Linux and Windows installers (winget, apt). The catalogue shape leaves room for them.
- Headless installs from main, or any install without a visible terminal.
- Re-showing the overlay to existing users after upgrade.
- Repo-level onboarding ([Phase 49](phase-49-repo-onboarding.md)).
- Adding OAuth device-flow login for forges. Token and `gh` delegation stay as Phase 90 built them.

## Decisions / open questions

- **Resolved: one phase covers the full vision.** Frame, choreography, all pages and the finale ship as themes of
  one phase.
- **Resolved: installs.** They use Homebrew in a visible terminal, fall back to `xcode-select --install` for git,
  and bootstrap brew itself when it is missing.
- **Resolved: X and Skip.** Both hand off to the FAB with a pointing arrow animation, and the FAB gains Resume setup.
- **Resolved: audience.** It opens automatically on first run only, and afterwards opens from the FAB or palette.
- **Resolved: the old modals.** One overlay replaces both `FirstRunModal` and `OnboardingModal`, with latch migration.
- **Resolved: accounts.** Detect, pick the active account, and write the global git identity through new channels.
- **Resolved: Ollama.** A curated catalogue gated by this Mac's RAM, with background pulls.
- **Resolved: toolchain.** It covers agent CLIs, the JS stack, containers/DB and media/misc, each with a brand-coloured icon.
- **Open: Bitbucket.** It has no official CLI. *Recommendation:* show "token-based, no CLI needed" rather than
  a status row.
- **Open: email source.** GitHub's `/user/emails` needs the `user:email` scope, which `gh`'s default
  token has but a narrow PAT may not. *Recommendation:* use it best-effort, falling back to the git config
  email, and never block the page on it.
- **Open: catalogue upkeep.** The model and toolchain catalogues are static in `shared`.
  *Recommendation:* review them each release, and do not fetch them remotely.
- **Open: test layers.** *Recommendation:* use vitest everywhere except the FAB handoff (e2e, which needs real layout)
  and the finale (one visual baseline, which needs real fonts and gradients).
- **Open: the FAB hidden while docked.** *Recommendation:* the hint names the palette command and
  shows no arrow. Do not force the FAB visible.
