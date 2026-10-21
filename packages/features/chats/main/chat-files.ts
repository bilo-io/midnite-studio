import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { listFiles } from '@midnite/studio-git-engine';

/**
 * The files a chat's agent can reach, for the composer's `@` picker.
 *
 * With a repo: git-engine's `listFiles` — `ls-files -z --cached --others
 * --exclude-standard`, NUL-split, so the list is exactly "tracked plus
 * untracked-not-ignored" and a newline in a path cannot break it. Without one:
 * a bounded walk of the chat's scratch directory (not a git repo, so there is
 * nothing for git to list).
 *
 * Paths containing whitespace are left out: a picked file becomes a
 * whitespace-delimited `@path` token in the prompt, and one with a space in it
 * would not survive the round trip back into a pill.
 */

export const CHAT_FILES_MAX = 20_000;

/** Directories a scratch walk never descends into — tool caches, not files the user means. */
const SKIP_DIRS = new Set(['.git', 'node_modules']);

const usable = (path: string): boolean => path.length > 0 && !/\s/.test(path);

export async function walkFiles(root: string, limit = CHAT_FILES_MAX): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  const queue: string[] = [''];
  while (queue.length > 0) {
    const rel = queue.shift()!;
    let entries;
    try {
      entries = await readdir(join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(path);
      } else if (entry.isFile() && usable(path)) {
        if (files.length >= limit) return { files, truncated: true };
        files.push(path);
      }
    }
  }
  return { files, truncated: false };
}

export async function listChatFiles(opts: {
  repoPath: string | null;
  scratchDir: string | null;
  limit?: number;
}): Promise<{ files: string[]; truncated: boolean }> {
  const limit = opts.limit ?? CHAT_FILES_MAX;
  if (opts.repoPath) {
    const listed = await listFiles(opts.repoPath, limit);
    // `--cached` repeats an unmerged path once per stage.
    return { files: [...new Set(listed.files)].filter(usable), truncated: listed.truncated };
  }
  if (opts.scratchDir) return walkFiles(opts.scratchDir, limit);
  return { files: [], truncated: false };
}
