import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ScaffoldApplyResult, ScaffoldManifest } from '@midnite/studio-shared';

import { joinWithin } from '../fs-scope';
import { sha256File } from './hash';
import { readManifest, writeManifest } from './manifest';
import { TEMPLATE_VERSION_FILE, readTemplateVersion } from './version';
import { writeConfinedFile } from './write-file';

/**
 * Write exactly the requested paths, re-checking each one immediately before
 * writing rather than trusting the plan the renderer approved a few seconds
 * ago. A path whose target changed underneath that plan is skipped and
 * reported, never overwritten and never aborting the rest of the batch — see
 * `ScaffoldApplyResult`'s own doc comment.
 *
 * The manifest is written LAST, once, after every entry has had its chance —
 * a crash mid-loop then leaves a target whose next plan reads the truth off
 * disk rather than off a manifest that over-claims what got written.
 */
export async function applyScaffold(
  templateRoot: string,
  targetRoot: string,
  requestedPaths: string[],
): Promise<ScaffoldApplyResult> {
  const [manifest, templateVersion] = await Promise.all([
    readManifest(targetRoot),
    readTemplateVersion(templateRoot),
  ]);

  const written: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const nextFiles: Record<string, string> = { ...(manifest?.template.files ?? {}) };

  for (const relPath of requestedPaths) {
    if (relPath === TEMPLATE_VERSION_FILE) {
      skipped.push({ path: relPath, reason: 'not a scaffold entry' });
      continue;
    }

    // `requestedPaths` is renderer-supplied and zod only checks "non-empty
    // string", not "safe relative path" — confirm it resolves inside BOTH
    // roots before it drives any `join()`/`sha256File()` read below. Without
    // this, a `../`-laden entry could get its hash read (and existence
    // leaked back via `written`/`skipped`) from outside the target or
    // template tree entirely, even though the eventual WRITE is already
    // confined by `writeConfinedFile`. Same check `plan.ts` runs before it
    // will classify an entry at all.
    if (joinWithin(targetRoot, relPath) === null || joinWithin(templateRoot, relPath) === null) {
      skipped.push({ path: relPath, reason: 'resolves outside the target repository' });
      continue;
    }

    const templateFilePath = join(templateRoot, ...relPath.split('/'));
    const targetFilePath = join(targetRoot, ...relPath.split('/'));
    const [templateHash, targetHash] = await Promise.all([
      sha256File(templateFilePath),
      sha256File(targetFilePath),
    ]);

    if (templateHash === null) {
      skipped.push({ path: relPath, reason: 'no longer part of the template' });
      continue;
    }
    if (targetHash === templateHash) {
      // Already exactly what would be written. Not a failure — count it
      // written, so the result reads as "this repo now has it" either way.
      written.push(relPath);
      nextFiles[relPath] = templateHash;
      continue;
    }

    // Safe to write only when the target is genuinely absent, or its hash
    // still matches what the manifest says WE wrote last time (the
    // stale-upgrade case this path was approved for). Anything else means
    // the target changed between the plan being read and Apply being
    // pressed — by the user, or by something else — and this is the race
    // the doc calls out by name.
    const manifestHash = manifest?.template.files[relPath];
    const safeToWrite =
      targetHash === null || (manifestHash !== undefined && manifestHash === targetHash);
    if (!safeToWrite) {
      skipped.push({ path: relPath, reason: 'changed on disk since the plan was read' });
      continue;
    }

    const data = await readFile(templateFilePath);
    if (!(await writeConfinedFile(targetRoot, relPath, data))) {
      skipped.push({ path: relPath, reason: 'could not write that path' });
      continue;
    }
    written.push(relPath);
    nextFiles[relPath] = templateHash;
  }

  const nextManifest: ScaffoldManifest = {
    version: 1,
    template: { version: templateVersion, files: nextFiles },
  };
  if (!(await writeManifest(targetRoot, nextManifest))) {
    skipped.push({ path: '.midnite/settings.json', reason: 'could not write the manifest' });
  }

  return { written, skipped };
}

