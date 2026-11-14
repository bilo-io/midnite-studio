import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import type { AgentConversationAdapter } from './types';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type AgyAdapterOptions = {
  brainDir?: string;
  historyPath?: string;
};

type AgyCandidate = {
  id: string;
  time: number;
  matchedCwd: boolean;
};

function parseHistoryTimestamp(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Number.NaN;
}

async function readHistoryIndex(
  historyFile: string,
  resolvedCwd: string,
  since: number,
  maxTime: number,
): Promise<{
  workspaceByConvId: Map<string, string>;
  historyMatchedIds: Set<string>;
}> {
  const workspaceByConvId = new Map<string, string>();
  const historyMatchedIds = new Set<string>();

  let raw: string;
  try {
    raw = await readFile(historyFile, 'utf8');
  } catch {
    return { workspaceByConvId, historyMatchedIds };
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        timestamp?: unknown;
        workspace?: unknown;
        conversationId?: unknown;
      };
      const convId = typeof parsed.conversationId === 'string' ? parsed.conversationId.trim() : '';
      const workspace = typeof parsed.workspace === 'string' ? parsed.workspace.trim() : '';
      if (!convId || !UUID_RE.test(convId) || !workspace) continue;

      workspaceByConvId.set(convId, workspace);
      const ts = parseHistoryTimestamp(parsed.timestamp);
      if (resolve(workspace) === resolvedCwd && Number.isFinite(ts) && ts >= since && ts <= maxTime) {
        historyMatchedIds.add(convId);
      }
    } catch {
      // Ignore malformed JSONL lines
    }
  }

  return { workspaceByConvId, historyMatchedIds };
}

async function readBrainEntryMtime(entryDir: string): Promise<number | null> {
  const transcriptPath = join(entryDir, '.system_generated', 'logs', 'transcript.jsonl');
  try {
    const transcriptStat = await stat(transcriptPath);
    return transcriptStat.mtimeMs;
  } catch {
    try {
      const dirStat = await stat(entryDir);
      return dirStat.mtimeMs;
    } catch {
      return null;
    }
  }
}

/**
 * Adapter for locating conversation UUIDs from Antigravity (`agy`) brain and history stores.
 *
 * Looks in `~/.gemini/antigravity-cli/brain/<uuid>/` and disambiguates concurrent
 * repositories using `~/.gemini/antigravity-cli/history.jsonl`.
 */
export function createAgyConversationAdapter(
  options: AgyAdapterOptions = {},
): AgentConversationAdapter {
  const baseBrainDir = options.brainDir ?? join(homedir(), '.gemini', 'antigravity-cli', 'brain');
  const historyFile =
    options.historyPath ?? join(homedir(), '.gemini', 'antigravity-cli', 'history.jsonl');

  return {
    async locate(cwd: string, since: number, until?: number): Promise<string | null> {
      try {
        let entries: string[];
        try {
          entries = await readdir(baseBrainDir);
        } catch {
          return null;
        }

        const resolvedCwd = resolve(cwd);
        const maxTime = until ?? Date.now();
        const { workspaceByConvId, historyMatchedIds } = await readHistoryIndex(
          historyFile,
          resolvedCwd,
          since,
          maxTime,
        );

        const candidates: AgyCandidate[] = [];

        await Promise.all(
          entries.map(async (id) => {
            if (!UUID_RE.test(id)) return;

            const knownWorkspace = workspaceByConvId.get(id);
            if (knownWorkspace !== undefined && resolve(knownWorkspace) !== resolvedCwd) {
              return;
            }

            const time = await readBrainEntryMtime(join(baseBrainDir, id));
            if (time === null || time < since || time > maxTime) return;

            const matchedCwd =
              historyMatchedIds.has(id) ||
              (knownWorkspace !== undefined && resolve(knownWorkspace) === resolvedCwd);
            candidates.push({ id, time, matchedCwd });
          }),
        );

        if (candidates.length === 0) return null;

        candidates.sort((a, b) => {
          if (a.matchedCwd !== b.matchedCwd) {
            return a.matchedCwd ? -1 : 1;
          }
          return b.time - a.time;
        });

        const top = candidates[0];
        if (!top) return null;

        const second = candidates[1];
        if (second && top.matchedCwd === second.matchedCwd && top.time === second.time) {
          return null;
        }

        return top.id;
      } catch {
        return null;
      }
    },
  };
}
