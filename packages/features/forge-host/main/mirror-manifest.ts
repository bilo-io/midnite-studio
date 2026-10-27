import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { writePrivateFile } from '@midnite/studio-runtime';
import { z } from 'zod';

/** The manifest beside a mirror's metadata (`<repo>.meta/manifest.json`). */
export const MirrorManifestSchema = z.object({
  fetchedAt: z.string(),
  /** Every ref in the bare repo at fetch time, name to object id. */
  headRefs: z.record(z.string()),
  /** SHA-256 of each metadata file, by file name. */
  files: z.record(z.string()),
  adapter: z.string(),
  account: z.string(),
});
export type MirrorManifest = z.infer<typeof MirrorManifestSchema>;

export const MANIFEST_FILE = 'manifest.json';

export const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');

/** Hash every metadata file in `metaDir` (everything but the manifest itself). */
export async function hashMetaFiles(metaDir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let names: string[] = [];
  try {
    names = await readdir(metaDir);
  } catch {
    return out;
  }
  for (const name of names.sort()) {
    if (name === MANIFEST_FILE || name.endsWith('.tmp')) continue;
    out[name] = sha256(await readFile(join(metaDir, name)));
  }
  return out;
}

export async function readManifest(metaDir: string): Promise<MirrorManifest | null> {
  try {
    return MirrorManifestSchema.parse(JSON.parse(await readFile(join(metaDir, MANIFEST_FILE), 'utf8')));
  } catch {
    return null;
  }
}

export async function writeManifest(metaDir: string, manifest: MirrorManifest): Promise<void> {
  await writePrivateFile(join(metaDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
}

export type ManifestCheck = { ok: true } | { ok: false; problems: string[] };

/** Recompute every file's SHA-256 and compare it to the manifest's: edited, missing and unlisted files all count. */
export async function verifyManifest(metaDir: string, manifest: MirrorManifest): Promise<ManifestCheck> {
  const actual = await hashMetaFiles(metaDir);
  const problems: string[] = [];
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (!(name in actual)) problems.push(`${name}: missing`);
    else if (actual[name] !== hash) problems.push(`${name}: checksum mismatch`);
  }
  for (const name of Object.keys(actual)) if (!(name in manifest.files)) problems.push(`${name}: not in manifest`);
  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
