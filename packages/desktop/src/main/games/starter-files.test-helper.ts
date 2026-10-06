import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Every file under `dir`, as `/`-joined relative paths. */
export async function listFilesRecursive(dir: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(join(dir, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const next = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFilesRecursive(dir, next)));
    else out.push(next);
  }
  return out.sort();
}
