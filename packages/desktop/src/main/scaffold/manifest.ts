import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ScaffoldManifestSchema, type ScaffoldManifest } from '@midnite/studio-shared';

import { writeConfinedFile } from './write-file';

/** Relative to a target repo's root — the same file Theme A's template seeds
 *  with `{ "version": 1 }` and nothing else, until Setup extends it. */
export const MANIFEST_REL_PATH = '.midnite/settings.json';

/**
 * `null` covers every "no manifest" case alike: the file is missing, it is
 * not JSON, or it parses but predates the `template` field this phase adds
 * (Theme A's own seed, or a hand-made `.midnite/`). `plan.ts` treats all
 * three the same way the doc does — absence of provenance is not permission.
 */
export async function readManifest(targetRoot: string): Promise<ScaffoldManifest | null> {
  try {
    const raw = await readFile(join(targetRoot, MANIFEST_REL_PATH), 'utf8');
    const parsed = ScaffoldManifestSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Written LAST by `apply.ts`, after every file it describes — a crash
 * mid-apply then leaves a target whose next plan reads the truth off disk
 * rather than off a manifest that over-claims. Returns `false` on the same
 * confinement failures a template entry's own write can hit.
 */
export async function writeManifest(targetRoot: string, manifest: ScaffoldManifest): Promise<boolean> {
  const data = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return writeConfinedFile(targetRoot, MANIFEST_REL_PATH, data);
}
