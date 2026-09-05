# Phase 64 — Offline Monaco Editor & Cross-Surface Theme Engine

A modern, offline-bundled Monaco editor for the Files view with a unified cross-surface theme
engine that simultaneously synchronizes color palettes across the Studio app chrome, integrated
xterm terminals, and Monaco syntax tokens.

Monaco Editor (`@monaco-editor/react` backed by local `monaco-editor` ESM assets) replaces the
CodeMirror 6 editable component in [`packages/app/src/features/files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx).
To preserve the performance budget established in Phase 36, Monaco is lazy-loaded on demand and
configured with a curated set of local Web Workers (`editor.worker`, `ts.worker`, `json.worker`,
`css.worker`, `html.worker`), running 100% offline with zero CDN dependencies and compliant with
Electron's strict Content Security Policy. Instant file tree browsing is preserved by keeping
read-only file previews on the lightweight Shiki engine ([`code-preview.tsx`](../../../packages/app/src/features/files/preview/code-preview.tsx)),
mounting Monaco only when the user clicks **Edit**.

Surrounding the editor is an extensible Cross-Surface Theme Engine that unifies theme definitions
for the Studio UI (CSS variables / Tailwind tokens), xterm terminal instances (16 ANSI colors +
chrome), and Monaco syntax tokens (`monaco.editor.defineTheme`). Out of the box, it ships with
six curated presets (**GitHub Dark**, **GitHub Light**, **JetBrains Darcula**, **Atom One Dark**,
**VS Code Dark+**, and **Monokai**), alongside a client-side theme importer that ingests standard
VS Code theme JSON files.

**Builds on.**
- [`features/files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) —
  the current CodeMirror 6 file editor, wired to `useFileEditorStore` for content, dirty state, and saving.
- [`features/files/preview/file-preview.tsx`](../../../packages/app/src/features/files/preview/file-preview.tsx) —
  the right-hand Files pane holding the lazy-loading boundary (`React.lazy`) and the Edit toggle.
- [`features/terminal/terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx) —
  the xterm.js host component that consumes `theme: DARK_THEME | LIGHT_THEME` dynamically.
- [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) —
  persisted UI preferences and theme state (`themeMode: 'system' | 'dark' | 'light'`).
- [`phases/phase-62-one-escape-one-dismissal.md`](phase-62-one-escape-one-dismissal.md) —
  the centralized LIFO Escape stack hook (`use-dismiss.ts`) that Monaco's inner widgets must yield to.

**Scope guardrails.**
- **Offline first & zero CDN calls.** `@monaco-editor/react` default CDN dynamic imports are
  strictly disabled via `loader.config({ monaco })`. No network requests are made for editor assets or workers.
- **Curated worker diet.** Only five core workers are bundled (`editor.worker`, `ts.worker`,
  `json.worker`, `css.worker`, `html.worker`). Non-web languages (Rust, Go, Python, C++, Markdown, YAML)
  use Monaco's built-in Monarch syntax tokenizers rather than multi-megabyte language server workers.
- **Read-only preview stays on Shiki.** Clicking files in the file explorer stays fast and light;
  Monaco is only instantiated when entering writable edit mode.
- **Diff views stay on existing components.** Commit diffs and working tree diffs continue using
  the specialized diff viewer (`diff-view.tsx`); replacing diffs with Monaco `DiffEditor` is deferred.
- **Strict Studio chord yielding.** Monaco must not steal global studio shortcuts (`Mod+k`,
  `Ctrl+\``, `Mod+r`, `Mod+1..9`) from the Studio keybinding dispatcher.

---

## Themes

### Theme A — Vite Offline Monaco & Worker Pipeline (M)
*Bundles `@monaco-editor/react` with local `monaco-editor` assets, configures Vite worker bundling for offline execution, and ensures strict Electron CSP compliance.*

- [ ] Add `@monaco-editor/react` and `monaco-editor` dependencies to [`packages/app/package.json`](../../../packages/app/package.json).
- [ ] Configure Vite worker bundling in [`packages/app/vite.config.ts`](../../../packages/app/vite.config.ts) for `monaco-editor/esm/vs/editor/editor.worker`, `language/typescript/ts.worker`, `language/json/json.worker`, `language/css/css.worker`, and `language/html/html.worker`.
- [ ] Create [`packages/app/src/lib/monaco/monaco-loader.ts`](../../../packages/app/src/lib/monaco/monaco-loader.ts) to initialize `loader.config({ monaco })` with `window.MonacoEnvironment` configured to return local worker instances.
- [ ] Add Content Security Policy verification ensuring no remote CDN scripts (`cdn.jsdelivr.net`) are loaded when Monaco initializes.
- [ ] Ensure Monaco is fully code-split via dynamic import (`React.lazy`) so initial app startup, entry chunk size, and passive memory remain unimpacted.

### Theme B — Unified Cross-Surface Theme Registry (M)
*Builds an extensible theme token engine that coordinates colors across the app chrome, xterm terminal, and Monaco editor.*

- [ ] Define the `StudioTheme` type contract in [`packages/app/src/features/themes/theme-types.ts`](../../../packages/app/src/features/themes/theme-types.ts) containing tokens for:
  - App Chrome (Tailwind/CSS variables: background, surface, border, text, muted, accent).
  - Terminal (`xterm.ITheme`: background, foreground, cursor, selection, and 16 ANSI colors).
  - Editor (Monaco `defineTheme` rules and editor UI colors).
- [ ] Create built-in preset definitions in [`packages/app/src/features/themes/presets/`](../../../packages/app/src/features/themes/presets/):
  - `github-dark.ts` and `github-light.ts`
  - `jetbrains-darcula.ts`
  - `atom-one-dark.ts`
  - `vscode-dark-plus.ts`
  - `monokai.ts`
- [ ] Create [`packages/app/src/features/themes/theme-store.ts`](../../../packages/app/src/features/themes/theme-store.ts) with `activeThemeId`, `appThemeOverride`, `terminalThemeOverride`, and `editorThemeOverride` persisted in `ui-store.ts`.
- [ ] Create [`packages/app/src/features/themes/use-theme-sync.ts`](../../../packages/app/src/features/themes/use-theme-sync.ts) to apply active theme tokens to `:root` CSS variables and broadcast theme changes to mounted xterm terminals and Monaco instances.

### Theme C — Writable Monaco Editor in Files View (M)
*Replaces the CodeMirror 6 writable editor with Monaco Editor in the Files preview pane.*

- [ ] Reimplement [`packages/app/src/features/files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) using `@monaco-editor/react`.
- [ ] Bind Monaco model changes to `useFileEditorStore` for dirty tracking, remote file change detection, discard, and saving.
- [ ] Implement debounced `editor.layout()` bound to a `ResizeObserver` on the editor host container to ensure smooth resizing without lag.
- [ ] Connect editor options to user preferences (font size, font family, minimap visibility, tab size, line wrapping).
- [ ] Retain Shiki in [`features/files/preview/code-preview.tsx`](../../../packages/app/src/features/files/preview/code-preview.tsx) for instant read-only file tree browsing.

### Theme D — Keybinding Yielding & Escape Stack Integration (S)
*Prevents Monaco from capturing global application shortcuts and cleanly integrates with the Phase 62 LIFO Escape stack.*

- [ ] Add an `onKeyDown` interceptor in `code-editor.tsx` to yield Studio global chords (`Mod+k`, `Ctrl+\``, `Mod+r`, `Mod+1..9`) to the Studio keybinding dispatcher.
- [ ] Wire Monaco into [`components/use-dismiss.ts`](../../../packages/app/src/components/use-dismiss.ts) (Phase 62 Escape stack):
  - When Monaco inner widgets (Find widget, Suggest/Autocomplete list, Parameter hints) are active, Monaco handles Escape internally.
  - When no inner widget is open, Escape yields to Studio's topmost overlay dismissal.

### Theme E — VS Code Theme JSON Importer (S)
*Allows users to import standard VS Code theme JSON files and parse them into cross-surface themes.*

- [ ] Create [`packages/app/src/features/themes/importers/vscode-theme-importer.ts`](../../../packages/app/src/features/themes/importers/vscode-theme-importer.ts) to parse VS Code theme JSON.
- [ ] Map VS Code syntax tokens (`tokenColors`) to Monaco rules (`monaco.editor.ITokenThemeRule`).
- [ ] Extract UI colors (`colors.editorBackground`, `colors.sideBarBackground`, etc.) to Studio CSS variables and terminal ANSI definitions.
- [ ] Store user-imported themes in persistent storage (`userCustomThemes` in `ui-store.ts`).

### Theme F — Appearance Settings & Command Palette Controls (S)
*Adds visual theme pickers to Settings and registers quick-switch palette commands.*

- [ ] Create `Settings ▸ Appearance ▸ Themes` panel in [`packages/app/src/features/settings/settings-pages/themes-page.tsx`](../../../packages/app/src/features/settings/settings-pages/themes-page.tsx) displaying preset cards with live previews.
- [ ] Add options for individual surface overrides (allowing custom terminal or editor themes different from the app chrome).
- [ ] Add "Import VS Code Theme (.json)" file picker button with validation and error toast notifications.
- [ ] Register Command Palette commands in [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts):
  - `theme.select` (opens theme picker palette)
  - `theme.import` (prompts file open dialog for theme JSON)

---

## Files this phase touches

- [`packages/app/package.json`](../../../packages/app/package.json) — add `@monaco-editor/react` and `monaco-editor`.
- [`packages/app/vite.config.ts`](../../../packages/app/vite.config.ts) — configure Monaco worker bundling.
- [`packages/app/src/lib/monaco/monaco-loader.ts`](../../../packages/app/src/lib/monaco/monaco-loader.ts) — offline local worker loader.
- [`packages/app/src/features/files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) — Monaco editor implementation.
- [`packages/app/src/features/files/preview/file-preview.tsx`](../../../packages/app/src/features/files/preview/file-preview.tsx) — lazy import boundary for Monaco.
- [`packages/app/src/features/themes/theme-types.ts`](../../../packages/app/src/features/themes/theme-types.ts) — theme contract.
- [`packages/app/src/features/themes/presets/`](../../../packages/app/src/features/themes/presets/) — 6 built-in theme presets.
- [`packages/app/src/features/themes/theme-store.ts`](../../../packages/app/src/features/themes/theme-store.ts) — theme persistence & state.
- [`packages/app/src/features/themes/use-theme-sync.ts`](../../../packages/app/src/features/themes/use-theme-sync.ts) — multi-surface color applicator.
- [`packages/app/src/features/themes/importers/vscode-theme-importer.ts`](../../../packages/app/src/features/themes/importers/vscode-theme-importer.ts) — JSON theme importer.
- [`packages/app/src/features/settings/settings-pages/themes-page.tsx`](../../../packages/app/src/features/settings/settings-pages/themes-page.tsx) — settings appearance page.
- [`packages/app/src/features/terminal/terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx) — sync dynamic theme tokens to xterm.
- [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — register theme selection chords & palette actions.

---

## Verification

- [ ] **Offline Operation**: Launch app with network disconnected (`ping 1.1.1.1` blocked or Wi-Fi off); open file, click Edit; Monaco loads and edits without console network errors or timeouts.
- [ ] **Worker Verification**: Confirm `ts.worker` and `editor.worker` spawn as local Web Workers in DevTools Sources without CSP violations.
- [ ] **Instant File Preview**: Verify single-clicking files in File Explorer opens Shiki preview instantly (<50ms) without loading Monaco chunks until "Edit" is clicked.
- [ ] **Cross-Surface Theme Switch**: Select "JetBrains Darcula"; verify in one frame that Studio sidebar/cards, xterm terminal background/ANSI colors, and Monaco editor tokens change in unison.
- [ ] **Theme Override**: In Settings, set Master Theme to GitHub Dark, but set Terminal Override to Monokai; verify terminal displays Monokai while app and editor display GitHub Dark.
- [ ] **VS Code Theme Import**: Import a third-party VS Code theme `.json` (e.g. SynthWave '84); verify syntax tokens, app background, and terminal ANSI colors parse and persist.
- [ ] **Keybinding Yielding**: Inside active Monaco text cursor, press `Mod+k` (verifying Command Palette opens), `Ctrl+\`` (verifying terminal toggles), and `Mod+r` (verifying reload behaves normally).
- [ ] **Escape Stack**: In Monaco with Find widget open (`Cmd+F`), press Escape; verify only Find widget closes while Studio panels remain open. Press Escape again; verify topmost Studio panel dismisses.
- [ ] **Performance Gate**: Run `moon run app:perf` and verify entry chunk size remains within budget and cold boot time is unaffected.

---

## Decisions / open questions

1. **Why keep Shiki for read-only preview instead of using `readOnly: true` Monaco?**
   *Recommendation (Adopted):* Mounting Monaco consumes ~30MB of RAM and spawns background worker threads. Most file explorer interactions are quick glances rather than editing sessions. Keeping Shiki for read-only viewing keeps file navigation instantaneous and zero-overhead, reserving Monaco for intentional editing.
2. **Why curate the worker set rather than bundling all language workers?**
   *Recommendation (Adopted):* Bundling every language server worker would add >20MB to the app bundle. TypeScript/JavaScript, JSON, CSS, and HTML represent the vast majority of in-app quick edits. All other languages (Rust, Go, Python, Markdown, Shell) are tokenized with Monaco's Monarch engine with full syntax highlighting and negligible footprint.
3. **Master theme switcher vs. independent surface selectors?**
   *Recommendation (Adopted):* Default to a single unified master switch for seamless aesthetic harmony across app chrome, terminal, and editor, while providing advanced override selectors in Settings for power users who prefer specific terminal or editor color schemes.
