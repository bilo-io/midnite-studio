import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { confineParent, confineTree, createFile, ensureConfinedDirs, openForOverwrite } from '../fs-scope-write';
import { ensureApiGitignore } from './environment-io';

/**
 * The script-trust marker (Phase 70 Theme B) — `_midniteScriptsTrusted` in a
 * collection's sibling `<slug>.local.json`, next to
 * `.midnite/api/collections/<slug>.postman_collection.json`. Mirrors
 * `environment-io.ts`'s own overlay exactly, on purpose: same directory, same
 * `.local.json` suffix, same reason. **A trust decision must not be
 * committable** — write it into the collection file itself and trusting a
 * colleague's collection once trusts it for every teammate who pulls the
 * repo, which is precisely the mistake Decision 2 exists to rule out (an
 * imported collection is not trusted by the act of importing it, and neither
 * is a collection this app happened to write).
 *
 * `ensureApiGitignore` (Theme A) is called from `setScriptTrust` rather than
 * duplicated here — `.midnite/api/.gitignore`'s `*.local.json` pattern
 * already covers this file (it lives under the same `.midnite/api/` tree,
 * one directory deeper), so the only new work is making sure that gitignore
 * exists even for a repo where no environment has ever been saved yet: a
 * script consent decision can be the very first write under `.midnite/api/`.
 */

const COLLECTIONS_DIR = '.midnite/api/collections';

function overlayFileNameFor(collectionId: string): string {
  return `${collectionId.replace(/\.postman_collection\.json$/, '')}.local.json`;
}

function isValidId(id: string): boolean {
  return id.length > 0 && !id.includes('/') && !id.includes('\0');
}

function serialise(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * `true` — always run; `false` — never run, and do not ask again; `null` —
 * no decision on file yet, so the consent bar should be shown. Any read
 * failure (missing file, unreadable JSON, a confinement refusal) folds into
 * `null`: "haven't decided yet" is the correct, safe default for every one
 * of those, never a thrown error a caller has to handle specially.
 */
export async function readScriptTrust(repoRoot: string, collectionId: string): Promise<boolean | null> {
  if (!isValidId(collectionId)) return null;
  const rel = `${COLLECTIONS_DIR}/${overlayFileNameFor(collectionId)}`;
  const fileAbs = join(repoRoot, ...rel.split('/'));
  const confined = await confineTree(repoRoot, fileAbs);
  if (!confined) return null;
  try {
    const raw = await readFile(confined, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && '_midniteScriptsTrusted' in parsed) {
      const value = (parsed as { _midniteScriptsTrusted: unknown })._midniteScriptsTrusted;
      return typeof value === 'boolean' ? value : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist an explicit trust decision — `trusted: true` for *Always for this
 * collection*, `false` for *Never*. `false` is written just as durably as
 * `true`: it is what stops the consent bar reappearing on every subsequent
 * request in a collection the user has already declined, rather than
 * re-litigating the same decision each time. *Run once* never calls this —
 * it runs the script for that one call only, through
 * `ApiRunScriptRequest.runAnyway`, and leaves no trace here at all.
 */
export async function setScriptTrust(
  repoRoot: string,
  collectionId: string,
  trusted: boolean,
): Promise<boolean> {
  if (!isValidId(collectionId)) return false;
  const rel = `${COLLECTIONS_DIR}/${overlayFileNameFor(collectionId)}`;
  if (!(await ensureConfinedDirs(repoRoot, rel))) return false;
  const target = await confineParent(repoRoot, rel);
  if (!target) return false;

  // Written before the marker itself so a repo with no `.midnite/api/`
  // activity yet — no environment ever saved — is still protected the
  // moment its first script-trust decision lands.
  await ensureApiGitignore(repoRoot);

  const body = serialise({ _midniteScriptsTrusted: trusted });

  const created = await createFile(target);
  if (created) {
    try {
      await created.writeFile(body, 'utf8');
    } finally {
      await created.close();
    }
    return true;
  }

  const handle = await openForOverwrite(target);
  if (!handle) return false;
  try {
    await handle.truncate(0);
    await handle.writeFile(body, 'utf8');
  } finally {
    await handle.close();
  }
  return true;
}
