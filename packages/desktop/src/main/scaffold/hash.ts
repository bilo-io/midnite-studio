import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

/** `null` when the file does not exist, or is otherwise unreadable. */
export async function sha256File(path: string): Promise<string | null> {
  try {
    const data = await readFile(path);
    return createHash('sha256').update(data).digest('hex');
  } catch {
    return null;
  }
}

/** `0` when the file does not exist — a plan's `bytes` describes what would
 *  land on disk, and a template entry always exists by construction. */
export async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}
