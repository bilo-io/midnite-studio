---
name: midnite-design
description: Extend a planned phase issue on GitHub with visual design, UI/UX architecture, layout, design tokens, component hierarchy, and design verification criteria.
argument-hint: "[phase number, e.g. '125', or phase slug, e.g. 'phase-125-animations-library']"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite, Agent
---

You are running the **design** workflow for **this repo**: an interactive session that extends a planned phase issue with comprehensive UI/UX, visual styling, responsive states, design tokens, and frontend component architecture.

While `/midnite-plan` focuses on functional requirements, deliverables, and backend/IPC boundaries, **`/midnite-design` extends the planned doc** to ensure the visual and interaction design is fully specified before build begins.

## 0 · Run the script first

Run `node scripts/skills/verify-phase.mjs --phase N --json`. It reads the phase doc checklist and runs the tracker check (read-only). You still make the design decisions with the user and extend the doc. Add `--no-llm` for the fully offline path (deterministic text, no Ollama). If the script errors or is unavailable, fall back to the manual steps below, which stay in place.

## Design Context & Rules

- **Design Tokens & System:**
  - Colors and spacing from the project's own tokens or theme (see `AGENTS.md`).
  - Icons from the project's one icon family; never mix in a second.
  - Shared UI components from the project's own component library, before anything hand-rolled.
- **UI States to Specify:**
  - Default / Idle state.
  - Hover, focus, and active interactive states.
  - Empty state (when no items exist).
  - Loading / pending state (spinners, skeletons, progress bars).
  - Error state with user-facing recovery actions.
  - Narrow / resized / docked window adaptations.
- **Verification Criteria:**
  - Visual screenshots of each state (Playwright's `toHaveScreenshot` or the project's own tool).
  - Dark/light mode contrast and focus rings.

---

## 🎨 Stage 1 — Locate and read the planned phase

1. Identify the target phase issue: `node scripts/skills/tracker.mjs index --state open`, then `node scripts/skills/tracker.mjs view <n>` (the issue, its theme sub-issues and Headlines).
2. Read the issue's Headlines, Deliverables, and existing Themes.
3. Check existing UI components in the codebase that overlap.

## 📐 Stage 2 — Design System & Component Breakdown

1. Propose concrete UI/UX architecture:
   - Component hierarchy (parent containers, child cards, action buttons, modals).
   - Layout geometry: flex/grid, padding, margins, overflow scrolling.
   - Design tokens: the exact token or class names, font sizes, colors.
   - Icon selections from the project's icon family.
2. Review interactive states (keyboard navigation, shortcuts, hover tooltips).
3. Confirm with user via AskUserQuestion.

## ✍️ Stage 3 — Extend the phase issue

Edit the phase issue body (and the affected theme sub-issues) in the session scratchpad, then push with `gh issue edit <n> --body-file …`:
1. Append or integrate a **`## Visual & UI/UX Design`** section with component wireframes and ASCII layout diagrams.
2. Extend the **`## Deliverables`** checklist with design items:
   - Concrete styling checklist (`- [ ] Styled with the theme's dark-mode tokens...`).
   - Component state handling (`- [ ] Empty and error state banners with retry...`).
   - Icon assignments (`- [ ] Icons from the project's icon family...`).
3. Extend the **`## Verification`** checklist:
   - `- [ ] Visual baselines updated where the project keeps them; verification shots attached to the PR, never committed`.
   - `- [ ] Contrast and keyboard focus order verified`.
4. Nothing is committed: `.midnite/tasks/` is git-ignored scratch.

## ✅ Stage 4 — Commit & Report

Nothing to commit: the design lives in the phase issue.
Report the extended sections and suggest running `/midnite-build` to implement the phase.
