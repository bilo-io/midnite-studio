import { lstat, readdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import {
  apiFailure,
  apiOk,
  PostmanEnvironmentSchema,
  type ApiEnvironmentSummary,
  type ApiOpResult,
  type PostmanEnvironment,
  type PostmanEnvironmentValue,
  type SaveEnvironmentOutcome,
} from '@midnite/studio-shared';

import {
  confineParent,
  confineTree,
  createFile,
  describeFsError,
  ensureConfinedDirs,
  openForOverwrite,
  targetPath,
} from '../fs-scope-write';

/**
 * Environments and the secret overlay (Phase 70 Theme A).
 *
 * One environment per file at `.midnite/api/environments/<slug>.postman_
 * environment.json`, beside Phase 66 Theme G's `collections/` — same repo,
 * same confinement helpers, same "never re-serialise a zod-parsed value"
 * rule `collection-io.ts`'s header documents (every write here serialises
 * the raw `JSON.parse`'d/caller-supplied value, never a schema's `.parse()`
 * output).
 *
 * **The secret split is the whole point of this file.** A row with
 * `type: 'secret'` never has its value written into the committed base
 * file: `saveEnvironment` splits it into a sibling, gitignored
 * `<slug>.local.json` overlay (a flat `Record<string, string>` keyed by the
 * variable's `key`), and the base file keeps the row itself — `value: ''`,
 * `type: 'secret'` intact — so a teammate who pulls the repo sees which
 * secrets a collection needs and gets an empty field to fill, rather than a
 * request that fails on an unresolved variable with no hint. `readEnvironment`
 * merges the overlay back over the base at read time, per key; the editor
 * never sees the split, only a whole merged environment.
 *
 * **`.midnite/api/.gitignore` is written into the open repository**, not
 * this one — Phase 66's root `.gitignore` entry protects only this
 * repository's own fixtures, and a user's secrets live in *their* repo.
 * `ensureApiGitignore` writes it once, on the first save that actually
 * writes a secret; `isGitignoreProtected` is the read-only half `saveEnvironment`
 * calls first to decide whether that save needs to block on a confirm.
 */

const ENVIRONMENTS_DIR = '.midnite/api/environments';
const GITIGNORE_REL = '.midnite/api/.gitignore';
const GITIGNORE_PATTERN = '*.local.json';
const GITIGNORE_TEXT = `# Written by Midnite Studio — API environment secret overlays never travel with this repository.\n${GITIGNORE_PATTERN}\n`;

async function existsAtAll(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/** `environment.name`, lowercased and reduced to `[a-z0-9-]`, never empty. */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'environment';
}

function fileNameFor(slug: string): string {
  return `${slug}.postman_environment.json`;
}

function overlayFileNameFor(slug: string): string {
  return `${slug}.local.json`;
}

function slugFromFileName(fileName: string): string {
  return fileName.replace(/\.postman_environment\.json$/, '');
}

/** `<slug>`, then `<slug>-2`, `<slug>-3`, … — mirrors `collection-io.ts`'s
 *  `uniqueFileName` exactly. */
async function uniqueFileName(environmentsDirAbs: string, baseSlug: string): Promise<string> {
  let candidate = fileNameFor(baseSlug);
  let n = 2;
  while (await existsAtAll(join(environmentsDirAbs, candidate))) {
    candidate = fileNameFor(`${baseSlug}-${n}`);
    n += 1;
  }
  return candidate;
}

/** Serialise exactly the way every write in this module must: 2-space indent
 *  plus a trailing newline, from the raw value handed in — never a schema's
 *  `.parse()` result. See the module header. */
function serialise(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isValidId(id: string): boolean {
  return id.length > 0 && !id.includes('/') && !id.includes('\0');
}

/** The overlay's flat `Record<string, string>`, or `{}` if it does not exist
 *  yet (a brand-new environment, or one with no secret rows saved so far) —
 *  never an error, since a missing overlay is the normal starting state. */
async function readOverlay(repoRoot: string, slug: string): Promise<Record<string, string>> {
  const rel = `${ENVIRONMENTS_DIR}/${overlayFileNameFor(slug)}`;
  const fileAbs = join(repoRoot, ...rel.split('/'));
  const confined = await confineTree(repoRoot, fileAbs);
  if (!confined) return {};
  try {
    const raw = await readFile(confined, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') out[key] = value;
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

/** Overwrite (or create) the overlay file with exactly `overlay`'s keys. An
 *  empty overlay still gets an (empty-object) file written — simpler than a
 *  third on-disk state ("overlay never existed" vs "overlay is now empty"),
 *  and both read the same way through `readOverlay`. */
async function writeOverlay(
  repoRoot: string,
  slug: string,
  overlay: Readonly<Record<string, string>>,
): Promise<boolean> {
  const rel = `${ENVIRONMENTS_DIR}/${overlayFileNameFor(slug)}`;
  if (!(await ensureConfinedDirs(repoRoot, rel))) return false;
  const target = await confineParent(repoRoot, rel);
  if (!target) return false;

  const existing = await createFile(target);
  if (existing) {
    try {
      await existing.writeFile(serialise(overlay), 'utf8');
    } finally {
      await existing.close();
    }
    return true;
  }

  const handle = await openForOverwrite(target);
  if (!handle) return false;
  try {
    await handle.truncate(0);
    await handle.writeFile(serialise(overlay), 'utf8');
  } finally {
    await handle.close();
  }
  return true;
}

/**
 * Merge an environment's on-disk overlay over its base rows, per key — the
 * shape every reader (`readEnvironment`, `listEnvironments`, `sendApiRequest`
 * once it loads one) actually wants: a whole environment, split invisibly.
 * A row with no overlay entry keeps its base value (empty for an unfilled
 * secret, whatever a `default` row already carries).
 */
function mergeOverlay(
  environment: PostmanEnvironment,
  overlay: Readonly<Record<string, string>>,
): PostmanEnvironment {
  return {
    ...environment,
    values: environment.values.map((row) =>
      // Only a still-`secret` row is ever eligible for the overlay's value —
      // a row a later edit flipped back to `default` reads its own base
      // value, not a stale overlay entry saveEnvironment has not cleaned up.
      row.type === 'secret' && Object.prototype.hasOwnProperty.call(overlay, row.key)
        ? { ...row, value: overlay[row.key] }
        : row,
    ),
  };
}

/** Whether `.midnite/api/.gitignore` exists and already carries the pattern
 *  that keeps a `*.local.json` overlay out of every commit. `confineTree`
 *  folds "does not exist" and "exists outside the repo" into the same
 *  `false` — both mean this save cannot yet prove the repo is protected. */
async function isGitignoreProtected(repoRoot: string): Promise<boolean> {
  const fileAbs = join(repoRoot, ...GITIGNORE_REL.split('/'));
  const confined = await confineTree(repoRoot, fileAbs);
  if (!confined) return false;
  try {
    const content = await readFile(confined, 'utf8');
    return content.includes(GITIGNORE_PATTERN);
  } catch {
    return false;
  }
}

/**
 * Write `.midnite/api/.gitignore` into the *open repository* if it is
 * missing the `*.local.json` pattern — creating the file outright with
 * `createFile` (`O_CREAT|O_EXCL`) when nothing is there, or appending the
 * pattern to whatever already exists (through `openForOverwrite`,
 * `O_NOFOLLOW`) when it is. A no-op — not an error — when the pattern is
 * already present or the directory cannot be confined; a gitignore is a
 * best-effort courtesy, never something a save should fail over.
 */
export async function ensureApiGitignore(repoRoot: string): Promise<void> {
  if (!(await ensureConfinedDirs(repoRoot, GITIGNORE_REL))) return;
  const target = await confineParent(repoRoot, GITIGNORE_REL);
  if (!target) return;

  const handle = await createFile(target);
  if (handle) {
    try {
      await handle.writeFile(GITIGNORE_TEXT, 'utf8');
    } finally {
      await handle.close();
    }
    return;
  }

  // Already exists — read it through `confineTree` (never re-trust the
  // unresolved `target` for a read) and leave it alone if the pattern is
  // already there.
  const confined = await confineTree(repoRoot, targetPath(target));
  if (!confined) return;
  let existing: string;
  try {
    existing = await readFile(confined, 'utf8');
  } catch {
    return;
  }
  if (existing.includes(GITIGNORE_PATTERN)) return;

  const overwriteHandle = await openForOverwrite(target);
  if (!overwriteHandle) return;
  try {
    const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    const appended = `${existing}${separator}${GITIGNORE_TEXT}`;
    await overwriteHandle.truncate(0);
    await overwriteHandle.writeFile(appended, 'utf8');
  } finally {
    await overwriteHandle.close();
  }
}

/**
 * Every environment under `.midnite/api/environments/` in `repoRoot`, merged
 * with its overlay. `confineTree` runs before anything is read, so a
 * `.midnite/api` symlinked out of the repo is refused; a directory that does
 * not exist yet is `{ok:true, value:[]}`, not an error.
 */
export async function listEnvironments(repoRoot: string): Promise<ApiOpResult<ApiEnvironmentSummary[]>> {
  const dirAbs = join(repoRoot, ...ENVIRONMENTS_DIR.split('/'));
  if (!(await existsAtAll(dirAbs))) return apiOk<ApiEnvironmentSummary[]>([]);

  const confinedDir = await confineTree(repoRoot, dirAbs);
  if (!confinedDir) return apiFailure('.midnite/api/environments is not inside the open repository.');

  let fileNames: string[];
  try {
    fileNames = await readdir(confinedDir);
  } catch (error) {
    return apiFailure(describeFsError(error));
  }

  const summaries: ApiEnvironmentSummary[] = [];
  for (const fileName of fileNames.filter((name) => name.endsWith('.postman_environment.json')).sort()) {
    const result = await readEnvironment(repoRoot, fileName);
    if (result.ok) summaries.push({ id: fileName, fileName, environment: result.value });
  }
  return apiOk(summaries);
}

/**
 * One environment by id (its file name), merged with its `.local.json`
 * overlay. `confineTree` refuses a symlink pointed outside `repoRoot` rather
 * than following it.
 */
export async function readEnvironment(
  repoRoot: string,
  environmentId: string,
): Promise<ApiOpResult<PostmanEnvironment>> {
  if (!isValidId(environmentId)) return apiFailure('That environment no longer exists.');

  const fileAbs = join(repoRoot, ...ENVIRONMENTS_DIR.split('/'), environmentId);
  if (!(await existsAtAll(fileAbs))) return apiFailure('That environment no longer exists.');

  const confined = await confineTree(repoRoot, fileAbs);
  if (!confined) return apiFailure('That environment is not inside the open repository.');

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

  const result = PostmanEnvironmentSchema.safeParse(parsed);
  if (!result.success) return apiFailure('That file is not a Postman environment.');

  const slug = slugFromFileName(environmentId);
  const overlay = await readOverlay(repoRoot, slug);
  // The raw parsed value, never `result.data` — see the module header.
  return apiOk(mergeOverlay(parsed as PostmanEnvironment, overlay));
}

/** Rows whose `type` is `'secret'` and whose value is non-empty — the ones
 *  `saveEnvironment` actually writes into the overlay, and the count its
 *  `needs-confirm` outcome and confirm dialog both name. */
function secretRowsToWrite(values: readonly PostmanEnvironmentValue[]): PostmanEnvironmentValue[] {
  return values.filter((row) => row.type === 'secret' && (row.value ?? '') !== '');
}

/**
 * Save `environment` — creating a new file when `environmentId` is `null`
 * (slugifying `environment.name`, de-duplicating exactly as
 * `importCollection` does), overwriting the existing one otherwise.
 *
 * The secret split, in order:
 * 1. Every `type: 'secret'` row with a non-empty value is pulled into the
 *    overlay map (existing overlay entries for rows no longer secret, or no
 *    longer present, are dropped — the overlay only ever holds what the
 *    current save actually needs).
 * 2. If that set is non-empty and the repo is not yet gitignore-protected,
 *    and the caller has not already confirmed, this returns
 *    `{status:'needs-confirm', …}` and **writes nothing at all** — not the
 *    base file, not the overlay, not the gitignore.
 * 3. Otherwise: `ensureApiGitignore` runs (a no-op once protected), the
 *    overlay is written, and the base file is written with every secret
 *    row's `value` blanked to `''` — the row itself survives, per the module
 *    header.
 */
export async function saveEnvironment(
  repoRoot: string,
  environmentId: string | null,
  environment: PostmanEnvironment,
  confirmed: boolean,
): Promise<ApiOpResult<SaveEnvironmentOutcome>> {
  if (environmentId !== null && !isValidId(environmentId)) {
    return apiFailure('That environment no longer exists.');
  }

  const secretRows = secretRowsToWrite(environment.values);

  if (secretRows.length > 0 && !confirmed) {
    const alreadyProtected = await isGitignoreProtected(repoRoot);
    if (!alreadyProtected) {
      return apiOk<SaveEnvironmentOutcome>({
        status: 'needs-confirm',
        secretCount: secretRows.length,
        gitignorePath: GITIGNORE_REL,
      });
    }
  }

  let fileName = environmentId;
  let slug: string;
  if (fileName === null) {
    slug = slugify(environment.name);
    const environmentsDirAbs = join(repoRoot, ...ENVIRONMENTS_DIR.split('/'));
    fileName = await uniqueFileName(environmentsDirAbs, slug);
  } else {
    slug = slugFromFileName(fileName);
  }

  if (secretRows.length > 0) await ensureApiGitignore(repoRoot);

  const overlay: Record<string, string> = {};
  for (const row of secretRows) overlay[row.key] = row.value ?? '';
  if (!(await writeOverlay(repoRoot, slug, overlay))) {
    return apiFailure('Could not write the environment secret overlay.');
  }

  const baseValues = environment.values.map((row) =>
    row.type === 'secret' ? { ...row, value: '' } : row,
  );
  const base: PostmanEnvironment = { ...environment, values: baseValues };

  const rel = `${ENVIRONMENTS_DIR}/${fileName}`;
  if (!(await ensureConfinedDirs(repoRoot, rel))) {
    return apiFailure('Could not create .midnite/api/environments in the open repository.');
  }
  const target = await confineParent(repoRoot, rel);
  if (!target) return apiFailure('That path is not inside the open repository.');

  const created = await createFile(target);
  if (created) {
    try {
      await created.writeFile(serialise(base), 'utf8');
    } finally {
      await created.close();
    }
    return apiOk<SaveEnvironmentOutcome>({ status: 'saved', fileName });
  }

  const handle = await openForOverwrite(target);
  if (!handle) return apiFailure('That environment no longer exists.');
  try {
    await handle.truncate(0);
    await handle.writeFile(serialise(base), 'utf8');
  } finally {
    await handle.close();
  }
  return apiOk<SaveEnvironmentOutcome>({ status: 'saved', fileName });
}

/** Remove an environment's base file and its overlay, if either exists. */
export async function deleteEnvironment(repoRoot: string, environmentId: string): Promise<ApiOpResult> {
  if (!isValidId(environmentId)) return apiFailure('That environment no longer exists.');

  const fileAbs = join(repoRoot, ...ENVIRONMENTS_DIR.split('/'), environmentId);
  const confined = await confineTree(repoRoot, fileAbs);
  if (!confined) return apiFailure('That environment no longer exists.');

  try {
    await unlink(confined);
  } catch (error) {
    return apiFailure(describeFsError(error));
  }

  const slug = slugFromFileName(environmentId);
  const overlayRel = `${ENVIRONMENTS_DIR}/${overlayFileNameFor(slug)}`;
  const overlayAbs = join(repoRoot, ...overlayRel.split('/'));
  const overlayConfined = await confineTree(repoRoot, overlayAbs);
  if (overlayConfined) {
    try {
      await unlink(overlayConfined);
    } catch {
      // Best-effort — the base file is already gone, which is the part that matters.
    }
  }

  return apiOk();
}
