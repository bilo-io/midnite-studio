import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { featureToggle, type FeatureToggleId } from '@midnite/studio-shared';

/**
 * A switched-off feature's on-disk data (Phase 135 Theme F) — what Settings ▸ Features' "Delete this feature's
 * data" shows and removes. The list is the toggle's own `data.files` (userData-relative); this module only
 * measures and removes them, and never reaches outside userData. No electron, so it is tested under bare vitest.
 */

export type FeatureDataFile = { path: string; bytes: number };

/** The absolute path of a declared file, or null when it would escape userData. */
function within(userData: string, rel: string): string | null {
  const abs = resolve(userData, rel);
  const back = relative(userData, abs);
  return back === '' || back.startsWith('..') || isAbsolute(back) ? null : abs;
}

async function sizeOf(path: string): Promise<number | null> {
  let info;
  try {
    info = await lstat(path);
  } catch {
    return null;
  }
  if (!info.isDirectory()) return info.size;
  let total = 0;
  for (const entry of await readdir(path).catch(() => [] as string[])) total += (await sizeOf(join(path, entry))) ?? 0;
  return total;
}

/** The feature's declared files that exist now, with their sizes (a folder counts everything inside it). */
export async function describeFeatureData(userData: string, feature: FeatureToggleId): Promise<FeatureDataFile[]> {
  const out: FeatureDataFile[] = [];
  for (const rel of featureToggle(feature).data.files) {
    const abs = within(userData, rel);
    if (abs === null) continue;
    const bytes = await sizeOf(abs);
    if (bytes !== null) out.push({ path: rel, bytes });
  }
  return out;
}

export type DeleteFeatureDataResult =
  | { ok: true; removedFiles: number; removedBytes: number }
  | { ok: false; kind: 'error'; message: string };

/**
 * Move the feature's files to the Trash. Refused while the feature is on: a running feature would write them
 * straight back, or hold them open.
 */
export async function deleteFeatureData(opts: {
  userData: string;
  feature: FeatureToggleId;
  isOn: boolean;
  trash: (absPath: string) => Promise<void>;
}): Promise<DeleteFeatureDataResult> {
  const { label } = featureToggle(opts.feature);
  if (opts.isOn) return { ok: false, kind: 'error', message: `Switch ${label} off before deleting its data.` };
  const files = await describeFeatureData(opts.userData, opts.feature);
  let removedFiles = 0;
  let removedBytes = 0;
  for (const file of files) {
    const abs = within(opts.userData, file.path);
    if (abs === null) continue;
    try {
      await opts.trash(abs);
    } catch (err) {
      return {
        ok: false,
        kind: 'error',
        message: `Moved ${removedFiles} of ${files.length} to the Trash; ${file.path} failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    removedFiles += 1;
    removedBytes += file.bytes;
  }
  return { ok: true, removedFiles, removedBytes };
}
