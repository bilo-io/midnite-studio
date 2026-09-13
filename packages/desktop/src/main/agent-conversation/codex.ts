import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import type { AgentConversationAdapter } from './types';

const CODEX_FILE_RE =
  /^rollout-(.+)-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.jsonl$/;

export type CodexAdapterOptions = {
  sessionsDir?: string;
};

/**
 * Parse an ISO-like timestamp from a Codex rollout filename.
 *
 * Codex filenames replace colons in the ISO time component with hyphens, e.g.:
 * `rollout-2026-06-11T13-05-11-72141a4f-...jsonl`.
 */
export function parseCodexTimestamp(raw: string): number | null {
  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) return direct;

  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:[.-](\d{3}))?Z?$/i.exec(raw);
  if (match) {
    const [, date, hh, mm, ss, ms] = match;
    const iso = `${date}T${hh}:${mm}:${ss}${ms ? `.${ms}` : ''}Z`;
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

/** Recursively collect all .jsonl file paths under a directory. */
async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          const sub = await walkDir(fullPath);
          results.push(...sub);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          results.push(fullPath);
        }
      }),
    );
  } catch {
    // Missing or unreadable directory
  }
  return results;
}

/**
 * Adapter for locating conversation UUIDs from Codex's sessions store.
 *
 * Recursively walks `~/.codex/sessions/`, matches `rollout-<ISO>-<uuid>.jsonl`
 * on timestamp/mtime within `[since, until]`, and returns the trailing UUID.
 */
export function createCodexConversationAdapter(
  options: CodexAdapterOptions = {},
): AgentConversationAdapter {
  const baseSessionsDir = options.sessionsDir ?? join(homedir(), '.codex', 'sessions');

  return {
    async locate(_cwd: string, since: number, until?: number): Promise<string | null> {
      try {
        const files = await walkDir(baseSessionsDir);
        if (files.length === 0) return null;

        const maxTime = until ?? Date.now();
        const candidates: { uuid: string; time: number }[] = [];

        await Promise.all(
          files.map(async (filePath) => {
            const fileName = basename(filePath);
            const match = CODEX_FILE_RE.exec(fileName);
            if (!match) return;

            const rawTimestamp = match[1];
            const uuid = match[2];
            if (!rawTimestamp || !uuid) return;

            const parsedTime = parseCodexTimestamp(rawTimestamp);
            if (parsedTime === null) return;

            let mtime: number | null = null;
            try {
              const fileStat = await stat(filePath);
              mtime = fileStat.mtimeMs;
            } catch {
              // Unreadable file
            }

            // Check if either the filename timestamp or file mtime falls in [since, maxTime]
            const timeInWindow =
              (parsedTime !== null && parsedTime >= since && parsedTime <= maxTime) ||
              (mtime !== null && mtime >= since && mtime <= maxTime);

            if (timeInWindow) {
              const effectiveTime = parsedTime ?? mtime ?? 0;
              candidates.push({ uuid, time: effectiveTime });
            }
          }),
        );

        if (candidates.length === 0) return null;

        candidates.sort((a, b) => b.time - a.time);

        const top = candidates[0];
        if (!top) return null;

        // Treat ties as no match rather than guessing
        const second = candidates[1];
        if (second && top.time === second.time) {
          return null;
        }

        return top.uuid;
      } catch {
        return null;
      }
    },
  };
}
