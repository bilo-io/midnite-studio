# Phase 64 — Offline Monaco Editor & Cross-Surface Theme Engine

**Refined: x1** · 2026-09-05 · visual design & theming, functionality & edge cases, persistence & migration, performance & scale, testing & verification, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening, accessibility & keyboard

A modern, offline-bundled Monaco editor for the Files view, and a theme layer that reaches the
surfaces the app actually paints code on.

**The x1 refinement corrected four of this phase's premises.** Each was checkable in one grep, and
each changes what gets built:

1. **`themeMode` does not exist.** The original plan said it built on
   `store/ui-store.ts`'s `themeMode: 'system' | 'dark' | 'light'`. `grep -rn "themeMode" packages` →
   **0**. Light/dark is owned by a **third-party package** — `@bilo-io/ui`'s `ThemeProvider`,
   persisted at `localStorage['midnite.theme']`, with **four** modes, not three:
   `light | dark | system | time` (`@bilo-io/ui/dist/theme.d.ts:4`; `time` is light 08:00–18:00, dark
   otherwise). The provider exposes no change event, so the app observes the `dark` class with a
   `MutationObserver` in three separate places — [`app.tsx:1594-1603`](../../../packages/app/src/app.tsx),
   [`broadcast-sync.ts:245-259`](../../../packages/app/src/services/broadcast-sync.ts) and
   [`terminal-view.tsx:743-751`](../../../packages/app/src/features/terminal/terminal-view.tsx).
   A theme engine here is not a greenfield store; it is an extension of somebody else's provider.
2. **There is no Content Security Policy.** `Content-Security-Policy`, `onHeadersReceived` and
   `webSecurity` each return **0 hits** across the repo, and
   [`index.html:18-40`](../../../packages/app/index.html) already ships an inline `<script>` (the
   no-flash theme init), so a strict CSP would break boot today. "CSP compliance" was a phantom
   constraint. **The real constraint is the `file://` opaque origin** —
   [`window.ts:116`](../../../packages/desktop/src/main/window.ts) is `win.loadFile(rendererEntry())`
   — and it is what breaks Monaco's workers. See Decision 4.
3. **Theme D was backwards.** It proposed stopping Monaco from stealing Studio chords. But
   [`use-keybindings.ts:90`](../../../packages/app/src/services/keybindings/use-keybindings.ts)
   registers its listener in **capture** phase on `window` and calls `stopPropagation()` at `:82`,
   while Monaco binds in bubble phase on its own textarea. The app already wins every bound chord
   unconditionally; **Monaco will never see one**. The work is the opposite of what was written:
   teaching the dispatcher to *yield*. See Decision 6.
4. **An Appearance settings page already exists** — [`ui-store.ts:182`](../../../packages/app/src/store/ui-store.ts)
   registers it and [`appearance-page.tsx`](../../../packages/app/src/features/settings/settings-pages/appearance-page.tsx)
   is 292 lines whose **first accordion is titled "Theme"**. A new `themes-page.tsx` would sit
   directly beside it. See Decision 9.

It also found **a cross-phase conflict the doc did not mention** and **a surface the theme engine
was going to miss**:

- **[Phase 61](phase-61-database-explorer.md) explicitly rejects Monaco**, in writing: its query
  editor *"reuses this setup plus one new dependency, `@codemirror/lang-sql`, **rather than adopting
  Monaco or a second editor stack**"* (`phase-61` Theme G), and it builds on
  [`code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) — the exact
  file this phase replaces. Whichever lands second is rewritten. See Decision 2.
- **The theme engine named three surfaces and the app has five.** Shiki is hard-wired to exactly two
  themes by a function with a literal return type —
  [`highlighter.ts:28-29`](../../../packages/app/src/lib/highlighter.ts),
  `HIGHLIGHT_THEME = (dark) => dark ? 'github-dark' : 'github-light'` — and it paints the read-only
  file preview *this phase deliberately keeps*, plus [`diff-view.tsx:141`](../../../packages/app/src/features/diff/diff-view.tsx)
  and [`slide-code.tsx:44`](../../../packages/app/src/features/slides/slide-code.tsx). Selecting
  "Monokai" would leave all three on a GitHub theme. See Decision 8.

**Builds on.**
- [`features/files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) —
  **152 lines**, the CodeMirror 6 editor. `export function CodeEditor({ fileName }: { fileName: string })`
  — one prop; content comes from the store. Two `Compartment`s (`language`, `themeCompartment`) at
  `:45-68`, a hand-picked extension list (no `basicSetup`), async language resolution via
  `LanguageDescription.matchFilename` at `:72-80`, and `editorTheme(dark)` at `:124-152` built from
  `hsl(var(--background))`-style tokens. **It is the only file in the repo importing `@codemirror/*`.**
- [`store/file-editor-store.ts`](../../../packages/app/src/store/file-editor-store.ts) — **165 lines**,
  plain zustand, no persist. State: `target | savedContent | content | version | saving | saveError |
  staleWrite | pendingNav | allowClose`. Ten actions: `openFile`, `closeFile`, `edit`, `save`,
  `reloadFromDisk`, `dismissStaleWrite`, `guardNavigation`, `resolvePendingSave`,
  `resolvePendingDiscard`, `resolvePendingCancel`. **Dirty is derived, never stored** —
  `content !== savedContent`, computed at four call sites. Saves through
  `fs.writeFile` with `expectedVersion`; a mismatch returns `code: 'stale-write'`
  ([`fs-write-handlers.ts:67-69`](../../../packages/desktop/src/main/ipc/fs-write-handlers.ts)).
  There is **no watcher-driven reload of an open buffer**, deliberately
  ([`file-preview.tsx:105-106`](../../../packages/app/src/features/files/preview/file-preview.tsx)).
- [`features/files/preview/file-preview.tsx`](../../../packages/app/src/features/files/preview/file-preview.tsx) —
  **362 lines**. `const [editing, setEditing] = useState(false)` at `:59`; `canEdit` at `:100`;
  **a `React.lazy` boundary around `CodeEditor` already exists** at `:25`, with a bespoke
  `"Loading editor…"` fallback at `:305` rather than [`DelayedFallback`](../../../packages/app/src/components/delayed-fallback.tsx).
- [`e2e/perf/bundle-budget.spec.ts:97-102`](../../../packages/app/e2e/perf/bundle-budget.spec.ts) —
  `MUST_BE_ABSENT`, the repo's established way to pin a heavy dependency off the boot path
  (`@xterm/xterm`, `react-grid-layout`, `react-markdown`, `remark-gfm` today). Budget source is
  [`scripts/perf/budgets.json`](../../../scripts/perf/budgets.json): `entryKb: 1520` against a
  measured `1335.8` — **~184 KB of headroom**, and Monaco's core is ~2 MB.
- [`lib/highlighter.ts`](../../../packages/app/src/lib/highlighter.ts) — the lazy-singleton pattern
  Monaco must copy: `createHighlighter({ themes: [...], langs: [] })` with **zero** eager grammars,
  each pulled on first use so Vite code-splits it. Its WASM is **inlined into a JS chunk**
  (`dist/assets/wasm-*.js`, 622 KB; `ls dist/assets/*.wasm` → no matches) — which is precisely why
  Shiki survives `file://` today, and the precedent Decision 4 rests on.
- [`services/keybindings/use-keybindings.ts:111-112`](../../../packages/app/src/services/keybindings/use-keybindings.ts) —
  `insideTerminal = (target) => target instanceof Element && target.closest('.xterm') !== null`.
  Module-private, one call site, one hard-coded selector, paired with a flat six-entry
  `TERMINAL_YIELD_COMMANDS` ([`keybindings.ts:327-334`](../../../packages/shared/src/keybindings.ts)).
- [`features/landing/landing-carousel.tsx:80-85`](../../../packages/app/src/features/landing/landing-carousel.tsx) —
  the one place in the repo that already treats "input-like roots" as a *list*
  (`'.xterm, [role="tree"], [role="grid"], [role="listbox"], [role="separator"], [data-session-list]'`).
  Theme D generalises toward this shape rather than inventing one.

**Scope guardrails.**
- **Offline, and the constraint is `file://` — not CSP.** No network request for editor assets or
  workers, verified by the absence assertion in Theme A rather than by a CSP that does not exist.
- **Curated worker diet.** Five workers only (`editor`, `ts`, `json`, `css`, `html`). Everything else
  uses Monarch tokenizers.
- **Read-only preview stays on Shiki.** Monaco mounts only on Edit.
- **Diff views stay on [`diff-view.tsx`](../../../packages/app/src/features/diff/diff-view.tsx).**
  Monaco's `DiffEditor` is not adopted.
- **`packages/app` only, plus two lines of `packages/shared` and one of `packages/desktop`.** The
  shared change is the two `COMMANDS` entries; the desktop change is three `menu.ts` accelerators
  (Theme D). No new IPC channel, no `git-engine` change.
- **The existing appearance system is extended, never forked.** `appearance-store.ts`
  (`accent`/`motion`/`density`/`uiFont`/`background`/`effects`) and
  [`@bilo-io/shell`'s `appearance.css`](../../../packages/app/src/styles.css) `html[data-accent]`
  override engine already exist and already have a settings page. See Decision 9.
- **`@bilo-io/ui`'s `ThemeProvider` is not replaced.** Light/dark, all four modes, stays its job.
  This phase adds a *palette* dimension orthogonal to it. See Decision 7.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

---

## Themes

### Theme A — Vite Offline Monaco & Worker Pipeline (L)
*Bundles `@monaco-editor/react` with local `monaco-editor` assets and gets five Web Workers running from a `file://` origin — the actual hard problem.*

- [ ] Add `@monaco-editor/react` and `monaco-editor` to [`packages/app/package.json`](../../../packages/app/package.json).
  - Pin exact versions; `monaco-editor` ships breaking changes in minors.
  - Note in the PR body that this is a **second editor engine alongside CodeMirror 6** until Theme G
    lands, and that the seven `@codemirror/*` entries leave in Theme G, not here.
- [ ] Add `packages/app/src/lib/monaco/monaco-loader.ts` — **new.** One named export:
      `export function getMonaco(): Promise<typeof import('monaco-editor')>`.
  - A memoised module-level promise, in the exact shape of
    [`highlighter.ts:21-26`](../../../packages/app/src/lib/highlighter.ts)'s `highlighterPromise`.
    **Zero eager languages**, same as Shiki's `langs: []`.
  - It calls `loader.config({ monaco })` with the statically-imported local `monaco` so
    `@monaco-editor/react` never reaches its default `cdn.jsdelivr.net` path.
- [ ] **Workers are built with `?worker&inline`, not `?worker`.** This is the item the phase turns on.
  - Vite's plain `?worker` emits a separate chunk loaded via `new Worker(new URL(…))`, which under
    [`window.ts:116`](../../../packages/desktop/src/main/window.ts)'s `loadFile` resolves to a
    `file:` URL from an **opaque origin** and is blocked by Chromium. `?worker&inline` emits a
    blob/data URL, which is not.
  - Precedent, and the reason this is known to work here: Shiki's WASM is already inlined into a JS
    chunk for the same reason (`dist/assets/wasm-*.js`, 622 KB; there are **no** `.wasm` files in
    `dist/`).
  - There is **no `new Worker` anywhere in `packages/app/src` today** (grep → 0) and no `worker` key
    in [`vite.config.ts`](../../../packages/app/vite.config.ts) — this is the codebase's first
    worker, so it gets a comment explaining the `&inline` choice rather than leaving the next author
    to rediscover it.
- [ ] Set `window.MonacoEnvironment.getWorker(_workerId, label)` in `monaco-loader.ts`, returning a
      new instance of the inlined worker constructor per `label`:
      `'typescript' | 'javascript' → ts`, `'json' → json`, `'css' | 'scss' | 'less' → css`,
      `'html' | 'handlebars' | 'razor' → html`, **default → `editor`**. The default arm is required:
      an unmatched label with no fallback throws inside Monaco with no useful message.
- [ ] **Delete the CSP verification item.** There is no CSP (`grep -rn "Content-Security-Policy"` →
      0), and `index.html:18-40` ships an inline script that a strict one would break. Replaced by
      the `file://`-origin assertion in Verification.
- [ ] Add `monaco-editor` to `MUST_BE_ABSENT` in
      [`e2e/perf/bundle-budget.spec.ts:97-102`](../../../packages/app/e2e/perf/bundle-budget.spec.ts):
      `{ name: 'monaco-editor', needles: ['monaco-editor', 'MonacoEnvironment'] }`.
      This is the repo's existing mechanism for exactly this risk and it is a two-line change.
- [ ] Keep Monaco off the entry chunk via the existing `React.lazy` boundary at
      [`file-preview.tsx:25`](../../../packages/app/src/features/files/preview/file-preview.tsx) —
      **no `manualChunks`**, which does not exist anywhere in this repo (splitting is 100%
      dynamic-import driven; see the comment at [`vite.config.ts:11`](../../../packages/app/vite.config.ts)).
- [ ] Swap that boundary's bespoke `"Loading editor…"` paragraph (`file-preview.tsx:305`) for
      [`<DelayedFallback />`](../../../packages/app/src/components/delayed-fallback.tsx), the
      120 ms-delayed spinner described as *"the fallback every lazy boundary in the app uses"*.
      Monaco's chunk is large enough that an undelayed spinner would flash on a warm load.
- [ ] **No asar work is needed, and the doc should say so** so nobody adds an `asarUnpack` entry:
      [`electron-builder.yml:28-42`](../../../packages/desktop/electron-builder.yml) copies
      `packages/app/dist` as `extraResources` → `Resources/renderer`, **outside the asar entirely**.

### Theme B — Unified Cross-Surface Theme Registry (L)
*A palette dimension orthogonal to `@bilo-io/ui`'s light/dark provider, reaching all five surfaces the app paints code on — not the three the original plan counted.*

- [ ] Define `StudioPalette` in `packages/app/src/features/themes/theme-types.ts` — **new.**
      Named `Palette`, not `Theme`, because `@bilo-io/ui` already owns the word and the mechanism
      (Decision 7). Exact shape:
  - `id: string`, `label: string`, `appearance: 'dark' | 'light'` — which of `@bilo-io/ui`'s two
    resolved modes this palette is designed against.
  - `chrome: Partial<Record<StudioToken, string>>` where `StudioToken` is the union of the **22
    tokens** in `@bilo-io/ui/dist/tokens.css` (`--background --foreground --card --card-foreground
    --primary --primary-foreground --secondary --secondary-foreground --muted --muted-foreground
    --accent --accent-foreground --destructive --destructive-foreground --success
    --success-foreground --popover --popover-foreground --border --input --ring --radius`).
    Values are **HSL triplets without the `hsl()` wrapper** (`"240 6% 10%"`), because
    [`tailwind.config.ts:39-77`](../../../packages/app/tailwind.config.ts) wraps every colour as
    `hsl(var(--token))` and a wrapped value would produce `hsl(hsl(...))`.
  - `terminal: ITheme` — the full xterm shape **including all 16 ANSI keys**. Note this is net-new:
    [`terminal-view.tsx:68-80`](../../../packages/app/src/features/terminal/terminal-view.tsx)'s
    `DARK_THEME`/`LIGHT_THEME` have **four keys each and no ANSI palette at all** (`grep ansi` in
    `features/terminal/` → 0); xterm's built-in defaults supply them today.
  - `editor: { base: 'vs' | 'vs-dark' | 'hc-black'; rules: ITokenThemeRule[]; colors: Record<string, string> }`
    — the `monaco.editor.defineTheme` payload.
  - `highlight: BundledTheme` — **the fifth surface.** The Shiki theme id this palette maps to. See
    Decision 8.
- [ ] Six presets under `packages/app/src/features/themes/presets/` — `github-dark.ts`,
      `github-light.ts`, `jetbrains-darcula.ts`, `atom-one-dark.ts`, `vscode-dark-plus.ts`,
      `monokai.ts` — each a `const satisfies StudioPalette`, plus an `index.ts` exporting
      `BUILTIN_PALETTES: readonly StudioPalette[]` and `DEFAULT_PALETTE_ID = 'github-dark'`.
  - `github-dark` and `github-light` must be **byte-identical in effect to today's appearance** —
    they are the migration target for existing users and the regression baseline.
- [ ] `packages/app/src/features/themes/palette-store.ts` — **new**, its own zustand store beside
      [`appearance-store.ts`](../../../packages/app/src/store/appearance-store.ts) rather than a
      slice of `ui-store`. State: `activePaletteId`, `terminalPaletteOverride: string | null`,
      `editorPaletteOverride: string | null`, `userPalettes: StudioPalette[]`.
  - **Persisted in `appearance-store.ts`'s file, not `ui-store`'s.** `appearance-store` is
    `name: 'midnite.settings'`, `version: 1`, and holds exactly this class of state; `ui-store` is
    `name: 'midnite-studio.ui'` at `version: 8` with ~60 keys. See Decision 10 for the migration.
  - `appearance-store.ts` has **no `partialize` and no `migrate`** (grep → 0 for both) — adding
    `userPalettes` means adding both, and bumping to `version: 2` with a `version < 2` arm that
    seeds `activePaletteId: DEFAULT_PALETTE_ID` and `userPalettes: []`.
- [ ] `packages/app/src/features/themes/use-palette-sync.ts` — **new.**
      `export function usePaletteSync(): void`, called **once** from
      [`app.tsx`](../../../packages/app/src/app.tsx) beside the existing appearance sync.
  - Writes `chrome` tokens onto `document.documentElement.style` via `setProperty('--background', …)`.
    Inline style beats the `:root` rule from `@bilo-io/ui/dist/tokens.css` **and** the
    `html[data-accent]` rules from `@bilo-io/shell/appearance.css` on specificity, which is what
    makes this an extension rather than a fork.
  - **Clears a token it does not set** (`removeProperty`) so switching from a palette that overrides
    `--ring` to one that doesn't restores the library value instead of stranding the old one.
- [ ] **Reuse the existing xterm re-theme path; do not add a second one.**
      [`terminal-view.tsx:743-751`](../../../packages/app/src/features/terminal/terminal-view.tsx)
      already re-themes in place on the `dark`-class `MutationObserver`, with the comment *"a rebuild
      would wipe the scrollback and kill the shell."* Extend that effect to also depend on the active
      palette; do not introduce a broadcast.
  - **Terminal count is unbounded** — one `LazyTerminalView` per session
    ([`terminal-panel.tsx:200-207`](../../../packages/app/src/features/terminal/terminal-panel.tsx)),
    plus one per board card ([`card-terminal.tsx:53`](../../../packages/app/src/features/projects/board/card-terminal.tsx))
    and one per loop tab ([`loop-tab.tsx:17`](../../../packages/app/src/features/loops/loop-tab.tsx)),
    all mounted simultaneously (inactive panes are `invisible`, never unmounted). Each already
    registers its own observer, so a palette change must be O(mounted terminals) assignments and
    nothing heavier.
- [ ] Palette change reaches **popout windows**. [`broadcast-sync.ts:245-259`](../../../packages/app/src/services/broadcast-sync.ts)
      already relays `{ dark }` to popouts and applies it at `:97-101`; extend that message with
      `paletteId` rather than adding a channel.
- [ ] `theme-types.test.ts` asserting every preset satisfies the contract, every `chrome` value
      parses as an HSL triplet (`/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/`), and every preset
      defines all 16 ANSI keys.

### Theme C — Writable Monaco Editor in Files View (M)
*Replaces the CodeMirror 6 writable editor with Monaco, against the store's real API.*

- [ ] Reimplement [`code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx)
      on `@monaco-editor/react`, **keeping the existing signature exactly**:
      `export function CodeEditor({ fileName }: { fileName: string })`. Content comes from the store,
      not props — preserving this is what keeps `file-preview.tsx`'s call site unchanged.
  - Keep `data-testid="code-editor"` (`:118-119`); it is the stable hook for both suites.
- [ ] Wire to [`file-editor-store.ts`](../../../packages/app/src/store/file-editor-store.ts) by its
      actual API, item by item:
  - `onChange` → `useFileEditorStore.getState().edit(value)`. **Nothing else** — `edit` is literally
    `set({ content })` at `:90`, and dirty is derived downstream.
  - The store→view sync at `code-editor.tsx:102-113` (`useFileEditorStore.subscribe`, skipped when
    the doc already matches) is **preserved as-is** against `model.setValue`. It is what makes
    `reloadFromDisk()` and `resolvePendingDiscard()` land in the editor, and both are reachable from
    the stale-write banner and the guard dialog.
  - Do **not** add a watcher. `file-preview.tsx:105-106` records the deliberate decision that a
    background refetch must not clobber a buffer being typed into.
- [ ] **Fix the latent remount bug while here.** `code-editor.tsx:86-87` claims the caller
      `key`-forces a remount, but `file-preview.tsx:304-308` renders `<CodeEditor>` **without a
      `key`**, though `editorKey` is computed at `:101-102`. Pass `key={editorKey}` or delete the
      claim — currently the comment and the call site disagree, and Monaco is far less forgiving of a
      stale model than CodeMirror was.
- [ ] Debounced `editor.layout()` on a `ResizeObserver` over the host element, trailing-edge at
      **60 ms**, disconnected on unmount. Monaco does not self-size; without this the editor keeps
      its mount-time dimensions inside the resizable Files pane.
- [ ] **Create the editor preferences — they do not exist.** `grep -rn "editorFontSize|editorFontFamily|minimap|tabSize|wordWrap" packages/app/src packages/shared/src` → **0**.
      Add `editorFontFamily`, `editorFontSize`, `editorMinimap`, `editorTabSize`, `editorWordWrap` to
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) mirroring the terminal trio
      exactly — declaration (`:1008-1012`), implementation (`:1234-1239`), the `PersistedUi` union
      (`:1187-1189`) and `partialize` (`:1691-1692`) — and bump `version: 8` → `9` with a `< 9` arm
      seeding the defaults. Four edits plus the bump, none of which exist today.
  - Defaults live outside the store, mirroring
    [`terminal-font.ts:19`](../../../packages/app/src/features/terminal/terminal-font.ts): 13 px,
    the app's `font-mono` stack, minimap off, tab size 2, word wrap off.
- [ ] Map the file extension to a **Monaco** language id.
      [`languages.ts`](../../../packages/app/src/lib/languages.ts)'s `languageForFile` returns
      **Shiki** ids, and they differ: `shellscript`→`shell`, `docker`→`dockerfile`, `jsonc`→`json`.
      Add `monacoLanguageForFile(fileName): string | undefined` in `lib/monaco/monaco-languages.ts`
      as an explicit translation table over the ~57 extensions in `LANG_BY_EXT`, falling back to
      `'plaintext'`. Do not reuse the Shiki id directly.
- [ ] Retain Shiki in [`code-preview.tsx`](../../../packages/app/src/features/files/preview/code-preview.tsx)
      unchanged, and preserve its `Escape`-closes-find guard at `:97` (`event.key === 'Escape' && findOpen`)
      — it is the existing find-bar-in-editor precedent Theme D must not break.
- [ ] Restore focus on unmount. Nothing in the app does this except
      [`palette.tsx:126-137`](../../../packages/app/src/components/palette.tsx); lift that exact
      pattern (capture `document.activeElement` in a ref, restore in the effect's cleanup). Monaco
      takes focus on mount, so without it, leaving edit mode drops focus to `<body>`.
- [ ] Add `code-editor.test.tsx` — **there is no unit test for this file today**; the directory's only
      test is `markdown-links.test.ts`. Mock `getMonaco()`; assert `edit()` fires on change, that a
      store push updates the model, and that the `ResizeObserver` is disconnected on unmount.

### Theme D — Chord yielding, both directions (M)
*Renamed and inverted: the dispatcher wins every chord today, so the work is teaching it to yield — plus the three native accelerators that bypass it entirely.*

- [ ] **Generalise `insideTerminal` into a root registry.** Replace
      [`use-keybindings.ts:111-112`](../../../packages/app/src/services/keybindings/use-keybindings.ts)'s
      single hard-coded `.xterm` selector and the flat `TERMINAL_YIELD_COMMANDS` with:
      `YIELD_ROOTS: readonly { selector: string; commands: readonly CommandId[] }[]` in
      [`keybindings.ts`](../../../packages/shared/src/keybindings.ts), and rewrite the check at
      `:55-57` to find the first root the event target sits inside.
  - Two entries: `.xterm` keeping today's exact six (`app.reload`, `app.hardReload`, `panel.back`,
    `panel.forward`, `fab.toggle`, `window.detachActive`), and `.monaco-editor` with **its own,
    different** set.
  - **Not** `|| target.closest('.monaco-editor')` bolted onto `insideTerminal` — that would make
    Monaco swallow `fab.toggle` and `window.detachActive`, which it should not, while still not
    letting it keep the chords it needs.
  - Keep `TERMINAL_YIELD_COMMANDS` as a derived alias; it is exported and named in
    [`menu.ts:73`](../../../packages/desktop/src/main/menu.ts)'s doc comment.
  - Match off `event.target`, not `document.activeElement` — preserving the existing rationale at
    `:52-54` that a keystroke aimed at one widget is judged by that widget.
- [ ] Monaco's yield set, named explicitly: `Mod+d` (add selection to next match), `Mod+/` (toggle
      comment), `Mod+[` / `Mod+]` (outdent/indent), `Mod+Enter` (insert line below).
      **`Mod+f` needs no entry** — nothing binds it (`DEFAULT_KEYMAP` has no `Mod+f`; `search.open` is
      `Mod+Shift+f`) and no menu item registers it, so Monaco's find widget already works.
- [ ] **Three native accelerators bypass the yield list entirely and must move to
      `itemNoAccelerator()`** in [`menu.ts`](../../../packages/desktop/src/main/menu.ts). An OS
      accelerator fires whenever the window is focused, which the renderer's listener never sees —
      the exact bug class the file's own comment at `:56-77` already describes:
  - `Cmd+G` → `repos.toggle` (`menu.ts:117`). `Cmd+G` is **find-next** in Monaco and in every macOS
    text surface; this is the worst of the three.
  - `Cmd+L` → `fab.toggle` (`menu.ts:120`). Monaco binds it to expand-line-selection, and
    `fab.toggle` is *already* in the terminal yield list — proof the carve-out is bypassed.
  - `Cmd+O` → `repo.open` (`menu.ts:92`). Opens a native folder picker mid-keystroke.
- [ ] **Escape: prefer Monaco's own handling, then fall through.** Monaco consumes Escape internally
      when its find widget, suggest list or parameter hints are open, via
      `editor.createContextKey`-backed conditions. Register the editor with
      [Phase 62](phase-62-one-escape-one-dismissal.md)'s `useDismiss` at `layer: 'inline'` and query
      Monaco's context keys before dismissing, so the first Escape closes the widget and the second
      reaches Studio.
  - **`use-dismiss.ts` does not exist yet** (`grep -rn "use-dismiss|useDismiss"` → 0); Phase 62 is
    0%. See Decision 3 for what this phase does if it lands first.
- [ ] **Do not apply [`useFocusTrap`](../../../packages/app/src/components/use-focus-trap.ts) to the
      editor.** Its `FOCUSABLE` selector would sweep Monaco's many internal `[tabindex]` nodes into
      the Tab cycle, and Tab inside an editor must insert indentation, not move focus.
- [ ] Extend `use-keybindings.test.ts` — it already dispatches at an element inside an `.xterm` root
      (`:88`), so the harness extends directly. Assert: a Monaco-yielded chord inside
      `.monaco-editor` does **not** run; the same chord inside `.xterm` **does**; `fab.toggle` inside
      `.monaco-editor` **does** run.

### Theme E — VS Code Theme JSON Importer (M)
*Parses a VS Code theme JSON into a `StudioPalette` — client-side, no network.*

- [ ] `packages/app/src/features/themes/importers/vscode-theme-importer.ts` — **new.**
      `export function importVsCodeTheme(json: unknown): { ok: true; palette: StudioPalette } | { ok: false; reason: string }`.
      A result envelope, not a throw, mirroring the app's `GitOpResult` convention so the settings
      page renders a reason rather than catching.
- [ ] Validate with **zod**, already a dependency via `@midnite/studio-shared`. Required:
      `$schema`-agnostic, `type: 'dark' | 'light'` (default `'dark'` when absent — many themes omit
      it), `colors: Record<string, string>`, `tokenColors: {scope, settings}[]`. Reject anything
      over **2 MB** with `reason: 'File too large'`.
- [ ] Map `tokenColors` → `ITokenThemeRule[]`. `scope` may be a **string or an array of strings** —
      the array form must be flattened into one rule per scope, which is the single most common
      reason a naive importer renders a theme grey.
- [ ] Map `colors.*` → `chrome` tokens, converting **hex → HSL triplet** (`#1e1e1e` → `"0 0% 12%"`)
      because Tailwind wraps every token as `hsl(var(--token))`. Handle 8-digit hex (`#rrggbbaa`) by
      dropping alpha. At minimum: `editor.background` → `--background`,
      `editor.foreground` → `--foreground`, `sideBar.background` → `--card`,
      `focusBorder` → `--ring`, `panel.border` → `--border`.
- [ ] Map `colors['terminal.ansi*']` → the 16 ANSI keys, falling back to the palette's `appearance`
      default for any the theme omits — most do omit several.
- [ ] Set `highlight` to the nearest bundled Shiki theme by `type` (`'dark'` → `github-dark`), since
      an imported VS Code theme has no Shiki equivalent. Recorded as a known limitation rather than
      guessed at (Decision 8).
- [ ] `vscode-theme-importer.test.ts` with three real fixtures committed under
      `packages/app/src/features/themes/importers/__fixtures__/`: one with array-form scopes, one
      with no `type`, one with 8-digit hex. Plus: malformed JSON, a 3 MB file, and an empty object
      each return `{ok: false}` with a distinct reason.

### Theme F — Appearance Settings & Command Palette Controls (M)
*Extends the Appearance page that already exists, and registers two commands through all four places a command actually needs.*

- [ ] **Add a "Palette" accordion to the existing
      [`appearance-page.tsx`](../../../packages/app/src/features/settings/settings-pages/appearance-page.tsx)** —
      **not** a new `themes-page.tsx`. That page is 292 lines, registered at
      [`ui-store.ts:182`](../../../packages/app/src/store/ui-store.ts), and its first accordion is
      already titled "Theme". A second Appearance-adjacent page is a navigation problem, not a
      feature. See Decision 9.
  - Place it directly beneath the existing "Theme" accordion (`appearance-page.tsx:32-100`), above
    "Background".
- [ ] Preset cards showing each palette's `chrome.background`, `chrome.foreground`, `chrome.primary`
      and four ANSI swatches, using the `Choice` primitive re-exported from
      [`settings-pages/controls.tsx:6`](../../../packages/app/src/features/settings/settings-pages/controls.tsx).
- [ ] Two override selectors — Terminal and Editor — each defaulting to *"Match app"* and writing
      `terminalPaletteOverride` / `editorPaletteOverride`.
- [ ] **Also surface light/dark here.** The Appearance page has *no* light/dark control today
      (`useTheme` is not imported into it); the four-mode `ThemePreference` is reachable only from
      the title-bar [`ThemeToggle`](../../../packages/app/src/components/theme-toggle.tsx). A page
      called Appearance that cannot set light/dark is a gap this phase is already standing in.
- [ ] "Import VS Code Theme (.json)" button, styled like
      [`cli-page.tsx:87-105`](../../../packages/app/src/features/settings/settings-pages/cli-page.tsx)'s
      (raw `<button type="button">`, `disabled` while working, inline error beneath), reading the
      file via a hidden `<input type="file" accept=".json">` — **client-side `FileReader`, no IPC
      channel**.
- [ ] Register `theme.select` and `theme.import` in **all four** places a command needs. Neither id
      collides (`grep -rn "'theme\."` → 0):
  1. [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — the `COMMANDS`
     entries. Use `group: 'view'`; **do not** add a `theme` value to `CommandGroup` (`:23-33`) for
     two commands.
  2. `packages/app/src/features/palette/safety.ts` — add both to `PALETTE_SAFE`. **This is the one
     that fails silently**: the list is an opt-in allowlist, so a command absent from it simply never
     appears in the palette, with no error.
  3. `packages/app/src/features/palette/command-icons.ts` — `COMMAND_ICONS` entries from
     `react-icons/lu` (`LuPalette`, `LuUpload`).
  4. [`services/keybindings/use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts) —
     a `CommandEntry` each. `CommandRuntime` is a **total** `Record<CommandId, CommandEntry>`, so
     typecheck fails until this is done — the one of the four the compiler catches.
- [ ] **Neither command gets a chord.** Every single-letter `Mod` chord worth having is taken, and
      a chord-free command's label must come from `COMMANDS`, not `DEFAULT_KEYMAP` (which drops them).

### Theme G — Decommissioning CodeMirror, and the suite that names it (S) — **new in x1**
*The original plan replaced the editor but never removed what it replaced, and never mentioned the e2e suite asserting on CodeMirror's DOM.*

- [ ] **Migrate [`e2e/files-editor.spec.ts`](../../../packages/app/e2e/files-editor.spec.ts) — it
      breaks otherwise.** 131 lines asserting on CodeMirror-specific DOM: `.cm-gutters` at `:47`,
      `.cm-content` at `:48`, `:62`, `:77`, `:100`, `:124`. Monaco renders neither. Retarget onto
      `[data-testid="code-editor"]` and Monaco's `.view-lines`, and update the doc comment at `:7`.
      This is the phase's highest-risk unlisted item: the suite is green today and would go red on
      the first commit of Theme C.
- [ ] Remove the seven `@codemirror/*` dependencies from
      [`packages/app/package.json:18-24`](../../../packages/app/package.json) —
      `autocomplete`, `commands`, `language`, `language-data`, `search`, `state`, `view`.
      Verified safe: `code-editor.tsx` is the **only** importer in the repo.
- [ ] Update the stale comment at
      [`file-preview.tsx:22-24`](../../../packages/app/src/features/files/preview/file-preview.tsx),
      which explains the lazy boundary in terms of CodeMirror's weight.
- [ ] **Gate this theme on [Phase 61](phase-61-database-explorer.md).** P61 Theme G adds
      `@codemirror/lang-sql` and builds its SQL editor on `code-editor.tsx`'s CodeMirror setup. If
      P61 has landed or is in flight, **this theme does not run** — the dependencies stay and the
      phase ships Monaco alongside CodeMirror. See Decision 2.
- [ ] Re-measure and record: `node scripts/perf/bundle-report.mjs` after
      `moon run app:build desktop:bundle`, and update `_measured` in
      [`scripts/perf/budgets.json`](../../../scripts/perf/budgets.json) — **never the budget
      numbers**, which that file says in its own `_` key must not change without the run that
      justifies them.

---

## Files this phase touches

| File | What |
|---|---|
| [`packages/app/package.json`](../../../packages/app/package.json) | **+** `@monaco-editor/react`, `monaco-editor` (A) · **−** 7 × `@codemirror/*` (G) |
| [`packages/app/vite.config.ts`](../../../packages/app/vite.config.ts) | first `worker` config in the repo; `?worker&inline` and the comment saying why (A) |
| `packages/app/src/lib/monaco/monaco-loader.ts` | **new** — `getMonaco()` lazy singleton, `MonacoEnvironment.getWorker` with a default arm |
| `packages/app/src/lib/monaco/monaco-languages.ts` | **new** — `monacoLanguageForFile`, the Shiki-id → Monaco-id translation |
| [`packages/app/e2e/perf/bundle-budget.spec.ts`](../../../packages/app/e2e/perf/bundle-budget.spec.ts) | `monaco-editor` added to `MUST_BE_ABSENT` (A) |
| `packages/app/src/features/themes/theme-types.ts` · `presets/` (7 files) · `palette-store.ts` · `use-palette-sync.ts` | **new** — the palette contract, six presets + index, store, applicator (B) |
| `packages/app/src/features/themes/importers/vscode-theme-importer.ts` + `__fixtures__/` | **new** — importer and three real fixtures (E) |
| [`packages/app/src/features/files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) | rewritten on Monaco, same signature and `data-testid` (C) |
| `packages/app/src/features/files/preview/code-editor.test.tsx` | **new** — no unit test exists today (C) |
| [`packages/app/src/features/files/preview/file-preview.tsx`](../../../packages/app/src/features/files/preview/file-preview.tsx) | `DelayedFallback`, the missing `key={editorKey}`, the stale comment (A, C, G) |
| [`packages/app/src/features/files/preview/code-preview.tsx`](../../../packages/app/src/features/files/preview/code-preview.tsx) | (**unchanged**) — Shiki stays; its `:97` Escape guard is load-bearing for Theme D |
| [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | five `editor*` prefs across four sites + `version` 8 → 9 (C) |
| [`packages/app/src/store/appearance-store.ts`](../../../packages/app/src/store/appearance-store.ts) | gains `partialize` + `migrate` (it has neither today) and `version` 1 → 2 (B) |
| [`packages/app/src/features/terminal/terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx) | `DARK_THEME`/`LIGHT_THEME` gain 16 ANSI keys; the `:743-751` observer also keys on palette (B) |
| [`packages/app/src/services/broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts) | `paletteId` added to the existing `{dark}` popout relay (B) |
| [`packages/app/src/lib/highlighter.ts`](../../../packages/app/src/lib/highlighter.ts) | `HIGHLIGHT_THEME`'s literal return union widened; themes registered from the palette (B) |
| [`packages/app/src/services/keybindings/use-keybindings.ts`](../../../packages/app/src/services/keybindings/use-keybindings.ts) | `insideTerminal` → `YIELD_ROOTS` lookup, ~10 lines (D) |
| [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) | `YIELD_ROOTS`; `TERMINAL_YIELD_COMMANDS` kept as an alias; 2 × `COMMANDS` (D, F) |
| [`packages/desktop/src/main/menu.ts`](../../../packages/desktop/src/main/menu.ts) | `Cmd+G`, `Cmd+L`, `Cmd+O` → `itemNoAccelerator()` (D) |
| [`packages/app/src/features/settings/settings-pages/appearance-page.tsx`](../../../packages/app/src/features/settings/settings-pages/appearance-page.tsx) | a "Palette" accordion + a light/dark control (F) |
| `packages/app/src/features/palette/safety.ts` · `command-icons.ts` · [`use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts) | the three non-obvious command registrations (F) |
| [`packages/app/e2e/files-editor.spec.ts`](../../../packages/app/e2e/files-editor.spec.ts) | 6 CodeMirror selectors retargeted onto Monaco (G) |
| [`scripts/perf/budgets.json`](../../../scripts/perf/budgets.json) | `_measured` re-recorded; **budget numbers untouched** (G) |
| [`packages/app/index.html`](../../../packages/app/index.html) | (**unchanged**) — the inline no-flash script stays; it is why no CSP can be added casually |
| [`packages/desktop/electron-builder.yml`](../../../packages/desktop/electron-builder.yml) | (**unchanged**) — the renderer is an `extraResource`, so Monaco's workers are already outside the asar |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green, and `pnpm e2e` green with **no new `KNOWN_RED` entry**
      — including `files-editor.spec.ts`, retargeted rather than ratcheted (G).
- [ ] **Offline, packaged, from `file://`.** `moon run app:build desktop:bundle`, launch the packaged
      app with Wi-Fi off, open a file, click Edit. Monaco loads and edits. **This is the assertion
      that matters**: dev-mode over `http://localhost:5173` proves nothing about the origin the bug
      would appear in.
- [ ] `grep -r "cdn.jsdelivr" packages/app/dist` → **no matches** after a build.
- [ ] DevTools → Sources shows five workers running from blob URLs, none from `file://`, and the
      Network tab shows **zero** requests for editor assets.
- [ ] `monaco-editor` does not resolve into the entry chunk — the `MUST_BE_ABSENT` test added in
      Theme A, run via `moon run app:perf`.
- [ ] `node scripts/perf/bundle-report.mjs --assert` passes: `entryKb` stays under **1520**, from a
      measured baseline of 1335.8 (~184 KB headroom, against a ~2 MB dependency).
- [ ] Single-clicking files in the tree renders the Shiki preview with **no Monaco chunk requested** —
      assert on the absence of a `monaco` chunk in the Network panel, not on a stopwatch.
- [ ] **All four theme modes.** `light`, `dark`, `system` and **`time`** each resolve correctly with a
      palette selected — `time` is the one the original plan did not know existed.
- [ ] **Five surfaces move together.** Select "JetBrains Darcula" and assert, in one frame: app chrome
      tokens, xterm background **and its 16 ANSI colours**, Monaco tokens, the Shiki read-only
      preview, and a rendered diff row. The last two are the surfaces x1 added.
- [ ] Override isolation: master GitHub Dark + terminal override Monokai → terminal is Monokai, chrome
      and editor are GitHub Dark, and the read-only preview follows **chrome**, not the terminal.
- [ ] A palette that omits `--ring` restores `@bilo-io/ui`'s value rather than stranding the previous
      palette's — the `removeProperty` behaviour in Theme B.
- [ ] With **eight** terminals mounted (sessions + a board card + a loop tab), a palette switch
      re-themes all of them without recreating any: scrollback survives and no shell dies.
- [ ] A palette change reaches an open **popout window**.
- [ ] Import a real third-party VS Code theme with **array-form `scope`s** (SynthWave '84) and one
      with **no `type` field**; both parse, persist across a reload, and render non-grey tokens.
- [ ] A 3 MB JSON, a malformed JSON and `{}` each return `{ok:false}` with three distinct reasons and
      an inline error — no toast, no throw.
- [ ] `appearance-store` migrates 1 → 2 and `ui-store` 8 → 9 **from a real pre-upgrade profile**, not
      a fresh one: existing users keep their accent, density and terminal font.
- [ ] **Chords, inside a focused Monaco:** `Mod+k` opens the palette · ``Ctrl+` `` toggles the terminal ·
      `Mod+r` reloads · `Mod+f` opens **Monaco's** find, not the app's · `Mod+d` and `Mod+/` reach
      Monaco · `Cmd+G` does **not** toggle the repos panel · `Cmd+L` does **not** toggle the FAB.
      The last two are the native-accelerator fix and they cannot be tested from the renderer alone.
- [ ] Escape with Monaco's find widget open closes only the widget; a second Escape reaches Studio.
- [ ] Leaving edit mode returns focus to the Edit button, not `<body>`.
- [ ] Resize the Files pane rapidly for 3 s: Monaco tracks it, and the `ResizeObserver` is
      disconnected on unmount (asserted in `code-editor.test.tsx`, not by eye).
- [ ] `grep -rn "@codemirror" packages/app/src` → **0** after Theme G (or the theme is recorded as
      skipped, with Phase 61 named as the reason).
- [ ] **Open, for a human:** edit a 5,000-line file, save it, hit a stale-write conflict from an
      outside edit, reload, and discard. The store's ten actions are all reachable through the new
      editor and none of them lost your buffer.

---

## Not in this phase

- **Monaco's `DiffEditor`.** [`diff-view.tsx`](../../../packages/app/src/features/diff/diff-view.tsx)
  is virtualised, intraline-marked and perf-budgeted (`diffScrollMedianGapMs: 22`). Replacing it is a
  phase, not an item.
- **Monaco for read-only preview.** Decision 1, unchanged: ~30 MB and worker threads for a glance.
- **Language servers beyond the five workers.** Monarch tokenizers everywhere else.
- **Adding a Content Security Policy.** Real and worth doing, but `index.html:18-40`'s inline
  no-flash script means it needs a hash or a nonce, which is its own change with its own regression
  surface. Naming it here so the next reader knows the absence was seen, not missed.
- **Replacing `@bilo-io/ui`'s `ThemeProvider`.** Decision 7.
- **A `theme` `CommandGroup`.** Two commands do not earn a palette section.
- **Theming the browser wallpaper** (`features/browser/wallpaper.ts`, its own localStorage key) or
  `graphTheme` (a *geometry* preset carrying no colours — `graph-themes.ts:41-67`). Both are called
  "theme" and neither is a palette.
- **Generalising the yield registry to a `data-*` attribute.** Cleaner than selector strings, and it
  would need the terminal component to opt in too. Decision 11.

---

## Decisions / open questions

1. **Resolved (unchanged from x0) — Shiki stays for read-only preview.** Monaco costs ~30 MB and
   worker threads; most explorer interactions are glances. x1 adds the corollary the original missed:
   *because* Shiki stays, it is a themed surface and must be in the palette contract (Decision 8).

2. **Resolved — [Phase 61](phase-61-database-explorer.md) wins on the dependency, and Theme G is
   gated on it.** P61 states in writing that it uses CodeMirror *"rather than adopting Monaco or a
   second editor stack"* and builds on `code-editor.tsx`. Two readings were possible: convert P61's
   SQL editor to Monaco, or let both stacks coexist. **Coexist.** P61 is 53 items with a `db-engine`
   package and five drivers; making its editor a Monaco dependency couples a database phase to an
   editor phase for no user-visible gain. So Theme G removes `@codemirror/*` **only if P61 has not
   landed and is not in flight**, and otherwise records itself skipped. Both docs should say this;
   this one now does.

3. **Resolved — Theme D does not block on [Phase 62](phase-62-one-escape-one-dismissal.md).**
   `use-dismiss.ts` does not exist (grep → 0) and P62 is 0%. If P64 lands first, the editor keeps a
   local `onKeyDown` Escape handler shaped exactly like
   [`code-preview.tsx:97`](../../../packages/app/src/features/files/preview/code-preview.tsx)'s
   existing `event.key === 'Escape' && findOpen` guard, and becomes one more migration in P62's
   Theme B list. If P62 lands first, Theme D calls `useDismiss` directly. Whichever is second wires
   them; neither blocks.

4. **Resolved — `?worker&inline`, because the origin is `file://`.** The original said "CSP
   compliance"; there is no CSP. The real failure is that `window.ts:116`'s `loadFile` gives the
   renderer an opaque origin where a `file:`-URL worker is blocked. Three options existed: a custom
   `app://` privileged scheme (real, and the *right* long-term answer — precedent at
   [`fs-protocol.ts:31-35`](../../../packages/desktop/src/main/fs-protocol.ts) — but it changes how
   every window loads and is its own phase); `?worker` with a runtime blob shim (hand-rolling what
   Vite already does); or `?worker&inline`. **Inline**, because Shiki's WASM already ships inlined
   for exactly this reason and is proof the approach works in this app.

5. **Resolved — curate the worker set** (unchanged from x0). All language workers would add >20 MB.

6. **Resolved — the dispatcher yields to Monaco; Monaco does not yield to the dispatcher.** x0 had
   this backwards. `use-keybindings.ts:90` is a **capture**-phase `window` listener calling
   `stopPropagation()`; Monaco binds in bubble phase on its own textarea and therefore loses every
   contested chord unconditionally. A per-widget `YIELD_ROOTS` registry is the fix, and it is ~10
   lines plus a constant, with `landing-carousel.tsx:80-85` as in-repo precedent for the multi-root
   shape.

7. **Resolved — a palette dimension, orthogonal to `@bilo-io/ui`'s provider, not a replacement.**
   The provider owns four modes, a `dark` class, `color-scheme`, a `prefers-color-scheme` listener,
   a pre-paint no-flash script and a localStorage key, and three MutationObservers already depend on
   its behaviour. Replacing it means owning all of that to gain nothing a palette layer cannot do by
   writing inline custom properties, which beat both the library's `:root` rule and the shell's
   `html[data-accent]` rules on specificity. Hence `StudioPalette`, not `StudioTheme` — the name
   keeps the two ideas separable in every future conversation.

8. **Resolved — five surfaces, and Shiki is the one x0 missed.** `HIGHLIGHT_THEME`
   (`highlighter.ts:28-29`) is `(dark: boolean) => 'github-dark' | 'github-light'` — a **literal
   return type**, so widening it is a type error in one place and a compile-time list of every
   consumer in the others. Its consumers are the read-only preview this phase deliberately keeps,
   `diff-view.tsx:141` and `slide-code.tsx:44`. Shipping "Monokai" that leaves three code surfaces on
   a GitHub theme would be the most visible bug in the phase. Accepted limitation: an **imported** VS
   Code theme maps to the nearest bundled Shiki theme by `type`, because there is no general
   TextMate → Shiki conversion worth building here.

9. **Resolved — extend `appearance-page.tsx`, do not add `themes-page.tsx`.** The page exists, is
   registered at `ui-store.ts:182`, and its first accordion is titled "Theme". A second page whose
   name is a synonym of an existing one is a navigation problem. The contrast with
   [Phase 65](phase-65-somewhere-for-a-crash-to-go.md) Decision 6 is deliberate and identical in
   shape: extend the accordion that already exists. This also lets the phase fix a real gap for free
   — the Appearance page has **no light/dark control** today.

10. **Resolved — palette state persists in `appearance-store`, not `ui-store`.** `appearance-store`
    (`midnite.settings`, `version: 1`) already holds accent, motion, density, font, background and
    effects — this is that class of state. `ui-store` (`midnite-studio.ui`, `version: 8`) holds ~60
    keys of unrelated session and layout state. The cost is that `appearance-store` has **no
    `partialize` and no `migrate`** (grep → 0 for both), so Theme B adds both; that is a smaller and
    more honest change than adding a 61st key to a store at version 8. Editor *preferences*
    (`editorFontSize` and friends) still go in `ui-store` beside the terminal trio they mirror.

11. **Open — should `YIELD_ROOTS` key on a `data-*` attribute rather than a CSS selector?**
    `.xterm` and `.monaco-editor` are third-party class names that can change on a major bump.
    *Recommendation:* ship selectors in this phase and leave the attribute for later. Switching means
    the terminal component must also opt in, which drags an unrelated file into an editor phase — and
    the selector list is already the shape `landing-carousel.tsx` uses, so it is consistent with the
    codebase rather than novel.

12. **Open — is this still one phase?** x1 took it from 24 deliverables to 50, and it is really two:
    **A + C + D + G** (an editor swap, 29 items) and **B + E + F** (a palette engine touching five
    surfaces and two persisted stores, 21 items). They share only that Monaco needs a theme, which a
    single hard-coded `defineTheme` call would satisfy. *Recommendation:* **split**, taking the editor
    half as Phase 64 and moving the palette half to its own phase. The Shiki finding (Decision 8) is
    what tips it: the palette work is not "themes for the new editor", it is a change to how five
    existing surfaces are coloured, and it can land with or without Monaco. Recorded rather than
    actioned, because renumbering is the human's call — and note the phase remains executable as one
    unit if that call is "no".
