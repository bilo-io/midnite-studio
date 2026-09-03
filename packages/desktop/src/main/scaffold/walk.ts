import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/**
 * Every regular file under `root`, as a POSIX-relative path.
 *
 * The template tree is trusted — it ships with the app — so this has none of
 * `fs-scope.ts`'s symlink/traversal defences; those exist for a *target*
 * repo's arbitrary content, not for a directory this build carries itself.
 */
export async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];

  async function recurse(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await recurse(full);
      } else if (entry.isFile()) {
        out.push(relative(root, full).split(sep).join('/'));
      }
    }
  }

  await recurse(root);
  return out;
}
