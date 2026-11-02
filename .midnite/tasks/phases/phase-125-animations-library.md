# Phase 125 — Media ▸ Animations: a library of animation clips

Requested by the user · 2026-11-02 · grounded against the tree as of `af0eb744f`.

Media gets a new top-level tab, **Animations**: a library browser for animation clips (Mixamo first),
with a proper timeline player, list + filter + search, and a way to grow the library from online
sources. It sits beside Models, Sprites and the rest; the Models page keeps its own rig and clip
tabs ([Phase 103](phase-103-models-rig-anim.md)) and this page does not replace them.

1. **A global library.** Clips live under the app-data directory, shared across every repo, with a
   manifest of clips (name, tags, duration, source/site, licence, author, original URL, sha256, file
   path). A game takes a clip from it into its own `assets/` through the existing asset-import path.
2. **Import.** Bulk-import a folder of downloaded Mixamo FBX files (with skin or without), plus
   GLB/glTF and BVH. Clips are named from file names and auto-tagged (locomotion, combat, idle,
   emote …).
3. **Browse and play.** A list with search, tag filters, a source filter and sort; a timeline player
   (play/pause, scrub, frame step, loop, speed, in/out range, per-bone lanes, current time/frame
   readout) that plays the clip on a chosen rigged model from the user's library, retargeted by bone
   name, falling back to the clip's own skeleton.
4. **Grow it.** Sketchfab through its official Data API v3 (animated + downloadable + licence
   filters, downloaded with the user's own API token from the app's vault). Every other site
   (TurboSquid, CGTrader, Mixamo, Quaternius, Poly Pizza, OpenGameArt, ActorCore free, CMU mocap)
   is a search link that opens in the system browser; the user imports what they download by
   drag-drop or folder pick. **No scraping.**

> **Builds on.**
> - **Tabs.** `MEDIA_TABS` in [`shared/src/media.ts`](../../../packages/shared/src/media.ts) (the SFX
>   tab, PR #1110, is the template for a tab that is a sub-surface of an existing feature:
>   `media-tabs.ts` meta, `compose/media-tabs.tsx`, `ui-store.ts` layout keys, `mock-bridge.ts`).
>   `library` is the precedent for a tab that is **not** repo-scoped (`REPO_SCOPED_MEDIA_TABS`).
> - **Where the code lives.** Inside the existing `packages/features/media-model/` package
>   (`main/animation/`, `renderer/animation/`), not a new feature package: animation clips are
>   model assets, the package already owns the rig/clip vocabulary (`clip-timeline.tsx`,
>   `model-geometry/`), and a new package would add moon, `ci.yml`, tsconfig and lockfile plumbing
>   for no boundary benefit. See Decision 6.
> - **IPC.** One zod-validated channel with an `op` union, like `mediaSfx`: `CHANNELS.mediaAnimation`
>   in `shared/src/ipc/channels.ts`, schemas in `ipc/schemas.ts`, bridge type in `ipc/bridge.ts`,
>   preload in `desktop/src/preload/index.ts`, Creator's bridge in `modules/creator/main/bridge.ts`.
> - **Secrets.** `SECRET_KEYS` in [`shared/src/domain/secrets.ts`](../../../packages/shared/src/domain/secrets.ts)
>   (the vault; write-only from the renderer). Theme E adds `media.sketchfabApiToken`.
> - **Game import.** `packages/features/media-game/main/games/asset-bridge.ts`
>   (`GameImportAssetRequest`, provenance, the `.midnite/media` roots, the path jail
>   `confineToRoot`). Theme G adds an `animation` source there.
> - **Preview.** Phase 103's `samplePose`/`bakeClip`/`resolveRig` and the R3F `EditorScene`
>   in `media-model/renderer/`.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_A shared shelf of motion._ Every game wants the same hundred clips: idle, walk, run, jump, a
sword swing. Today each one is re-downloaded per repo and previewed in a DCC tool. This phase makes
one library per machine, plays any clip on any rigged model, and points the user at the sites that
have more, without ever scraping one. Planned 2026-11-02 by an unattended swarm agent against the
human decisions recorded below; first slice is **A + B + C**.

**Theme A — Library store, manifest and IPC.** ✅ [PR #1118](https://github.com/bilo-io/midnite-studio/pull/1118). Clips live in one library under the app-data directory, indexed by `animations.manifest.json`, with content-addressed files and a single `mediaAnimation` channel. A corrupt manifest is moved aside and the library starts empty; a path that escapes the root is dropped. Wired through Studio's preload and Gamer's bridge. Creator does not host the tab, so its bridge stays without it.
**Theme B — Bulk import: FBX / GLB / BVH, Mixamo naming and auto-tags.** ✅ [PR #1118](https://github.com/bilo-io/midnite-studio/pull/1118). Hand-written readers pull duration, bones and skin from binary FBX (ASCII imports with an unknown duration), GLB/glTF and BVH. Mixamo names are cleaned and tagged from a keyword table. A folder walk stops at depth 4, skips symlinks, and one bad file does not abort the batch; the same bytes import once.
**Theme C — Animations page: list, filter, search.** ✅ [PR #1118](https://github.com/bilo-io/midnite-studio/pull/1118). Media ▸ Animations lists the library with search, tag chips, a source filter and sort, and a detail pane for name, tags and provenance. Import is a file picker, a folder picker, or a drop. The page is not repo-scoped. Review shots are `docs/screenshots/p125-abc/`.
**Theme D — Timeline player and retargeted preview.** ◻ Not started. Second slice.
**Theme E — Sketchfab search and download.** ◻ Not started. Needs the user's Sketchfab API token.
**Theme F — External source links.** ◻ Not started.
**Theme G — Import into a game.** ◻ Not started.
**Theme H — Verification.** ◻ Not started.

## Build order

1. **A → B → C** (first slice). A is the store and the wire; B fills it; C reads it. C can be
   built against A's mock bridge before B's parsers are done.
2. **D** needs only A's `read` op and C's page; it can land as its own PR.
3. **E** needs A (the store's `addDownloaded`) and the secret key; **F** is independent of E.
4. **G** last: it needs a clip in the library and a game to import into.

## A — Library store, manifest and IPC (S) ✅ DONE (PR #1118, 2026-11-02)

- [x] `shared/src/media-animation.ts`: `AnimationSourceSchema`, `AnimationFormatSchema` (`fbx · glb · gltf · bvh`), `AnimationClipSchema`, `AnimationManifestSchema` (`version: 1`), the op union for the channel, the result envelope, `ANIMATION_TAG_IDS`, `ANIMATION_MANIFEST_FILE`; exported from `shared/src/index.ts`
  - `AnimationClipSchema` fields: `id`, `name` (≤ 120), `tags[]` (lower-case, ≤ 16), `durationSec` (`null` when unreadable), `frameCount?`, `fps?`, `boneCount?`, `hasSkin`, `format`, `source`, `site?`, `licence`, `author`, `originalUrl?`, `sha256`, `file` (relative to the library root), `sizeBytes`, `addedAt`
  - Every optional is `.optional()`/`.default()` so a manifest written by a later build still loads
- [x] `media-model/main/animation/animation-library.ts`: `createAnimationLibrary({root})` → `list`, `get`, `add`, `update`, `remove`, `readFile`; manifest `animations.manifest.json` plus `clips/<sha256-prefix>-<slug>.<ext>`
  - Writes are atomic (temp file + rename) and serialised through one in-process queue (two imports racing cannot lose a clip)
  - A clip with an already-known `sha256` is a dedupe: the existing entry is returned, tags are merged, no second file is written
  - A malformed manifest is moved to `animations.manifest.corrupt-<ts>.json` and the library starts empty rather than throwing at boot
  - Every `file` is resolved through `confineToRoot`; a manifest entry that points outside the root is dropped on load
- [x] The library root is `<userData>/animation-library` (global, not per repo); main injects it (no `electron` import in the feature)
- [x] `CHANNELS.mediaAnimation` + `EVENT_CHANNELS.mediaAnimationChanged`; handler in `desktop/src/main/ipc/media-animation-handlers.ts`; preload slice; `Media['animation']` bridge type; Gamer's bridge and context carry it (Creator does not host this tab); `test-support/mock-bridge.ts` mock
- [x] Ops never throw across the boundary: the handler returns `{ok:true,…} | {ok:false,error}`
- [x] Tests: vitest for the library (add/dedupe/update/remove, corrupt manifest, path escape, concurrent adds), the schemas (round-trip, defaults, unknown-future-field), the channel parse in `ipc.test.ts`

## B — Bulk import: FBX / GLB / BVH, Mixamo naming and auto-tags (M) ✅ DONE (PR #1118, 2026-11-02)

- [x] `media-model/main/animation/parse-fbx.ts`: binary FBX reader (node records, zlib-compressed arrays) → `{durationSec, frameCount, boneNames[], hasSkin, takeName}`; ASCII FBX and unreadable files import with `durationSec: null` and a warning rather than failing
  - Duration from the `AnimationStack`'s `LocalStart`/`LocalStop` (KTime, 46 186 158 000 ticks/s), else the max `KeyTime` of the `AnimationCurve`s
  - `hasSkin` = a `Deformer` of subclass `Skin` or a `Geometry` node is present (Mixamo's with-skin vs without-skin export)
- [x] `parse-gltf.ts` (`.glb`/`.gltf`: animation channels' sampler input accessor `min`/`max`, node names) and `parse-bvh.ts` (`HIERARCHY` joints, `Frames`, `Frame Time`)
- [x] `mixamo.ts`: `clipNameFromFile` (strip extension, ` (1)`, `_withSkin`, `Without Skin`, `mixamo.com`; Title-case) and `detectMixamo(boneNames)` (`mixamorig`/`mixamorig:` prefix → source `mixamo`, licence `mixamo-eula`)
- [x] `auto-tags.ts`: a keyword table (`locomotion`: walk, run, jog, sprint, strafe, crouch, sneak; `traversal`: jump, climb, fall, vault, roll; `combat`: punch, kick, slash, sword, attack, block, shoot, swing; `reaction`: hit, death, die, stagger; `idle`: idle, breathing, stand; `emote`: dance, wave, taunt, cheer, clap, salute) → tags, de-duplicated and sorted; always adds the format tag only when the user asks for it
- [x] `import-service.ts`: `importPaths(paths[])` walks folders (depth ≤ 4, `.fbx .glb .gltf .bvh` only, no symlink follow), parses, hashes, adds, and reports `{added, duplicate, failed[{path,reason}]}` with progress events; one bad file never aborts the batch
- [x] Ops `importFiles` / `importFolder` (the handler opens the native picker; paths from drag-drop go through `importPaths`)
- [x] Tests: parsers against tiny hand-built fixtures (a generated binary FBX with a compressed array, a minimal GLB, a 3-frame BVH), Mixamo naming table, auto-tag table, import service (folder walk, dedupe, a corrupt file, depth cap, symlink skipped)

## C — Animations page: list, filter, search (M) ✅ DONE (PR #1118, 2026-11-02)

- [x] `'animation'` added to `MEDIA_TABS` (after `sprite`), labelled **Animations**, with every `Record<MediaTab, …>` the compiler flags filled; **not** in `REPO_SCOPED_MEDIA_TABS` (the library is global); `MEDIA_TAB_EXPORT_FORMATS.animation = []`
- [x] `AnimationsTab` (`media-model/renderer/animation/animation-tab.tsx`) as `mediaAnimationTab` in the feature's descriptor and `compose/media-tabs.tsx`; layout keys `mediaAnimationExplorerWidth`/`mediaAnimationDetailWidth`
- [x] `animation-model.ts` (pure): `filterClips({query, tags[], source, sort})` — substring search over name/tags/author/site, AND across selected tags, `sort` by name, newest, duration, size; `tagCounts(clips)`; `sourceCounts(clips)`
- [x] List pane: search box, tag chips with counts, source select, sort select, a row per clip (name, duration, tags, source badge); keyboard: arrows move, Enter selects; empty / loading / error states; "N of M clips"
- [x] Detail pane: name (rename), tags (add/remove), and the manifest fields (source/site, licence, author, original URL as an external link, sha256, file path, size, bone count, skin); delete with a confirm that states the file goes too
- [x] Import bar: **Import files**, **Import folder** and a drop zone with a progress line and a result summary (added / duplicate / failed with reasons)
- [x] Tests: vitest for `animation-model.ts`; RTL for the tab (render, search, tag filter, source filter, sort, select, rename, delete confirm, import summary) over the mock bridge; Playwright e2e `animations-shots.spec.ts` with the mocked bridge (page loads, filter, select) + screenshots under `docs/screenshots/p125-abc/`

## D — Timeline player and retargeted preview (L)

- [ ] Player state (pure, `player-state.ts`): `time`, `playing`, `loop`, `speed` (0.25–2), `in`/`out` range, `fps`; reducers for play/pause, scrub, step ±1 frame, set range; `timeToFrame`/`frameToTime`
- [ ] Timeline UI: ruler with in/out handles, playhead scrub, transport (play/pause, frame step, loop, speed), current time/frame readout, per-bone track lanes with keyframe ticks (lane list virtualised past 60 bones; collapsed to a summary lane)
- [ ] Keys scoped to the focused timeline (Space, ←/→, `[` `]`, `L`); nothing joins `COMMANDS`
- [ ] Clip decode in the renderer (`decode-fbx`/`GLTFLoader`/`BVHLoader` from three, loaded lazily) from a `read` op that returns the file bytes
- [ ] Preview model picker: the user's Models library rigs, default a built-in Mixamo-style mannequin; retarget by bone name (`mixamorig:Hips` ↔ `Hips`/`pelvis`, a synonym table); unmatched bones listed; falls back to the clip's own skeleton
- [ ] Tests: vitest for the player reducers and the retarget map; RTL for the transport; Playwright for scrub/step with real layout

## E — Sketchfab search and download (L)

- [ ] `SECRET_KEYS` gains `media.sketchfabApiToken`; Settings ▸ Media field (write-only, `secretsHas`/`secretsSet`); the token is read only in main
- [ ] `sketchfab.ts` (main): `search({q, licence, cursor})` → `GET https://api.sketchfab.com/v3/search?type=models&animated=true&downloadable=true&q=…&license=…`; `download(uid)` → `GET /v3/models/{uid}/download` (the `Authorization: Token …` header) then the signed glTF/GLB URL; size cap, timeout, abort, the response parsed with zod
- [ ] Search results carry name, author, licence, thumbnail, view URL, and are filtered to licences the user ticks (CC0 / CC-BY / CC-BY-SA / …); the licence and author are stored on the clip, attribution included
- [ ] Network use registered with the privacy egress registry (Phase 115) as an opt-in destination; no token → a "Add your Sketchfab token" state, never a failing request
- [ ] Tests: vitest with an injected `fetch` (search parse, download chain, 401, 403 not-downloadable, 429, cancel, oversize)

## F — External source links (S)

- [ ] `shared/src/media-animation-sources.ts`: a static catalogue (Mixamo, TurboSquid, CGTrader, Quaternius, Poly Pizza, OpenGameArt, ActorCore free, CMU mocap/BVH) with a search-URL template, licence note and "needs an account" flag
- [ ] Search box → "Search on <site>" opens the URL in the **system browser** through the existing external-open path (allow-listed to the catalogue's hosts); nothing is fetched by the app
- [ ] Empty-state and import bar point at the sources ("Downloaded something? Drop it here")
- [ ] Tests: URL builder (encoding), host allow-list, RTL for the source list

## G — Import into a game (M)

- [ ] `asset-bridge.ts` gains the `animation` source: lists library clips and copies one into the game's `assets/animations/<name>.<ext>`, with provenance (source, licence, author, url, sha256) in the asset index
- [ ] "Use in a game" on the detail pane: pick a game, import, show the destination path; the confirm names the licence when it requires attribution
- [ ] Re-import is idempotent by sha256
- [ ] Tests: vitest for the bridge (copy, provenance, idempotence, path jail), RTL for the dialog

## H — Verification

- [ ] The gate (`moon run :typecheck :lint :test`), the `MSTUDIO_SHOTS` screenshots and an e2e over the mocked bridge
- [ ] One human pass in the packaged app: import a real Mixamo folder, play a clip on a rig, search Sketchfab with a real token

## Deferred

- Retargeting through IK or a full humanoid skeleton map (this phase retargets by bone-name synonyms only).
- Clip trimming and baking a cropped clip back to the library (the in/out range is a preview range).
- Mixamo auto-download or any login automation: Mixamo has no public API and the app will not drive its site.

## Not in this phase

- Scraping TurboSquid, CGTrader, Mixamo or any site without an official API.
- An MCP tool surface for the library (a follow-up once the shape settles).
- Editing keyframes.

## Files this phase touches

- `packages/shared/src/media-animation.ts` (+ test), `media-animation-sources.ts`, `media.ts`, `index.ts`, `ipc/{channels,schemas,bridge}.ts`, `domain/secrets.ts`
- `packages/features/media-model/{manifest.ts,main/animation/*,renderer/animation/*}`
- `packages/desktop/src/main/ipc/media-animation-handlers.ts`, `main/index.ts`, `preload/index.ts`
- `packages/modules/creator/main/{bridge,context}.ts`
- `packages/app/src/{compose/media-tabs.tsx,features/media/media-tabs.ts,store/ui-store.ts}`, `test-support/mock-bridge.ts`
- `packages/features/media-game/main/games/asset-bridge.ts` (Theme G)
- `packages/app/e2e/animations-shots.spec.ts`

## Verification

- `moon run :typecheck :lint :test` green; Playwright e2e for the page with the mocked bridge.
- Screenshots: `docs/screenshots/phase-125-animations/`.

## Decisions / open questions

Settled by the user, 2026-11-02:

1. **Placement — a new top-level Media ▸ Animations page** alongside Models, Sprites and the rest, separate from the Models page's rig and animation tabs.
2. **Preview — clips play on a chosen rigged model** from the user's library (default a Mixamo-style mannequin), retargeted automatically by bone name (`mixamorig…` ↔ humanoid names), falling back to the clip's own skeleton.
3. **Storage — a global library under the user's app-data directory**, shared across repos, with a manifest of clips: name, tags, duration, source/site, licence, author, original URL, sha256, file path. A game imports from it into its own `assets/` through the existing asset-import path.
4. **Online sources — Sketchfab via its official Data API v3** (search filtered to animated + downloadable + licence; download with the user's Sketchfab API token stored with the app's existing secret mechanism). TurboSquid, CGTrader, Mixamo and other free sources (Quaternius, Poly Pizza, OpenGameArt, ActorCore free, CMU mocap/BVH) are search links that open in the system browser, then import by drag-drop or folder pick. **No scraping.**
5. **Mixamo — bulk folder import** of downloaded Mixamo FBX files (with and without skin); clips named from file names and auto-tagged. GLB/glTF and BVH are also accepted.

Made by the planning agent (conventional options, 2026-11-02):

6. **The code lives in `packages/features/media-model/`, not a new feature package.** Options: a sub-folder of `media-model` `[recommended · S]` · a new `media-animation` feature `[future-proof · L]`. Picked the sub-folder: the SFX tab (#1110) shipped the same way, the package already owns rigs and clips, and a new package adds moon/CI/lockfile plumbing without a boundary to protect.
7. **One channel with an `op` union** (`mediaAnimation`), as `mediaSfx` does, rather than a channel per op. Keeps the manifest/preload/bridge change small.
8. **The tab is not repo-scoped** (it is not in `REPO_SCOPED_MEDIA_TABS`), like `library`: the store is global, so it works with no repo open.
9. **Content-addressed files, manifest as the index.** Files are `clips/<sha256-prefix>-<slug>.<ext>`; a re-import of the same bytes is a dedupe, not a second copy.
10. **The parsers are hand-written and read-only** (binary FBX, GLB/glTF JSON, BVH text), so no new dependency lands for metadata. Decoding for playback in Theme D uses three's own loaders, already a dependency of the Models editor.
11. **Licence is a string id with a small known set** (`cc0`, `cc-by`, `cc-by-sa`, `cc-by-nc`, `mixamo-eula`, `custom`, `unknown`); an import with no known licence is `unknown`, never silently permissive.
12. **First slice is A + B + C** (store, import, page with list/filter); D (timeline) is the next PR.
