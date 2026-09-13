import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { slugifyCwd } from './slugify';
import type { AgentConversationAdapter } from './types';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type ClaudeAdapterOptions = {
  projectsDir?: string;
};

/**
 * Adapter for locating conversation UUIDs from Claude Code's project store.
 *
 * Looks in `~/.claude/projects/<slug>/*.jsonl`, matches files modified within
 * `[since, until]`, and returns the filename UUID.
 */
export function createClaudeConversationAdapter(
  options: ClaudeAdapterOptions = {},
): AgentConversationAdapter {
  const baseProjectsDir = options.projectsDir ?? join(homedir(), '.claude', 'projects');

  return {
    async locate(cwd: string, since: number, until?: number): Promise<string | null> {
      try {
        const slug = slugifyCwd(cwd);
        if (!slug) return null;

        const projectDir = join(baseProjectsDir, slug);
        let entries: string[];
        try {
          entries = await readdir(projectDir);
        } catch {
          // Directory missing or unreadable — best effort, return null
          return null;
        }

        const maxTime = until ?? Date.now();
        const candidates: { id: string; mtime: number }[] = [];

        await Promise.all(
          entries.map(async (entry) => {
            if (!entry.endsWith('.jsonl')) return;
            const id = entry.slice(0, -6);
            if (!UUID_RE.test(id)) return;

            try {
              const fileStat = await stat(join(projectDir, entry));
              const mtime = fileStat.mtimeMs;
              if (mtime >= since && mtime <= maxTime) {
                candidates.push({ id, mtime });
              }
            } catch {
              // Unreadable file — ignore
            }
          }),
        );

        if (candidates.length === 0) return null;

        candidates.sort((a, b) => b.mtime - a.mtime);

        const top = candidates[0];
        if (!top) return null;

        // Treat ties as no match rather than guessing
        const second = candidates[1];
        if (second && top.mtime === second.mtime) {
          return null;
        }

        return top.id;
      } catch {
        return null;
      }
    },
  };
}
