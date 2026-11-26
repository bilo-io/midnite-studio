import {
  confineParent,
  createFile,
  ensureConfinedDirs,
  isSymlinkTarget,
  openForOverwrite,
  targetExists,
} from '../fs-scope-write';

/**
 * Write `data` to `relPath` under `root`, through the same confinement
 * every write in this app uses — the parent chain is created if missing
 * (`ensureConfinedDirs`, new for this phase; see its own doc comment), a
 * symlink at the target is refused, and the actual write opens through a
 * descriptor (`O_NOFOLLOW` for an overwrite, `O_CREAT|O_EXCL` for a create)
 * rather than by re-resolving the path a second time.
 *
 * Shared by both the entry-copy loop (`apply.ts`) and the manifest writer
 * (`manifest.ts`) — the manifest is computed JSON rather than a template
 * file's bytes, but it lands on disk through the identical jail.
 *
 * `mode`, when given, is set on the open descriptor after the write — how a
 * kit script keeps its executable bit (`scripts/skills/*.sh` are run
 * directly by the skills, so a copy without `+x` would fail in the target).
 */
export async function writeConfinedFile(
  root: string,
  relPath: string,
  data: Buffer,
  mode?: number,
): Promise<boolean> {
  if (!(await ensureConfinedDirs(root, relPath))) return false;
  const target = await confineParent(root, relPath);
  if (!target) return false;
  if (await isSymlinkTarget(target)) return false;

  const exists = await targetExists(target);
  const handle = exists ? await openForOverwrite(target) : await createFile(target);
  if (!handle) return false;
  try {
    if (exists) await handle.truncate(0);
    await handle.write(data, 0, data.length, 0);
    if (mode !== undefined) await handle.chmod(mode);
  } finally {
    await handle.close();
  }
  return true;
}
