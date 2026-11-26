# midnite-design

This repo's design system (Tailwind tokens, react-icons/lu, `@bilo-io/ui`, `packages/frame`, the
`app:visual` lane) is not the target repo's; the rules point at its own instead.

<<<<
  - Standard colors from Tailwind (`text-blue-500`, `bg-zinc-900`, `border-white/10`).
  - Icons **must** come from `react-icons` (specifically Lucide via `react-icons/lu`, e.g. `LuPlay`, `LuGitBranch`). Never use raw `lucide-react`.
  - Shared UI components come from `@bilo-io/ui` and `packages/frame`.
====
  - Colors and spacing from the project's own tokens or theme (see `AGENTS.md`).
  - Icons from the project's one icon family; never mix in a second.
  - Shared UI components from the project's own component library, before anything hand-rolled.
>>>>

<<<<
  - Locator-cropped Playwright visual screenshots (`toHaveScreenshot`).
====
  - Visual screenshots of each state (Playwright's `toHaveScreenshot` or the project's own tool).
>>>>

<<<<
3. Check existing UI components in `packages/app/` or `packages/features/` that overlap.
====
3. Check existing UI components in the codebase that overlap.
>>>>

<<<<
   - Concrete styling checklist (`- [ ] Styled with Tailwind dark theme tokens...`).
====
   - Concrete styling checklist (`- [ ] Styled with the theme's dark-mode tokens...`).
>>>>

<<<<
   - Icon assignments (`- [ ] Integrated react-icons/lu icons...`).
====
   - Icon assignments (`- [ ] Icons from the project's icon family...`).
>>>>

<<<<
   - `- [ ] Playwright visual baselines (`app:visual`) updated; verification shots attached to the PR, never committed`.
====
   - `- [ ] Visual baselines updated where the project keeps them; verification shots attached to the PR, never committed`.
>>>>

<<<<
   - Design tokens: exact Tailwind classes, font sizes, colors.
   - Icon selections from `react-icons/lu`.
====
   - Design tokens: the exact token or class names, font sizes, colors.
   - Icon selections from the project's icon family.
>>>>
