# Phase 99 — Media page

Brainstormed with the user · 2026-09-29 · grounded against the tree as of `aac1233e`.

The **Video** view from [Phase 44](phase-44-video-studio.md) becomes one tab of a new **Media**
page. Media browses and creates four kinds of media: **Docs**, **Images**, **Video** and **Audio**.

A strip of icon buttons switches between the tabs. Each button has a tooltip, and the active one
also shows its label. Every tab uses the same frame:

- a toolbar with the tab's export options;
- a resizable three-pane body:
  - an explorer on the left;
  - the content in the centre;
  - a detail or prompt panel on the right.

What differs per tab is what fills those slots:

| Tab | Left | Centre | Right | Export |
|---|---|---|---|---|
| **Docs** | project accordion | Notion-style markdown editor | AI thread that edits the doc | md · html · pdf |
| **Images** | images-only explorer | masonry gallery + lightbox, led by a glowing "+" tile | prompt + provider/model picker (Antigravity CLI default) | png · jpeg · webp |
| **Video** | assets tree + projects tree (down to versioned iterations) | the embedded Remotion Studio | detail for the explorer selection | mp4 · webm · gif · prores · … |
| **Audio** | projects | variants / prompt session, with a bottom player | Suno-style prompt form | mp3 · wav · flac |

> **Builds on.**
> - **Video Studio (Phase 44).** The renderer code is in
>   [`features/video/`](../../../packages/app/src/features/video/):
>   - [`video-view.tsx`](../../../packages/app/src/features/video/video-view.tsx) lays out three
>     resizable panes: project list, studio and detail.
>   - [`video-studio-pane.tsx`](../../../packages/app/src/features/video/video-studio-pane.tsx)
>     hosts the real Remotion Studio in a `WebContentsView` (`bridge().browser.create({tabId:'video-studio-<id>'})`
>     + `useBrowserBounds`), not an iframe.
>   - [`video-project-detail.tsx`](../../../packages/app/src/features/video/video-project-detail.tsx)
>     shows the brief, the two skill buttons, the input files and the renders.
>   - [`use-video.ts`](../../../packages/app/src/features/video/use-video.ts) holds the react-query hooks.
>
>   Main drives everything from outside and ships **no Remotion dependency**:
>   - [`video-service.ts`](../../../packages/desktop/src/main/video-service.ts)
>   - [`video/studio-service.ts`](../../../packages/desktop/src/main/video/studio-service.ts)
>     (`npx remotion studio --no-open`, URL read from stdout)
>   - [`render-service.ts`](../../../packages/desktop/src/main/video/render-service.ts)
>   - [`toolchain.ts`](../../../packages/desktop/src/main/video/toolchain.ts)
>   - [`project-discovery.ts`](../../../packages/desktop/src/main/video/project-discovery.ts)
>   - [`projects-store.ts`](../../../packages/desktop/src/main/video/projects-store.ts)
>
>   The contract is [`shared/src/video.ts`](../../../packages/shared/src/video.ts) (`VIDEO_SKILLS`)
>   plus the `mstudio:video:*` channels in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts).
> - **Video's registration, all of which Theme A moves:**
>   - `'video'` in `VIEW_IDS` ([`domain/view.ts`](../../../packages/shared/src/domain/view.ts));
>   - `video: { Component: VideoView, global: true }` in [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx);
>   - the rail row in [`app.tsx`](../../../packages/app/src/app.tsx), with `LuClapperboard` from [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts);
>   - `view.video` in [`keybindings.ts`](../../../packages/shared/src/keybindings.ts), with no chord;
>   - [`nav-visibility.ts`](../../../packages/app/src/components/nav-visibility.ts),
>     [`title-bar-nav.tsx`](../../../packages/app/src/components/title-bar-nav.tsx),
>     [`palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts) and
>     [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts);
>   - Settings ▸ Video ([`video-page.tsx`](../../../packages/app/src/features/settings/settings-pages/video-page.tsx));
>   - the pane widths `videoProjectListWidth` (224) and `videoDetailWidth` (320) in
>     [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts).
> - **The reference video workspace, `~/Dev/midnite/midnite-videos`.**
>   - Shared `assets/{audio,fonts,images,logos,video}`.
>   - `projects/<brand>/<category>/<NNN-name>/`: a project is any directory holding a `project.json`
>     (id, title, composition, brief, script). Each project has:
>     - `input/`, containing `BRIEF.md` and source media;
>     - `notes/`;
>     - an optional `EDITORIAL_SCRIPT.md`;
>     - `output/vN-label.mp4` iterations, auto-numbered, with a tracked `output/CHANGELOG.md`
>       and `_stills/`.
>   - `video-editor/`: one Remotion 4 app (React 19, Tailwind v4) serving every project.
>   - `scripts/` (`render.mjs`, `sync-assets.mjs`, `projects.mjs`) and `tools/` (ffmpeg helpers).
>   - The two skills `/video-write-editorial-script` and `/video-execute-editorial-script`.
> - **Layout and tree parts:**
>   - [`ResizeHandle`](../../../packages/app/src/components/resizable/resize-handle.tsx) and
>     [`useResizable`](../../../packages/app/src/components/resizable/use-resizable.ts),
>     wired to `LAYOUT_BOUNDS`/`DEFAULT_LAYOUT`;
>   - [`TreeSection`](../../../packages/app/src/components/tree-section.tsx) and `tree-indent.ts`;
>   - the Explorer's `features/files/file-tree.tsx`.
>
>   **There is no generic Accordion yet.**
> - **Markdown:**
>   - [`markdown-preview.tsx`](../../../packages/app/src/features/files/preview/markdown-preview.tsx)
>     renders with react-markdown and remark-gfm, styled by
>     [`MARKDOWN_PROSE_CLASSES`](../../../packages/app/src/features/markdown/prose.ts).
>   - Notes edits with Monaco ([`code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx)).
>
>   **There is no rich or Notion-style editor in the package.**
> - **Media preview.** [`file-preview.tsx`](../../../packages/app/src/features/files/preview/file-preview.tsx)
>   already renders images (with dimension readout and compare), `<video controls>` and `<audio controls>`,
>   choosing between them by `PreviewKind` in [`languages.ts`](../../../packages/app/src/lib/languages.ts).
>   **There is no lightbox.**
> - **Providers and icons:**
>   - `BUILTIN_AGENTS` in [`terminal.ts`](../../../packages/shared/src/terminal.ts) lists claude,
>     `agy` (Antigravity), codex, cursor, copilot, opencode, grok, goose and others.
>   - Icons live in [`components/icons/`](../../../packages/app/src/components/icons/index.ts)
>     (`AntigravityIcon`, `ClaudeIcon`, `CodexIcon`, …) and are resolved with `resolveAgentIcon()`.
>   - [`IconSelect`](../../../packages/app/src/components/select/icon-select.tsx) is the dropdown with
>     icons, used with agents in [`loop-composer.tsx`](../../../packages/app/src/features/loops/loop-composer.tsx).
>   - Model tiers are in [`ai-models.ts`](../../../packages/shared/src/ai-models.ts).
> - **Headless AI seams (text only):**
>   - [`improve-field.ts`](../../../packages/desktop/src/main/ai/improve-field.ts) runs one prompt through an agent.
>   - [`ollama-headless.ts`](../../../packages/desktop/src/main/ai/ollama-headless.ts) provides `runOllamaPrompt`.
>   - `agy` is only ever run inside a pty today. **Nothing in the tree generates an image or any audio.**
>     The companion's TTS is not generative.
> - **Probes, keys and installs:**
>   - [`system-health.ts`](../../../packages/desktop/src/main/system-health.ts) provides `probeBinary`.
>   - [`secrets-vault.ts`](../../../packages/desktop/src/main/secrets-vault.ts) stores API keys.
>   - Installs run in a visible terminal, never headless ([Phase 98](phase-98-setup-wizard-overlay.md)).
> - **Not to be confused with** [Phase 74](phase-74-media-caches-and-the-trash.md). Its `'media'` is an
>   optimizer ecosystem value for disk caches, a different type that does not clash with a `'media'` ViewId.

> **Scope guardrails.**
> - **No bundled binaries.** Phase 44's rule holds: no Remotion, Chromium or ffmpeg goes in the asar.
>   **ffmpeg is a required external tool.** It is detected with `probeBinary`. When it is missing,
>   the app offers `brew install ffmpeg` in a visible terminal, and every export is disabled until
>   the tool is there, with a hint saying why.
> - **Storage is per repo.** Docs, Images and Audio live under the active repo's
>   `.midnite/media/<type>/<project>/`, as plain files that git and Finder can both see.
>   **Everything there is tracked. No `.gitignore` is written.** Video resolves its root in three steps;
>   see Theme D.
> - **Generation runs through provider seams in main.** The renderer never calls a model API.
>   Keys stay in `secrets-vault.ts`.
> - **No real music generation in this phase.** Audio ships the full UI and the player, with an
>   `AudioProvider` seam whose only adapter is Import.
> - Package boundaries hold:
>   - schemas, the tab and export enums, and provider ids live in `shared`;
>   - file I/O, provider adapters, ffmpeg and Remotion processes live in `desktop`;
>   - the renderer reaches all of it through `window.midniteStudio`.
> - macOS only, per `CLAUDE.md`.

> **Effort tags.** S ≈ ≤½ day · M ≈ 1–2 days · L ≈ 3+ days. Theme A lands first. B–E are then
> independent and can run in parallel.

---

## Headlines

*The Video view grows into a four-tab Media page (Docs, Images, Video, Audio) on one shared
three-pane frame, with repo-scoped storage, ffmpeg-backed export and provider seams for generation.*

**Theme A — Media shell, storage and migration.** ✅ DONE (PR #608, 2026-09-29). `'media'` replaced the `'video'` ViewId (ui-store v29 migrates the persisted `video` entries in navVisibility, sectionFilters and settingsPage, moves the pane widths to the Video tab and opens an existing profile on Media ▸ Video; `/video` and `view.video` resolve to Media). Contract in `shared/src/media.ts`; `mstudio:media:*` channels + `media:changed`/`media:export-progress`. Main: `main/media/media-store.ts` (rejects `..` paths and symlinks at any segment, per-root WriteQueue, deletes go to the Trash, no .gitignore, `largeFile` above 25 MB) and `main/media/export-service.ts` (ffmpeg argv table, progress, cancel, native save dialog). Renderer seams for B–E: `MediaLayout` + `openMediaPane`, `components/accordion/accordion.tsx`, `ExportToolbar`, `features/media/use-media.ts` hooks, and the `TAB_BODY` swap point in `media-view.tsx`. Video still lives in `features/video/` and renders through MediaLayout until Theme D moves it. Settings ▸ Media replaced Settings ▸ Video.

**Theme B — Docs.** ◻ lazy Tiptap editor over plain `.md`, project accordion, AI edit thread with accept/reject diffs, md/html/pdf export

**Theme C — Images.** ✅ DONE (PR #609, 2026-09-30) — spike ◐. **agy spike: blocked, not disproved** — the unattended swarm session's permission classifier denied the headless launch (`agy -p "<prompt>" --dangerously-skip-permissions --output-format json`), so no argv/exit-code/latency was recorded; `agy` 1.2.12's help shows print mode emits text/json/stream-json only, with no image-output flag, so per the doc's fallback **Gemini is the default** and agy is listed-disabled (`AGY_IMAGE_DISABLED_REASON`). Re-run the spike by hand. Landed: `main/media/image/` seam (`gemini` generateContent/Imagen `:predict`, `openai` gpt-image, `ollama` image-capability models only, `agy` stub) behind `image-service.ts` (vault keys `media.geminiApiKey`/`media.openaiApiKey`, writes image + `<name>.json` sidecar through the media-store jail, progress + cancel); `mstudio:media:image-{providers,generate,cancel,progress}`. Renderer `features/media/image/`: create panel with provider `IconSelect` (icon on value), dependent model, aspect, count, Add-key link; CSS-columns masonry led by the dashed glowing "+" tile (`openMediaPane`), shimmer placeholders, `content-visibility` past 200; portalled lightbox (`useDismiss`+`useFocusTrap`, ←/→ wrap, n/N, sidecar strip with Re-run/Reveal/Delete); images-only explorer + "All images in repo" toggle; png/jpeg/webp export with a quality slider; Settings ▸ Media ▸ Images (defaults in a small persisted store, not ui-store, to avoid B–E migration races). The "+" glow is asserted in `media-images.spec.ts` (computed box-shadow/text-stroke) rather than a Linux visual baseline — no Docker to regenerate baselines here; baseline left open.

**Theme D — Video.** ✅ DONE (PR #613, 2026-09-30). `features/video/` moved to `features/media/video/`; `VideoTab` renders through `MediaLayout` and every `mstudio:video:*` channel keeps its shape. Root resolution (`main/video/root-resolution.ts`): in-repo layout (`video-editor/` + `projects/`) → `<repo>/.midnite/media/video/` → global root. The new `mstudio:video:root-resolve {repoId}` makes main adopt the answer as the *effective* root for every existing op, so no Phase 44 channel grew a `repoId`. The source shows as a toolbar badge. Setup Video (`mstudio:video:setup`) copies the checked-in `templates/media-video/` (a trimmed midnite-videos skeleton with one `ExampleHello` composition, `_template`, an example project, the scripts and both skills; it ships in `extraResources` with the rest of `templates/`), creates empty `assets/*`, runs `npm install` in a visible terminal and selects the example project. Project ids are paths (`brand/category/NNN`), matching midnite-videos' `projects.mjs`. Explorer: Assets (recursive tree) and Projects (folders → project → iterations newest first + `input/`/`notes/`) accordions. Detail switches on selection kind: asset preview with dims/duration/size; project (Phase 44 detail + New iteration); iteration (player, `CHANGELOG.md` entry, Compare with… side by side); file. Studio deep-links `/<composition>`. Iteration media is served over a new `mstudio-file://video/-/…` host confined to the resolved root. Render dialog: h264/vp8/vp9/prores/gif, crf, scale, label (`remotionCodecArgs`). Non-h264 bypasses `scripts/render.mjs`, which hard-codes `.mp4`. Transcode runs through the Theme A export service via a new `video` arm on `MediaExportSource`. Also fixed: `useVideoFiles`' `initialData` never refetched under the global `staleTime: Infinity`. Left: a human pass on the packaged app (real scaffold + install + renders).

**Theme E — Audio.** ◻ Suno-style prompt form, variants/session list, bottom player (skip/shuffle/loop), `AudioProvider` seam (Import only), mp3/wav/flac export

---

## Deliverables

### A — Media shell, storage and migration (M)

- [x] **ViewId.**
  - Add `'media'` to `VIEW_IDS` and register `media: { Component: MediaView }` in `view-registry.tsx`.
  - It is repo-scoped, so with no repo open Docs, Images and Audio show an "Open a repo" empty state.
    Video still works through its fallback root (Theme D).
  - Add a rail row with a media glyph (e.g. `LuFilm` or `LuLibrary`) in `nav-icons.ts`.
  - Add a `view.media` command to `COMMANDS`, with no chord.
- [x] **Tab state.**
  - Add a `MediaTab = 'doc' | 'image' | 'video' | 'audio'` enum to a new `packages/shared/src/media.ts`.
  - The ui-store gets `mediaTab`, persisted, plus a per-tab `{explorerWidth, detailWidth}` in
    `LAYOUT_BOUNDS`/`DEFAULT_LAYOUT`.
  - Seed Video's widths from the existing `videoProjectListWidth` and `videoDetailWidth`.
- [x] **Tab strip.**
  - Icon buttons: Docs `LuFileText`, Images `LuImage`, Video `LuClapperboard`, Audio `LuAudioLines`.
  - Every button has a `Tooltip`, and the **active button also renders its label** inline.
  - It is a `role="tablist"` with arrow-key roving focus.
  - Adds `media.tab.doc|image|video|audio` palette commands.
- [x] **`MediaLayout` frame.**
  - Slots: `toolbar`, `explorer`, `content`, `detail`.
  - Two `ResizeHandle` dividers. Double-click a divider to collapse its pane, and each collapse state is
    remembered per tab.
  - Both side panels can be opened programmatically (Images' "+" tile uses this).
- [x] **`Accordion`.** A generic component in `components/accordion/`: several sections, each with a
      header, a count, an actions slot and a persisted open/closed state. It is built on
      `TreeSection` visuals, and Docs, Video and Audio all use it.
- [x] **Export toolbar.**
  - Each tab declares its formats as `MediaExportFormat[]` in `shared`.
  - The toolbar renders a split button: **Export** plus a format menu.
  - It is disabled, with a tooltip, while there is nothing selected or ffmpeg is needed but missing.
- [x] **Media store (main).**
  - New `packages/desktop/src/main/media/media-store.ts`:
    - lists, reads, writes, renames and deletes projects and files under `<repo>/.midnite/media/<tab>/`;
    - confines every path to that root;
    - routes writes through a per-root queue.
  - New channels `mstudio:media:*` (`project-list`, `project-create`, `file-list`, `file-read`,
    `file-write`, `file-remove`, `reveal`), with zod payloads.
  - Every op returns the `GitOpResult`-style `{ok}` envelope and never throws across IPC.
  - A `mediaChanged` event, fed by a watcher on the root.
  - Deleting a project goes to the Trash (Phase 74's seam) behind a confirm naming its file count.
- [x] **ffmpeg toolchain.**
  - A `probeBinary('ffmpeg')` row joins the Video toolchain probe and Settings ▸ Media.
  - The **Install** action types `brew install ffmpeg` into a visible terminal session.
- [x] **Export service (main).**
  - New `main/media/export-service.ts`: `exportMedia({source, format, dest})` runs ffmpeg with an
    argv array (never a shell string) and streams progress (`mediaExportProgress`).
  - It is cancellable.
  - The destination comes from a native save dialog.
  - Per-format presets live in one table: image png/jpeg/webp, audio mp3/wav/flac, video transcode.
- [x] **Migration.**
  - `'video'` leaves the rail.
  - A ui-store version bump rewrites any persisted `'video'` route or tab-group entry to
    `media` + `mediaTab: 'video'`.
  - `view.video` stays as an alias that opens Media on the Video tab.
  - `nav-visibility`, `title-bar-nav`, the palette providers and `view-sections` switch to `'media'`.
- [x] **Settings ▸ Media.** It replaces Settings ▸ Video, which redirects to it. Sections:
  - **General**: ffmpeg status and the export default folder;
  - **Video**: the existing root and toolchain rows;
  - **Images**: default provider/model and API-key rows;
  - **Audio**: the provider placeholder.
- [x] Vitest:
  - tab-strip roving focus, and the label rendering only on the active tab;
  - layout width persistence;
  - the migration from a v-previous blob holding `'video'`;
  - `media-store` path confinement, rejecting `..` and symlinks out;
  - the ffmpeg argv builder, one case per format.

### B — Docs (L)

- [ ] **Editor.**
  - Tiptap (`@tiptap/react`, StarterKit, Placeholder, TaskList, Table, Link, CodeBlockLowlight) plus
    `tiptap-markdown`, **lazy-loaded** as its own chunk that only loads when the Docs tab mounts.
  - Record the chunk size with `scripts/perf/bundle-report.mjs`. The entry chunk must not grow.
- [ ] **Markdown on disk.**
  - Docs are plain `.md` files under `.midnite/media/doc/<project>/`.
  - A load → edit → save round-trip keeps headings, lists, task lists, tables, code fences and links.
    A fixture suite asserts it, and the known lossy constructs (HTML blocks, footnotes) are listed in
    the suite's header.
  - Autosave is debounced. An external change on disk, arriving through `mediaChanged`, reloads the doc
    unless it has unsaved edits, in which case a banner offers to reload.
- [ ] **Notion-style affordances:**
  - a `/` slash menu (headings, lists, to-do, quote, code, table, divider, **Ask AI**);
  - a floating bubble menu on selection (bold, italic, code, link, **Ask AI about selection**);
  - a drag handle on each top-level block;
  - `MARKDOWN_PROSE_CLASSES` so an edited doc looks the same as the rendered markdown elsewhere.
- [ ] **Left: project accordion.** One `Accordion` section per project, each listing its docs.
      You can create, rename and delete both projects and docs, and a filter box sits at the top.
- [ ] **Right: AI thread.**
  - Each doc has its own chat thread, persisted beside it as `<doc>.thread.json`.
  - A prompt runs **headless through the primary agent**, via the `improve-field.ts` seam, which is
    generalised into a `runDocEdit({doc, selection?, prompt})` channel.
  - When text is selected, the edit is scoped to that selection; otherwise to the whole doc.
  - The agent returns **replacement markdown, shown as a diff card in the thread**, with
    **Accept** / **Reject** / **Copy** actions. Nothing is written without Accept.
  - A provider/model `IconSelect` in the thread header defaults to the primary agent.
- [ ] **Export:**
  - `.md` is the raw file;
  - `.html` is standalone, with the prose CSS inlined;
  - `.pdf` goes through a hidden `webContents.printToPDF` of that HTML.
  - None of these need ffmpeg.
- [ ] Vitest: markdown round-trip fixtures, the thread store, diff-card accept/reject writing through
      `file-write`, the export HTML builder, and the lazy-chunk boundary (the Docs tab module imports no
      Tiptap synchronously).

### C — Images (L)

- [ ] ◐ PARTIAL **Spike first: agy headless image output.** *(PR #609: not run — the unattended session's permission classifier denied the headless `agy -p` launch; fallback applied: Gemini default, agy listed-disabled. Re-run by hand.)*
  - Prove, or disprove, that Antigravity CLI can take a prompt non-interactively and write a PNG to a
    given path.
  - Record the exact argv, the exit codes, how output is detected, and its latency, in this doc's Headlines.
  - **If it cannot, the default provider becomes Gemini**, with the finding written up. agy stays
    listed, disabled, with a tooltip explaining why.
- [x] **`ImageProvider` seam (main).**
  - New `main/media/image/`, with the interface
    `generate({prompt, model, size, count, seed?}) → {files[]}` and progress events.
  - Adapters:
    - `agy`, the default if the spike passes;
    - `gemini`, over the image API with a vault key;
    - `openai`, gpt-image with a vault key;
    - `ollama`, but only models that report image output, and hidden if there are none.
  - Provider and model catalogues live in `shared/src/media.ts`.
  - Outputs are written to `.midnite/media/image/<project>/`, with a sidecar `<name>.json` recording
    the prompt, provider, model, seed and time.
- [x] **Right: create panel.**
  - A prompt textarea.
  - A **provider** `IconSelect` that shows the icon both in the list and on the chosen value.
  - A dependent **model** select.
  - Size or aspect, and a count.
  - **Generate** runs with a progress state, and a cancel button.
  - A missing API key shows an inline "Add key" link to Settings ▸ Media.
- [x] **Centre: masonry gallery.**
  - A CSS-columns masonry layout; virtualise it if the image count exceeds ~200.
  - The **first tile is a large dashed "+"**. On hover its border, its "+" icon and its label's text
    stroke all glow (reusing the gradient-glow tokens). Clicking it opens and focuses the right create panel.
  - Tiles for images still generating show a shimmer placeholder until the file lands.
  - Motion is gated by `data-motion` and passes `styles-motion-guards.ts`.
- [x] **Lightbox.**
  - Opening it on a tile gives a full-window overlay (`useDismiss` + `useFocusTrap`, added to
    `occluder-coverage.test.tsx`).
  - ←/→ step through images, Escape closes it, and the image's number (e.g. 3/40) is shown.
  - A side strip shows the sidecar metadata, with **Re-run prompt**, **Reveal** and **Delete** actions.
- [x] **Left: images-only explorer.**
  - Lists projects under `.midnite/media/image/`, showing only image files.
  - Has an **"All images in repo"** toggle, which reads the repo file list filtered by `PreviewKind === 'image'`.
- [x] **Export:** png, jpeg (quality slider) or webp via the Theme A export service, for the
      selected image or the lightbox's current one.
- [x] Vitest:
  - the provider catalogue, and model filtering per provider;
  - the create-panel reducer;
  - sidecar schema parsing;
  - lightbox keyboard navigation and wrap-around;
  - the "+" tile opening the detail pane.

  One e2e spec covers the masonry layout and the lightbox, because both need real layout.

### D — Video (L)

- [x] **Move it in.**
  - `features/video/` becomes `features/media/video/`, rendered through `MediaLayout`'s slots. The
    three existing panes map onto explorer, content and detail.
  - The `mstudio:video:*` channels and main services stay as they are.
- [x] **Root resolution**, in this order. The chosen source is shown in the toolbar:
  1. the **active repo itself**, if it has the midnite-videos layout (`video-editor/` + `projects/`);
  2. otherwise **`<repo>/.midnite/media/video/`**, if it exists;
  3. otherwise the **global root setting** from Phase 44.

  This extends `project-discovery.ts`.
- [x] **"Setup Video" empty state.** When none of the three resolves, one CTA scaffolds a trimmed
      midnite-videos skeleton from a new checked-in `templates/media-video/` into
      `<repo>/.midnite/media/video/`:
  - `video-editor/` (the Remotion app with a single example composition);
  - `projects/_template/`;
  - empty `assets/{audio,fonts,images,logos,video}/`;
  - `scripts/{render,sync-assets,projects}.mjs`;
  - the two `.claude/skills/video-*` skills.

  It then runs the package install **in a visible terminal** and opens the new-project flow.
- [x] **Left: two accordions.**
  - **Assets**: a tree of `assets/`, with type icons.
  - **Projects**: a tree of `<brand>/<category>/<NNN-name>`, each project expanding to its
    **iterations** (`output/vN-label.mp4`, newest first) and its `input/` and `notes/` files.
- [x] **Right: detail for whatever is selected.**
  - **Asset**: `file-preview.tsx` (image, video or audio), with its dimensions, duration and size.
  - **Project**: the brief as markdown, the editorial script, the two skill buttons (as in Phase 44),
    and **New iteration**, which renders into the next free `vN`.
  - **Iteration**: an inline `<video>` player, its `CHANGELOG.md` entry, and **Compare with…**
    (plays two iterations side by side).
- [x] **Centre.** The embedded Remotion Studio, unchanged, now focused on the selected project's
      composition. It gains a "Studio not running" state with a Start button.
- [x] **Export.**
  - A render dialog with codec choice (`h264` mp4, `vp8`/`vp9` webm, `prores`, `gif`), crf/quality
    and resolution scale, run through `remotion render --codec`.
  - A **transcode** option re-encodes an existing iteration through the ffmpeg export service,
    without re-rendering.
- [x] Vitest:
  - root resolution, one case per source;
  - iteration parsing from `output/` (vN ordering, labels, pinned versions sharing a number);
  - the template manifest (every file the scaffold needs exists in `templates/media-video/`);
  - the codec → argv table;
  - detail-panel switching by selection kind.

### E — Audio (L)

- [ ] **Right: Suno-style prompt form.**
  - Fields: title, **style / genre tags**, **lyrics** (a multiline editor with `[Verse]`/`[Chorus]`
    section helpers), an **instrumental** toggle, a duration target and a variant count.
  - A provider `IconSelect` backed by the `AudioProvider` catalogue.
  - With only Import available, **Create** shows a "Generation arrives in a later phase" state, and an
    **Import audio…** action attaches files as variants.
- [ ] **`AudioProvider` seam (main).**
  - The interface `generate({title, style, lyrics?, instrumental, durationS, count}) → {files[]}`, with
    progress events, mirroring `ImageProvider`.
  - Its **only adapter is `import`**, which copies chosen files in and writes the sidecar.
  - Each project lives at `.midnite/media/audio/<project>/`, holding `project.json` plus variants,
    and each variant has a sidecar `<name>.json`.
- [ ] **Centre: the session.**
  - The project's prompt history, one card per create or import.
  - Each card lists its **variants**, showing title, duration, a static waveform thumbnail (peaks
    computed once with the Web Audio API and cached in the sidecar), and a play button.
- [ ] **Bottom player.**
  - It docks at the foot of the Audio tab once anything plays.
  - Controls: play/pause, previous/next, **shuffle**, **loop** (off / all / one), a seek bar with
    time, and volume.
  - The queue is the current project's variants.
  - Space toggles play while focus is outside a text field.
  - It is a single `HTMLAudioElement` held in a store, so switching tabs does not stop playback.
    Leaving Media pauses it.
- [ ] **Left: projects explorer.** An `Accordion` of projects with variant counts. You can create,
      rename and delete them (delete goes to the Trash).
- [ ] **Export:** the selected variant as mp3 (bitrate choice), wav or flac, through the Theme A
      export service.
- [ ] Vitest:
  - the player store (shuffle order stays stable within a pass, loop-one repeats, next at the end
    of the queue with loop off stops);
  - the prompt-form schema;
  - the import adapter writing its sidecar;
  - the waveform peak reducer.

---

## Files this phase touches

| Area | Files |
|---|---|
| Contract | new `packages/shared/src/media.ts` (tabs, export formats, provider catalogues, sidecar schemas); [`domain/view.ts`](../../../packages/shared/src/domain/view.ts), [`keybindings.ts`](../../../packages/shared/src/keybindings.ts), [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`video.ts`](../../../packages/shared/src/video.ts) |
| Shell | new `packages/app/src/features/media/` (`media-view.tsx`, tab strip, `media-layout.tsx`, export toolbar); new `components/accordion/`; [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx), [`app.tsx`](../../../packages/app/src/app.tsx), [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts), [`nav-visibility.ts`](../../../packages/app/src/components/nav-visibility.ts), [`title-bar-nav.tsx`](../../../packages/app/src/components/title-bar-nav.tsx), [`palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts), [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts), `services/keybindings/use-command-handlers.ts` |
| State | [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (media tab, per-tab widths, the `video` migration) |
| Docs | new `features/media/doc/`; generalises [`improve-field.ts`](../../../packages/desktop/src/main/ai/improve-field.ts); reuses [`prose.ts`](../../../packages/app/src/features/markdown/prose.ts) |
| Images | new `features/media/image/`, new `packages/desktop/src/main/media/image/`; [`icon-select.tsx`](../../../packages/app/src/components/select/icon-select.tsx), [`components/icons/`](../../../packages/app/src/components/icons/index.ts), [`secrets-vault.ts`](../../../packages/desktop/src/main/secrets-vault.ts) |
| Video | moves [`features/video/`](../../../packages/app/src/features/video/) into `features/media/video/`; [`project-discovery.ts`](../../../packages/desktop/src/main/video/project-discovery.ts), [`render-service.ts`](../../../packages/desktop/src/main/video/render-service.ts), [`toolchain.ts`](../../../packages/desktop/src/main/video/toolchain.ts); new `templates/media-video/` |
| Audio | new `features/media/audio/` (form, session, player store); new `packages/desktop/src/main/media/audio/` |
| Main plumbing | new `packages/desktop/src/main/media/{media-store,export-service}.ts`; [`system-health.ts`](../../../packages/desktop/src/main/system-health.ts) (ffmpeg probe) |
| Settings | [`video-page.tsx`](../../../packages/app/src/features/settings/settings-pages/video-page.tsx) → `media-page.tsx` |
| Tests | new vitest suites per theme; `occluder-coverage.test.tsx` (lightbox); one e2e spec (masonry + lightbox); one visual baseline (the "+" tile glow) |

## Verification

- [ ] The rail shows **Media**, not Video. A profile whose last view was `video` opens on Media ▸ Video,
      and ⌘K "Video" still lands there.
- [ ] The tab strip shows four icon buttons with tooltips, and only the active one also shows its
      label. Arrow keys move between tabs.
- [ ] On every tab both dividers resize, double-click collapses a pane, and each tab keeps its own widths
      across relaunches.
- [ ] Docs: create a project and a doc, write with `/` commands, then reopen it. The `.md` on disk is
      clean markdown. An **Ask AI** edit arrives as a diff and changes nothing until Accept. Export
      produces md, html and pdf.
- [ ] Images: the agy spike outcome is recorded here. Generate with the default provider, and the image
      appears after the "+" tile. The "+" glow shows on hover. The lightbox steps with ←/→ and closes on
      Escape. The provider icon shows both in the dropdown and on the selected value. png, jpeg and webp
      exports open in Preview.
- [ ] Video:
  - Opening the `midnite-videos` repo resolves the in-repo layout.
  - A fresh repo shows **Setup Video**, which scaffolds, installs in a visible terminal and opens
    Studio on the example composition.
  - Iterations list newest first, **Compare** plays two iterations side by side, and export renders mp4
    and webm.
- [ ] Audio: import two files into a project. They show as variants with waveforms. The bottom player's
      play, pause, next, shuffle and loop-one behave, and playback survives a tab switch. mp3 and wav
      exports play.
- [ ] With ffmpeg absent, the export buttons are disabled with a hint, and **Install** runs
      `brew install ffmpeg` in a visible terminal.
- [ ] Every `.midnite/media/` write shows up in `git status`. Nothing is ignored.
- [ ] `bundle-report.mjs`: the entry chunk does not grow; the Tiptap chunk's size is recorded here.
- [ ] Reduced motion: the "+" glow and the shimmer placeholders are static.
- [ ] Human pass on the packaged app: all four tabs in light and dark, and a real agy or Gemini generation.
- [ ] `moon run :typecheck :lint :test` green; the e2e and visual budgets are within their caps.

## Not in this phase

- **Real music generation.** There is no public Suno API. A later phase picks a provider (ElevenLabs
  Music, local MusicGen, …) and plugs it into the `AudioProvider` seam.
- **Bundling** ffmpeg, Remotion or Chromium into the app.
- **Image editing**: crop, inpaint, upscale, variations from a source image.
- **Collaborative or multi-user docs**, and comments.
- **A cross-repo global media library.** Media is per repo, apart from Video's fallback root.
- **Git LFS** or any special handling for large binaries.
- Linux and Windows.

## Decisions / open questions

- **Resolved: scope.** All four tabs ship in one phase: Theme A first, then B–E in parallel.
- **Resolved: the Docs editor is Tiptap, lazy-loaded**, over plain `.md`. BlockNote was rejected as too
  heavy with lossy markdown; Monaco was rejected because it isn't Notion-style.
- **Resolved: the first tab is "Docs"** (id `doc`), not "Text".
- **Resolved: storage.** It is per repo under `.midnite/media/<type>/`, and **everything is tracked**:
  no `.gitignore` is written.
- **Resolved: image generation.** It goes through an `ImageProvider` seam, and Theme C opens with an agy
  headless spike. If agy cannot write an image non-interactively, Gemini becomes the default.
- **Resolved: audio.** The full UI and player ship now; generation is stubbed behind `AudioProvider`,
  with Import as its only adapter.
- **Resolved: Video's root** is the in-repo midnite-videos layout, then `.midnite/media/video/`, then the
  global root.
- **Resolved: Setup Video** scaffolds from a bundled `templates/media-video/`. There is no network clone.
- **Resolved: the ViewId.** It is the new `'media'`. `'video'` redirects, and `view.video` stays as an alias.
- **Resolved: export uses ffmpeg for every transcode.** The user chose it, and it is taken as a required
  *external* tool (probe plus visible `brew install`), not a bundled one. That keeps Phase 44's
  no-binaries rule.
- **Open: large binaries in git.** Tracking everything means rendered videos and generated images land
  in the repo. *Recommendation:* at `file-write` time, show a one-time non-blocking warning for any file
  over 25 MB, naming `git lfs track` as the option. Do not auto-configure LFS.
- **Open: AI edit granularity in Docs.** *Recommendation:* scope to the selection when there is one,
  otherwise the whole doc. Always a diff card; never a streaming in-place rewrite.
- **Open: the Images explorer scope.** *Recommendation:* default to `.midnite/media/image/`, with an
  "All images in repo" toggle, off by default.
- **Open: Media without a repo open.** *Recommendation:* Docs, Images and Audio show an
  "Open a repo" empty state. Video still works from the global root, so a user of Phase 44 today loses
  nothing.
- **Open: what the Audio player does when you leave Media.** *Recommendation:* it pauses. A global mini
  player is a follow-up, not this phase.
- **Open: test layers.** *Recommendation:* vitest everywhere, plus one e2e for the masonry and lightbox
  (which need real layout and pointer) and one visual baseline for the "+" tile glow (which needs real
  CSS).
