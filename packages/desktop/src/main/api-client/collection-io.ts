import { lstat, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  apiFailure,
  apiOk,
  PostmanCollectionSchema,
  PostmanEnvironmentSchema,
  type ApiCollectionSummary,
  type ApiOpResult,
  type PostmanCollection,
} from '@midnite/studio-shared';

import {
  confineParent,
  confineTree,
  createFile,
  describeFsError,
  ensureConfinedDirs,
  openForOverwrite,
} from '../fs-scope-write';

/**
 * Collection import/export and the on-disk `.midnite/api/collections/` store
 * (Phase 66 Theme G).
 *
 * Every function here takes an already-resolved `repoRoot` (the caller —
 * `api-client-handlers.ts` — resolves `repoId` through the repo registry
 * exactly as `repo-handlers.ts` does; this module never touches `electron` or
 * the repo registry itself, so it stays testable under bare vitest).
 *
 * The one rule every function here is built around: **never re-serialise a
 * zod-parsed value**. `PostmanCollectionSchema` is `.passthrough()`, and zod
 * 3.25.76 reorders a passthrough object's keys on parse — declared-shape keys
 * first, then passthrough keys in their original relative order (verified
 * directly: `{z,a,b,y}` through `z.object({b,a}).passthrough()` comes back
 * `{b,a,z,y}`). `safeParse` is used here only to *validate* — every write
 * serialises the raw `JSON.parse`'d value the schema validated, never
 * `result.data`. That is what keeps a one-header edit a one-hunk diff instead
 * of a whole-file key shuffle.
 */

const COLLECTIONS_DIR = '.midnite/api/collections';
const README_REL = '.midnite/api/README.md';

const README_TEXT = `# .midnite/api/

Postman-compatible API collections for this repository, written and read by
Midnite Studio's API Client. Safe to commit — collections carry no secrets of
their own (bearer tokens and other credentials live in an environment file,
which this app does not write here). This file was generated automatically on
first import; it is safe to edit or delete.
`;

async function existsAtAll(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/** `info.name`, lowercased and reduced to `[a-z0-9-]`, never empty. */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'collection';
}

function fileNameFor(slug: string): string {
  return `${slug}.postman_collection.json`;
}

/** `<slug>`, then `<slug>-2`, `<slug>-3`, … — the first name nothing already
 *  occupies in `collectionsDirAbs`. A collision never overwrites: the caller
 *  still creates with `O_CREAT|O_EXCL`, this only picks a friendly starting
 *  point rather than racing on the check itself. */
async function uniqueFileName(collectionsDirAbs: string, baseSlug: string): Promise<string> {
  let candidate = fileNameFor(baseSlug);
  let n = 2;
  while (await existsAtAll(join(collectionsDirAbs, candidate))) {
    candidate = fileNameFor(`${baseSlug}-${n}`);
    n += 1;
  }
  return candidate;
}

/** Serialise exactly the way every write in this module must: 2-space indent
 *  plus a trailing newline, from the raw value handed in — never a schema's
 *  `.parse()` result. */
function serialise(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeReadmeIfMissing(repoRoot: string): Promise<void> {
  const target = await confineParent(repoRoot, README_REL);
  if (!target) return; // best-effort; a missing repo root fails loudly elsewhere
  const handle = await createFile(target);
  if (!handle) return; // already there (or something else occupies the name) — leave it
  try {
    await handle.writeFile(README_TEXT, 'utf8');
  } finally {
    await handle.close();
  }
}

/** One of the three collection-shaped parse outcomes an imported file can be. */
type ParsedImport =
  | { kind: 'collection'; value: PostmanCollection }
  | { kind: 'environment' }
  | { kind: 'invalid-json' }
  | { kind: 'not-a-collection' };

function parseImportedFile(raw: string): ParsedImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'invalid-json' };
  }

  const asCollection = PostmanCollectionSchema.safeParse(parsed);
  if (asCollection.success) {
    // The raw, un-reshaped value — not `asCollection.data` — is what gets
    // written to disk. `info.schema` is deliberately never checked against a
    // known-version list: an unrecognised version is imported anyway, and
    // `.passthrough()` is what makes that safe.
    return { kind: 'collection', value: parsed as PostmanCollection };
  }

  const asEnvironment = PostmanEnvironmentSchema.safeParse(parsed);
  if (asEnvironment.success) return { kind: 'environment' };

  return { kind: 'not-a-collection' };
}

/**
 * Import a Postman collection already sitting at `sourcePath` on disk (the
 * native file picker itself — `dialog.showOpenDialog` — is the handler's job;
 * this only ever reads a path it is given) into
 * `<repoRoot>/.midnite/api/collections/<slug>.postman_collection.json`,
 * de-duplicating the slug and writing `.midnite/api/README.md` on first use.
 */
export async function importCollection(
  repoRoot: string,
  sourcePath: string,
): Promise<ApiOpResult<ApiCollectionSummary>> {
  let raw: string;
  try {
    raw = await readFile(sourcePath, 'utf8');
  } catch (error) {
    return apiFailure(describeFsError(error));
  }

  const parsed = parseImportedFile(raw);
  switch (parsed.kind) {
    case 'invalid-json':
      return apiFailure('That file is not valid JSON.');
    case 'environment':
      return apiFailure(
        'That looks like a Postman environment, not a collection — environment support is coming in a later release.',
      );
    case 'not-a-collection':
      return apiFailure('That file is not a Postman v2.1 collection.');
    case 'collection':
      break;
  }

  const collection = parsed.value;
  const baseSlug = slugify(collection.info.name);
  const collectionsDirAbs = join(repoRoot, ...COLLECTIONS_DIR.split('/'));
  const fileName = await uniqueFileName(collectionsDirAbs, baseSlug);
  const rel = `${COLLECTIONS_DIR}/${fileName}`;

  if (!(await ensureConfinedDirs(repoRoot, rel))) {
    return apiFailure('Could not create .midnite/api/collections in the open repository.');
  }

  const target = await confineParent(repoRoot, rel);
  if (!target) return apiFailure('That path is not inside the open repository.');

  const handle = await createFile(target);
  if (!handle) return apiFailure('A collection with that name already exists.');
  try {
    await handle.writeFile(serialise(collection), 'utf8');
  } finally {
    await handle.close();
  }

  await writeReadmeIfMissing(repoRoot);

  return apiOk<ApiCollectionSummary>({ id: fileName, fileName, collection });
}

/**
 * Every collection under `.midnite/api/collections/` in `repoRoot`.
 * `confineTree` runs before anything is read, so a `.midnite/api` symlinked
 * out of the repo is refused rather than followed; a directory that simply
 * does not exist yet (nothing imported) is `{ok:true, value:[]}`, not an
 * error — the empty state is normal, not exceptional.
 */
export async function listCollections(repoRoot: string): Promise<ApiOpResult<ApiCollectionSummary[]>> {
  const dirAbs = join(repoRoot, ...COLLECTIONS_DIR.split('/'));
  if (!(await existsAtAll(dirAbs))) return apiOk<ApiCollectionSummary[]>([]);

  const confinedDir = await confineTree(repoRoot, dirAbs);
  if (!confinedDir) return apiFailure('.midnite/api/collections is not inside the open repository.');

  let fileNames: string[];
  try {
    fileNames = await readdir(confinedDir);
  } catch (error) {
    return apiFailure(describeFsError(error));
  }

  const summaries: ApiCollectionSummary[] = [];
  for (const fileName of fileNames.filter((name) => name.endsWith('.postman_collection.json')).sort()) {
    const result = await readCollection(repoRoot, fileName);
    if (result.ok) summaries.push({ id: fileName, fileName, collection: result.value });
  }
  return apiOk(summaries);
}

/**
 * One collection by id (its file name — `apiListCollections`/
 * `apiImportCollection` are the only source of a `collectionId`, and both
 * hand back the file name itself). `confineTree` refuses a symlink pointed
 * outside `repoRoot` rather than following it.
 */
export async function readCollection(
  repoRoot: string,
  collectionId: string,
): Promise<ApiOpResult<PostmanCollection>> {
  if (collectionId.length === 0 || collectionId.includes('/') || collectionId.includes('\0')) {
    return apiFailure('That collection no longer exists.');
  }

  const fileAbs = join(repoRoot, ...COLLECTIONS_DIR.split('/'), collectionId);
  if (!(await existsAtAll(fileAbs))) return apiFailure('That collection no longer exists.');

  const confined = await confineTree(repoRoot, fileAbs);
  if (!confined) return apiFailure('That collection is not inside the open repository.');

  let raw: string;
  try {
    raw = await readFile(confined, 'utf8');
  } catch (error) {
    return apiFailure(describeFsError(error));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return apiFailure('That file is not valid JSON.');
  }

  const result = PostmanCollectionSchema.safeParse(parsed);
  if (!result.success) return apiFailure('That file is not a Postman v2.1 collection.');

  // The raw parsed value, never `result.data` — see the module header.
  return apiOk(parsed as PostmanCollection);
}

/**
 * Overwrite an existing collection file with `collection`, serialised with
 * 2-space indent, a trailing newline, and **the key order `collection`
 * already carries** — never a schema's `.parse()` output. `openForOverwrite`
 * (`O_NOFOLLOW`) means a symlink planted at the target between confinement
 * and this call is refused rather than followed.
 */
export async function saveCollection(
  repoRoot: string,
  collectionId: string,
  collection: unknown,
): Promise<ApiOpResult> {
  if (collectionId.length === 0 || collectionId.includes('/') || collectionId.includes('\0')) {
    return apiFailure('That collection no longer exists.');
  }

  const validated = PostmanCollectionSchema.safeParse(collection);
  if (!validated.success) return apiFailure('That is not a valid Postman v2.1 collection.');

  const rel = `${COLLECTIONS_DIR}/${collectionId}`;
  const target = await confineParent(repoRoot, rel);
  if (!target) return apiFailure('That path is not inside the open repository.');

  const handle = await openForOverwrite(target);
  if (!handle) return apiFailure('That collection no longer exists.');
  try {
    await handle.truncate(0);
    // The raw, caller-supplied value — not `validated.data` — is what gets
    // written; see the module header on why that matters for the round trip.
    // Truncating first, then writing from this freshly-opened handle's
    // position-0 descriptor, is what keeps a shorter overwrite from leaving
    // trailing bytes of the old, longer file behind.
    await handle.writeFile(serialise(collection), 'utf8');
  } finally {
    await handle.close();
  }
  return apiOk();
}

/** Remove a collection file from `.midnite/api/collections/`. */
export async function deleteCollection(repoRoot: string, collectionId: string): Promise<ApiOpResult> {
  if (collectionId.length === 0 || collectionId.includes('/') || collectionId.includes('\0')) {
    return apiFailure('That collection no longer exists.');
  }

  const fileAbs = join(repoRoot, ...COLLECTIONS_DIR.split('/'), collectionId);
  const confined = await confineTree(repoRoot, fileAbs);
  if (!confined) return apiFailure('That collection no longer exists.');

  try {
    await unlink(confined);
  } catch (error) {
    return apiFailure(describeFsError(error));
  }
  return apiOk();
}

/**
 * Export a collection to an arbitrary, user-chosen destination (the native
 * save dialog itself is the handler's job — `dialog.showSaveDialog` — this
 * only ever writes to a path it is given). Deliberately **not** routed
 * through `fs-scope-write`'s repo jail: the destination is wherever the user
 * picked, which by construction is not confined to the open repository — the
 * same trust boundary `capture.ts`'s screenshot "Save as…" already writes
 * through with a plain `writeFile`. The bytes are byte-for-byte what
 * `saveCollection` would have written: one serialiser, two destinations.
 */
export async function exportCollection(
  repoRoot: string,
  collectionId: string,
  destPath: string,
): Promise<ApiOpResult> {
  const read = await readCollection(repoRoot, collectionId);
  if (!read.ok) return read;

  try {
    await writeFile(destPath, serialise(read.value), 'utf8');
  } catch (error) {
    return apiFailure(describeFsError(error));
  }
  return apiOk();
}
