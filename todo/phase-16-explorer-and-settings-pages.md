# Phase 16 — Folder explorer, preview pane, and settings pages

Phase 14 gave the app a Settings view — one scrolling column with two sections. Phase 15 is
giving it a terminal worth configuring. This phase grows the app real pages: the nav rail
regroups (a new **Folder** view above Graph, Settings pinned to the bottom), Settings splits
into four pages behind an inner sidebar (Appearance, Graph, Terminal, **Agent** — a window
into `~/.claude` plus Claude version/update/uninstall), and the Folder view becomes a
read-only file explorer with a preview pane: shiki-highlighted code, rendered markdown,
images, PDF, and media.

**Scope guardrails.** Everything is read-only — no write, rename, delete, or create channel
exists, so "can't edit yet" is enforced by the IPC contract, not by hiding buttons. Editing
is explicitly a later phase. No search-in-files, no git-status badges on tree rows, and no
shiki in diffs yet (though adding shiki here makes that `outstanding.md` item much cheaper —
note it there when this lands).

Until now nothing in `shared/src/ipc/channels.ts` reads a raw file or lists a directory —
every fs read in main is a fixed userData file. Theme B creates that channel family, and the
path-confinement jail is the load-bearing piece: renderer-supplied paths must never escape
the repo root or `~/.claude`.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Nav rail regrouped + settings page shell (M)

- [ ] `app.tsx` — `NAV_ITEMS` gains a `files` entry (react-icons, e.g. `LuFolderTree`) **above**
      `graph`; the single `NavConfig` section splits into a main section (Folder, Graph,
      Changes) and a bottom-pinned Settings. If `@bilo-io/shell`'s `NavConfig` has no
      bottom-align affordance, a spacer section is acceptable — check the shell's props first
- [ ] `store/ui-store.ts` — `ViewId` gains `'files'`; new persisted
      `settingsPage: 'appearance' | 'graph' | 'terminal' | 'agent'` (+ setter);
      `pathForView`/`viewForPath` keep round-tripping
- [ ] `features/settings/settings-view.tsx` — becomes a shell: slim page list on the left
      (inner sidebar, VS Code-style), active page's content beside it. The existing
      "Graph style" and "Appearance" `TreeSection` contents move one-to-one into
      `settings-pages/graph-page.tsx` and `appearance-page.tsx` — a file move, not a rewrite
- [ ] `settings-pages/terminal-page.tsx` — hosts whatever terminal preferences exist at build
      time (`terminalSidebarSide`, scrollback/agent-roster display via `agent:list`). The page
      ships even if sparse; it must not block on, or be blocked by, Phase 15's open themes
- [ ] `ui-store.test.ts` — `settingsPage` persisted, `viewForPath('/files')` round-trips,
      unknown paths still fall back sanely

### B — Read-only fs IPC + path jail (M)

- [ ] `shared/src/ipc/{channels,schemas,bridge}.ts` — new `mgit:fs:*` group (all invoke):
      `fs:list-dir` → entries `{name, kind: 'file'|'dir'|'symlink', size, isIgnored}`,
      `fs:read-file` → `{kind: 'text', content, language?} | {kind: 'binary'|'too-large', size}`.
      Requests carry a scope discriminant — `{scope: 'repo', repoId, relPath}` or
      `{scope: 'claude-home', relPath}` — so the renderer never sends absolute paths
- [ ] `desktop/src/main/ipc/fs-handlers.ts` — the jail: join scope root + relPath, `realpath`
      the result, and require it to stay under the scope root (repo root or `~/.claude`).
      Rejects `..` traversal, absolute paths, and symlinks pointing out. Failures return the
      `GitOpResult`-style envelope, never a throw across the boundary
- [ ] `git-engine` — ignored-flag pass for `fs:list-dir` via one batched
      `git check-ignore --stdin -z` per listing (NUL-delimited both ways, per the house rule);
      `claude-home` scope skips it (not a repo)
- [ ] Text cap ~1.5 MB and a binary sniff (NUL byte in the first 8 KB) before `content`
      crosses IPC; images/PDF/media bytes **never** cross IPC — register a custom
      `mgit-file://` protocol in main (`protocol.handle`) enforcing the same jail, so
      `<img>`/`<video>`/PDF stream straight from disk with range support and no base64
- [ ] `fs-handlers.test.ts` — the jail table-test: `../` escape, absolute path, symlink out of
      root, and the happy path per scope; sniff and cap cases

### C — Folder explorer view (M)

- [ ] `features/files/files-view.tsx` — new `activeView === 'files'` branch in `app.tsx`;
      two panes split by the existing `use-resizable` + `ResizeHandle` (tree left, preview
      right), width persisted in `ui-store` `layout.*` like the other panes
- [ ] `features/files/file-tree.tsx` — lazy: a directory lists on first expand, never before.
      Dotfiles shown; `isIgnored` entries dimmed and **collapsed-by-default** so
      `node_modules`-scale directories cost nothing until opened
- [ ] File-type icon map (react-icons — new icons follow CLAUDE.md's react-icons rule) small
      and extension-keyed; directories get open/closed chevron affordances matching the repos
      sidebar's `TreeSection` styling
- [ ] Selection (`selectedPath`, expanded set) in a `features/files` zustand store,
      non-persisted, reset on repo switch; the tree follows the same active-repo/worktree
      selection the graph uses
- [ ] Refresh: re-list open directories on repo/worktree switch plus a manual refresh button.
      Wiring into Phase 10's watcher invalidations is a stretch item, not required

### D — Preview pane (L)

- [ ] Add `shiki` using the fine-grained core (`shiki/core` + lazily imported grammars keyed
      by extension, one dark/light theme pair synced to the app theme) — the full bundle ships
      every grammar and is exactly the "heavy dependency" `outstanding.md` warned about
- [ ] `features/files/preview/code-preview.tsx` — highlighted read-only text with line
      numbers; unknown extensions fall back to plain text
- [ ] Markdown renders via `react-markdown` + `remark-gfm` (the dependency
      [Phase 12 Theme A](phase-12-commit-inspector.md) already plans — same versions) with a
      **source ⇄ rendered toggle** in the preview header
- [ ] Media through `mgit-file://`: `<img>` (png/jpg/gif/svg/webp), `<video>`/`<audio>` for
      av media, PDF in an `<iframe>` on Chromium's built-in viewer — verify the viewer works
      under the renderer's sandbox/CSP early, it is the riskiest integration here; if it
      won't, show the fallback card rather than fighting it this phase
- [ ] Fallback card for `binary` / `too-large` / unloadable: file name, kind, human size — an
      info card, no escape hatch to the OS (guarded `shell:open-external` is Phase 12 E's)
- [ ] Preview header: filename, size, language badge, markdown toggle. The component takes a
      **content descriptor, not a path** — the seam that later lets Phase 12's inspector mount
      it against a blob-at-commit
- [ ] No edit affordance anywhere: no contentEditable, no context-menu rename/delete —
      read-only is a feature of this phase, not an omission

### E — Agent settings page (M)

- [ ] `settings-pages/agent-page.tsx` — `~/.claude` browsed read-only with Theme C's tree
      against Theme B's `claude-home` scope (skills, projects, plans, settings — the folder
      structure as-is, lazy like the repo tree)
- [ ] `agent:claude-info` channel — main runs `claude --version` through a **login shell**
      (the same nvm/asdf resolution trick Phase 15 uses to spawn agents), parses the version,
      and best-effort detects the install method from `which claude`'s path
      (`.nvm`/npm-global → npm, `/opt/homebrew` → brew, `~/.local` → native installer)
- [ ] Version card: installed version, detected install method, a refresh button, and a clear
      "not installed" state that offers the install command instead
- [ ] **Update** runs directly (hybrid decision): main spawns the method-matched update
      command, streams stdout/stderr to the page over a `agent:claude-update-data` event,
      button disabled while running, exit code rendered as success/failure — envelope, never
      a throw
- [ ] **Uninstall** never auto-runs: the button opens the terminal panel (Phase 15) and pastes
      the method-matched uninstall command **without a trailing newline** — pressing Enter is
      the confirmation, which satisfies the destructive-ops rule without another dialog
- [ ] `claude-info` degradation: `claude` missing, `--version` output unparseable, or the
      login shell timing out all land on the "not installed / unknown" card, never a spinner
      forever

## Files this phase touches

- [`packages/app/src/app.tsx`](../packages/app/src/app.tsx) — nav regroup, `files` view branch
- [`packages/app/src/store/ui-store.ts`](../packages/app/src/store/ui-store.ts) — `ViewId`, `settingsPage`, layout keys
- [`packages/app/src/features/settings/settings-view.tsx`](../packages/app/src/features/settings/settings-view.tsx) — becomes the page shell (+ new `settings-pages/`)
- `packages/app/src/features/files/` — **new**: view, tree, store, `preview/`
- [`packages/shared/src/ipc/channels.ts`](../packages/shared/src/ipc/channels.ts) (+ `schemas.ts`, `bridge.ts`) — `mgit:fs:*`, `agent:claude-*`
- `packages/desktop/src/main/ipc/fs-handlers.ts` — **new**: jail + handlers + `mgit-file://` protocol
- [`packages/git-engine/src`](../packages/git-engine/src) — batched `check-ignore` lister
- [`todo/outstanding.md`](outstanding.md) — re-note diff highlighting as unblocked once shiki lands

## Verification

- [ ] `moon run :typecheck :lint :test` green
- [ ] `fs-handlers.test.ts` — the jail holds: `..`, absolute paths, and out-of-root symlinks
      all rejected in both scopes; binary sniff and size cap behave
- [ ] git-engine test — `check-ignore` batching round-trips names containing newlines and
      spaces (the NUL rule is why)
- [ ] `ui-store.test.ts` — new persistence assertions from Theme A
- [ ] `e2e/mock-bridge.ts` gains `fs:*` + `agent:claude-info` mocks; spec: open Files, expand
      a directory, select a file, the preview renders; switch to Settings, all four pages
      reachable, Settings sits at the bottom of the rail
- [ ] Manual: browse this repo — ignored entries dimmed, `node_modules` costs nothing until
      expanded; a `.ts` file highlights; `README.md` renders and the toggle shows source; a
      png, an mp4, and a pdf display in-pane; a >1.5 MB file and a binary show the fallback
      card; nothing anywhere lets you edit
- [ ] Manual: Agent page shows the `~/.claude` tree and the real installed version; Update
      streams output to completion; Uninstall opens the terminal with the command pasted and
      **not** executed
- [ ] Screenshots → `docs/screenshots/phase-16-files.png`, `phase-16-settings-agent.png`

## Decisions / open questions

- **Settled in brainstorm:** inner-sidebar settings navigation (not tabs, not rail
  sub-items); pages = Appearance / Graph / Terminal / Agent; hybrid agent actions (Update
  runs + streams, Uninstall pastes into the terminal); shiki over highlight.js/CodeMirror;
  tree shows the working tree with ignored entries dimmed; markdown rendered with a source
  toggle; strictly read-only.
- **Text preview cap** — recommended ~1.5 MB; revisit only if it annoys in practice.
- **Tree virtualization** — start without; `@tanstack/react-virtual` is already in-tree if a
  giant flat directory chugs.
- **PDF-in-iframe under the sandbox** — the one integration that may simply not work with
  current webPreferences; the fallback card is the agreed answer this phase, not loosening
  the sandbox.
- **Watcher-driven tree refresh** — stretch, not required; manual refresh + repo-switch
  re-list is the bar.
