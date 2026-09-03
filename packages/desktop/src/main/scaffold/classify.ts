import { join } from 'node:path';

import type { ScaffoldEntry, ScaffoldManifest } from '@midnite/studio-shared';

import { fileSize, sha256File } from './hash';

/**
 * Where one template file stands against a target repo — `ScaffoldStatus`'s
 * own doc comment states the four outcomes; this is the algorithm that
 * produces them.
 *
 * `manifest === null` covers every "no manifest" case alike (missing, not
 * JSON, or predating this phase's `template` field) — see `manifest.ts`. A
 * `.midnite/` file with no manifest at all classifies `locally-edited`
 * **wholesale**, even one that happens to byte-match the current template:
 * absence of provenance is not permission, and a coincidental match proves
 * nothing about how it got there.
 */
export async function classifyEntry(
  templateRoot: string,
  targetRoot: string,
  relPath: string,
  manifest: ScaffoldManifest | null,
): Promise<ScaffoldEntry> {
  const segments = relPath.split('/');
  const templatePath = join(templateRoot, ...segments);
  const targetPath = join(targetRoot, ...segments);

  const [templateHash, targetHash, bytes] = await Promise.all([
    sha256File(templatePath),
    sha256File(targetPath),
    fileSize(templatePath),
  ]);

  if (targetHash === null) {
    return { path: relPath, status: 'create', bytes };
  }

  if (manifest === null && relPath.startsWith('.midnite/')) {
    return { path: relPath, status: 'locally-edited', bytes };
  }

  if (targetHash === templateHash) {
    return { path: relPath, status: 'unchanged', bytes };
  }

  const manifestHash = manifest?.template.files[relPath];
  if (manifestHash !== undefined && manifestHash === targetHash) {
    return { path: relPath, status: 'stale', bytes };
  }

  return { path: relPath, status: 'locally-edited', bytes };
}
