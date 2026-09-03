/**
 * The onboarding kit's plan/apply engine (Phase 49 Themes B/C).
 *
 * ## The rules
 *
 * 1. **Plan reads, apply writes — and nothing else does either.** `planScaffold`
 *    touches no file it does not already need to hash; `applyScaffold` writes
 *    only the exact paths it is given, never a wider "everything the plan
 *    said needed writing".
 * 2. **A `locally-edited` entry is never written**, and there is no override.
 *    The Setup dialog excludes it from what gets sent to `apply`, visibly.
 * 3. **A `.midnite/` with no manifest classifies wholesale as `locally-edited`**,
 *    even a file that happens to byte-match the current template. Absence of
 *    provenance is not permission — see `classify.ts`.
 * 4. **Apply re-checks every hash immediately before writing.** The plan the
 *    user approved may be seconds old; a target that changed underneath it is
 *    skipped and reported, never overwritten, and never aborts the rest of
 *    the batch.
 * 5. **Every write goes through `fs-scope-write.ts`'s confinement** against the
 *    target repo root — `write-file.ts` is the one call site, shared by the
 *    entry-copy loop and the manifest writer. No second confinement primitive.
 * 6. **The manifest is written last**, once, after every entry has had its
 *    turn — a crash mid-apply leaves a target whose next plan reads the truth
 *    off disk rather than off a manifest that over-claims.
 *
 * ## The pieces
 *
 * - `walk.ts` — every file under the (trusted) template tree
 * - `hash.ts` — sha256 + size, `null`/`0` rather than throwing on a missing file
 * - `manifest.ts` — read/write `.midnite/settings.json`'s `template` field
 * - `version.ts` — the template kit's own version marker, never itself scaffolded
 * - `classify.ts` — one entry's status, against one target repo
 * - `write-file.ts` — the one confined write, shared by apply and the manifest
 * - `plan.ts` / `apply.ts` — the two operations the IPC handlers call
 */

export { planScaffold } from './plan';
export { applyScaffold } from './apply';
export { readManifest, writeManifest, MANIFEST_REL_PATH } from './manifest';
