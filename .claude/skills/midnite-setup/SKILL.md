---
name: midnite-setup
description: Bootstrap a brand-new project repo from scratch — ask ~10 questions about the stack and product, then scaffold a moon-style repo with a README, the onboarding kit (`.claude`/`.agents` skills, a tailored AGENTS.md with a CLAUDE.md that imports it, subagents), and one connected MVP phase per app, filed as GitHub issues.
argument-hint: "[optional: a project name or one-line description, and/or a target directory]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite, Agent
---

You are running the **setup** workflow: an interactive, human-in-the-loop session that **bootstraps a brand-new project repository** from nothing. You ask the user **~10 questions** — first about the **repo shape + stack**, then (the majority) about the **product's context** — and then scaffold the repo so it's immediately workable with the `midnite-plan` and `midnite-build` skills.

This skill is modelled on how **midnite-studio** itself is laid out (moon + proto monorepo, `.claude`/`.agents` skill mirrors, phases tracked as GitHub issues) — and it emits **exactly** [`templates/midnite/`](../../../templates/midnite/), the same checked-in onboarding kit the app's own Setup menu leaf copies into a repo (Phase 49 Theme A). One layout, one source of truth: this skill and the app must never describe two different shapes of "an onboarded repo" again. The output is a *seed*, not a finished product — one MVP phase doc per app, connected where the apps depend on each other, ready for `/midnite-build` to pick up.

## 0 · Run the script first

Run `node scripts/skills/sync-skills.mjs`. It audits the .agents/.claude skill mirrors you are about to emit, so the two copies stay in step. You still ask the questions, confirm the blueprint and scaffold the repo. Add `--no-llm` for the fully offline path (deterministic text, no Ollama). If the script errors or is unavailable, fall back to the manual steps below, which stay in place.

## Context you must respect
- **Do not scaffold anything until the user has answered the questions and confirmed the blueprint (Stage 4).** This is a one-human-in-the-loop bootstrap, not an autonomous build.
- The **target** is a *new* repo, not midnite-studio. Never write into the midnite-studio tree except to *read* [`templates/midnite/`](../../../templates/midnite/), the tree you copy out. Resolve the target dir in Stage 0.
- Keep the question count to **~10** — terse, mostly **AskUserQuestion** (it batches up to 4 per call, always offers **"Other"**, and supports `multiSelect` for checkbox-style picks). Always invite the user to extend/replace any option.
- **Tailor everything to the answers.** Don't ask theming/i18n/look-and-feel questions if there's no frontend app; don't ask the API-language question if there's no API. Don't scaffold a mobile phase issue if there's no mobile app.
- The skills you copy track phases as GitHub issues (a `phase` issue + one sub-issue per theme; see this repo's `docs/TRACKER.md`) and an `AGENTS.md` of conventions (with a `CLAUDE.md` that imports it) — `templates/midnite/` already carries the skeleton of both, so Stage 5 is filling those in, not inventing the shape from scratch.

---

## 🎯 Stage 0 — Resolve the target & seed the brief
1. Determine the **target directory** from `$ARGUMENTS` (a path or a project name → kebab-slug dir). If none, **ask** ("Where should I scaffold this — current empty dir, or a new `./<slug>/`?"). If the dir is non-empty, stop and confirm before writing into it.
2. Capture a **freeform brief**: *what the project is about*, its **name**, a one-line pitch, and the target users. `$ARGUMENTS` may seed this; otherwise ask conversationally (this is the one open-ended "question" — the AskUserQuestion rounds below are the structured ~10).

## 🧱 Stage 1 — Repo shape & stack (questions 1–3)
Ask via **AskUserQuestion** (batch these):
1. **Repo shape** — `Single repo` vs `Monorepo (moon + proto)`. Recommend monorepo if more than one app is implied.
2. **Which apps?** (`multiSelect`, only if monorepo — else infer the one app) — `Website` (marketing) · `Webapp` (product UI) · `Mobile app` · `API / gateway` · `Docs site` · `CLI` · `Desktop app`. Map each to a default stack:
   - Website + Webapp + Docs → **Next.js (App Router)** (docs may instead be a Vite + MDX site if the user prefers — offer it)
   - Mobile → **React Native (Expo)**
   - Desktop → **Tauri** or **Electron** (offer the choice)
   - CLI → **commander (TypeScript)**
3. **API language** (only if API/gateway chosen) — `Nest.js (TypeScript)` *(recommended — matches the TS-everywhere default)* · `Python (FastAPI)` · `.NET` · `Go`.

## 🎨 Stage 2 — Product context (questions 4–10)
The **majority** of the interview. Ask via **AskUserQuestion**, batched, and **skip any that don't apply** to the chosen apps. Aim to land the total around 10 questions.
4. **Product type** — `SaaS` · `Marketing/landing` · `Internal tool` · `Mobile-first app` · `API product` · `Content/docs`.
5. **Pricing & tiers** (frontend/SaaS) — `Free + Pro + Enterprise` · `Freemium` · `One-time purchase` · `None / not yet`. If tiered, note a pricing page is in scope.
6. **Legal documents** (`multiSelect`) — `Privacy policy` · `Terms of service` · `Cookie policy` · `Acceptable use` · `None`.
7. **Social links** (`multiSelect`, checkbox-style icons) — `GitHub` · `X / Twitter` · `LinkedIn` · `Discord` · `Instagram` · `YouTube` · `Mastodon` · `None`.
8. **Translations / i18n** (frontend) — `English only` · `Multi-locale` (ask which locales via "Other" or a follow-up).
9. **Theming** (`multiSelect`, frontend) — `Light` · `Dark` · `System-based` · `Time-based (auto day/night)` · `Color presets` · `Custom colors`.
10. **Look & feel** — `Minimalist` · `Animated / lively` · `Playful` · `Corporate / clean` · `Brutalist` · `Glassmorphic`.

Keep the **"suggest your own / add to this"** door open on every round. If the brief makes an answer obvious, state your assumption and fold it in rather than spending a question on it.

## ✅ Stage 3 — (optional) Ground the stack
If any stack choice needs a sanity check (current framework conventions, a library's setup), do a quick check — grep/read inline, or dispatch a focused read-only subagent (e.g. `Explore`). Don't over-research; this is a seed.

## 📋 Stage 4 — Confirm the blueprint — STOP for the human
Play back a tight summary and get a clear go-ahead before writing anything:
- **Project**: name + one-line pitch.
- **Repo**: single vs monorepo; the app list with each app's stack.
- **Context**: product type, pricing, legal docs, socials, i18n, theming, look & feel.
- **What I'll scaffold** (the file list from Stage 5).
- **Subagents** I'll generate.
- **Phase issues** (one per app) + how they connect.

If the user wants changes, loop back. Only proceed once they confirm.

## 🏗️ Stage 5 — Scaffold the repo
Create sub-tasks with TodoWrite, then write everything. Tailor every file to the answers.

**a. Repo skeleton**
- `git init` the target if it isn't a repo. Add a sensible `.gitignore` (node + the chosen stacks).
- **Monorepo**: scaffold moon + proto like midnite — `.prototools` (pin node + pnpm), `.moon/{workspace,toolchain,tasks}.yml`, root `package.json` (pnpm workspace), `packages/<app>/` per chosen app with a minimal `moon.yml` declaring `dependsOn` for the cross-app edges (e.g. webapp/website depend on `shared`; nothing imports another app's internals). Include a `packages/shared/` for cross-app contracts (zod schemas/types) when there's an API + a client.
- **Single repo**: a flat layout for the one app's stack.

**b. README.md** — at the repo root. Cover: what the project is, the stack, the repo layout, common commands (moon/pnpm if monorepo), and a **"Working with Claude Code"** section that **documents the `midnite-plan` and `midnite-build` skills** (what each does, when to use it, the GitHub-issue flow they drive) and the generated subagents.

**c. The onboarding kit** — copy [`templates/midnite/`](../../../templates/midnite/) **verbatim** into `<target>/`, exactly as it is in this repo: this is the one step that keeps this skill and the app's own Setup menu leaf from describing two different shapes of "an onboarded repo." That single copy gives the target:
- `<target>/.midnite/` — `settings.json` and `_features.md`. Drop the template's `tasks/` skeleton and add `.midnite/tasks/` to the target's `.gitignore`: plans live on the forge.
- `<target>/.claude/skills/`, `<target>/.agents/skills/` — two identical mirrors of the same eight repo-agnostic skills (`midnite-plan`, `midnite-build`, `midnite-build-adhoc`, `midnite-refine`, `midnite-address-issue`, `midnite-triage`, `midnite-git-report`, `midnite-git-cleanup`), copied as-is — **keep the `midnite-` prefix on every one of them**, matching the template exactly; do not rename or strip it.
- `<target>/AGENTS.md` — a stub with `<!-- TODO -->` placeholders for the toolchain, package boundaries, and house conventions. Fill each placeholder in for *this* stack — project overview, the chosen apps' one-way dependency graph, code style, testing layers, the "shared is the contract" rule if there's a shared package. `<target>/CLAUDE.md` stays the short `@AGENTS.md` import it ships as, holding Claude-only notes and nothing else. Don't discard the stub and write from scratch; the one-convention-file and worktree-policy sections it already carries are the point of starting from it.
- **Generate `<target>/.claude/agents/<name>.md`** subagents — each with frontmatter (`name`, `description`, `tools`) and a focused system prompt:
  - **Generic, always**: `architect` (designs to the conventions, guards boundaries), `tester` (writes/extends tests at the right layer), `security` (reviews for the common classes of vuln in this stack).
  - **Stack-based**, per chosen app: e.g. `frontend` (Next.js/React + the chosen theming + i18n), `mobile` (Expo), `api` (Nest.js/FastAPI/.NET/Go), `docs-writer` (MDX), `cli-engineer` (commander). Only generate the ones the app list calls for.

**d. Phase issues** — file the MVP phases on the target repo's forge:
- Create the labels (`phase`, `theme`, `features`, `security`, `issues`, `deferred`) and a project board; each phase's narrative goes in its issue's `## Headlines` section.
- **One phase issue per app**: `Phase 1 — <AppA> MVP`, `Phase 2 — <AppB> MVP`, …, each theme a sub-issue, in the **house style** the `midnite-plan` skill describes: `# Phase N — <App> MVP`, framing blockquotes (what it builds on + scope guardrails + an S/M/L legend), a `## Headlines` section right after them (one lead paragraph + one `**Theme X — <name>.** ◻ <one-liner>` paragraph per theme), a `## Headlines` section right after them (one lead paragraph + one `**Theme X — <name>.** ◻ <one-liner>` paragraph per theme), **Themes** with `- [ ]` checklist items + S/M/L tags, a **Files this phase touches** map, a **Verification** checklist, and a **Decisions / open questions** section. Fold the Stage 2 context into the right app (pricing/legal/socials/i18n/theming/look-and-feel land in the website/webapp docs; API contracts in the API doc).
- **Connect the docs for an MVP**: explicitly cross-link where apps depend on each other — e.g. the **website** links to the **webapp** (sign-up/app CTA) and the **docs**; the **webapp** consumes the **API** via the `shared` contract; **mobile** shares the same `shared` API client; **docs** documents both. Note these as dependencies in each doc's blockquote and its `## Headlines` lead.
- Nothing to log yet: closed sub-issues are the landed log, `deferred` issues the deferred scope.

## 🎁 Stage 6 — Wrap up
1. **Commit the scaffold** in the new repo (`git add` explicit paths, not `-A`; a `chore: scaffold <project>` commit). Don't push (no remote yet) unless the user set one up — just report it.
2. Print a tight recap: the target path, the tree (key files), the app→phase-doc map with the connections, and the subagents created.
3. Tell the user the next move: **`cd` into the repo, run `pnpm install` (if monorepo), then `/midnite-build`** to pick up the first MVP slice — or `/midnite-plan` to add a new phase.

---

Be genuinely collaborative through Stages 0–4 — the interview is the point; the scaffold is mechanical. Don't write a single file until the user has confirmed the blueprint (Stage 4), and tailor every generated file to their answers — never emit midnite-studio-specific content (its own package names, its own conventions) that doesn't apply to their project. `templates/midnite/`'s own stubs and placeholders are what keep that boundary honest — fill them in, don't paper over them with copied specifics.
