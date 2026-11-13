---
name: midnite-design
description: Extend a planned .midnite/tasks/ phase doc with visual design, UI/UX architecture, layout, design tokens, component hierarchy, and design verification criteria.
argument-hint: "[phase number, e.g. '125', or phase slug, e.g. 'phase-125-animations-library']"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite, Agent
---

You are running the **design** workflow for **Midnite Studio**: an interactive session that extends a planned phase doc with comprehensive UI/UX, visual styling, responsive states, design tokens, and frontend component architecture.

While `/midnite-plan` focuses on functional requirements, deliverables, and backend/IPC boundaries, **`/midnite-design` extends the planned doc** to ensure the visual and interaction design is fully specified before build begins.

## Design Context & Rules

- **Design Tokens & System:**
  - Standard colors from Tailwind (`text-blue-500`, `bg-zinc-900`, `border-white/10`).
  - Icons **must** come from `react-icons` (specifically Lucide via `react-icons/lu`, e.g. `LuPlay`, `LuGitBranch`). Never use raw `lucide-react`.
  - Shared UI components come from `@bilo-io/ui` and `packages/frame`.
- **UI States to Specify:**
  - Default / Idle state.
  - Hover, focus, and active interactive states.
  - Empty state (when no items exist).
  - Loading / pending state (spinners, skeletons, progress bars).
  - Error state with user-facing recovery actions.
  - Narrow / resized / docked window adaptations.
- **Verification Criteria:**
  - Locator-cropped Playwright visual screenshots (`toHaveScreenshot`).
  - Dark/light mode contrast and focus rings.

---

## 🎨 Stage 1 — Locate and read the planned doc

1. Identify target phase doc:
   - Check `.midnite/tasks/FEATURES/phases/phase-<N>-*.md`, `.midnite/tasks/SECURITY/phases/`, or `.midnite/tasks/ISSUES/phases/`.
2. Read the doc's Headlines, Deliverables, and existing Themes.
3. Check existing UI components in `packages/app/` or `packages/features/` that overlap.

## 📐 Stage 2 — Design System & Component Breakdown

1. Propose concrete UI/UX architecture:
   - Component hierarchy (parent containers, child cards, action buttons, modals).
   - Layout geometry: flex/grid, padding, margins, overflow scrolling.
   - Design tokens: exact Tailwind classes, font sizes, colors.
   - Icon selections from `react-icons/lu`.
2. Review interactive states (keyboard navigation, shortcuts, hover tooltips).
3. Confirm with user via AskUserQuestion.

## ✍️ Stage 3 — Extend the Phase Doc in Place

Edit `.midnite/tasks/<CATEGORY>/phases/phase-N-<slug>.md` in place:
1. Append or integrate a **`## Visual & UI/UX Design`** section with component wireframes and ASCII layout diagrams.
2. Extend the **`## Deliverables`** checklist with design items:
   - Concrete styling checklist (`- [ ] Styled with Tailwind dark theme tokens...`).
   - Component state handling (`- [ ] Empty and error state banners with retry...`).
   - Icon assignments (`- [ ] Integrated react-icons/lu icons...`).
3. Extend the **`## Verification`** checklist:
   - `- [ ] Playwright visual screenshots committed under docs/screenshots/`.
   - `- [ ] Contrast and keyboard focus order verified`.
4. Reconcile checklist counts and update `.midnite/tasks/<CATEGORY>/_INDEX.md` (counts: done/total).
5. Run drift guard: `moon run root:tracker-check`.

## ✅ Stage 4 — Commit & Report

Commit doc changes to git:
```bash
git add .midnite/tasks/<CATEGORY>/phases/phase-N-<slug>.md .midnite/tasks/<CATEGORY>/_INDEX.md
git commit -m "docs: extend phase-N <slug> with visual design specs"
```
Report the extended sections and suggest running `/midnite-build` to implement the phase.
