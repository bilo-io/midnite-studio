import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseAgentProfiles, type AgentProfile } from '@midnite/studio-shared';

/**
 * Custom agents (Phase 154), persisted globally under Electron's `userData`:
 * one `agent-profiles.json` plus one prompt file per agent. The file is app-owned,
 * so entries validate individually on load — one corrupt agent costs that agent,
 * not the file.
 *
 * Writes are atomic (a temp file, then a rename), because the Agents page can be open
 * in two windows and a half-written file would cost every agent.
 */
export const AGENT_PROFILES_FILE_NAME = 'agent-profiles.json';

export type AgentProfilesStore = {
  load: () => Promise<AgentProfile[]>;
  save: (profiles: readonly AgentProfile[]) => Promise<void>;
  /** Writes `text` as the agent's prompt file (mode 0600), or removes it and returns `null` when `text` is empty. */
  writePrompt: (id: string, text: string) => Promise<string | null>;
  removePrompt: (id: string) => Promise<void>;
  promptPath: (id: string) => string;
};

async function writeAtomic(file: string, data: string, mode?: number): Promise<void> {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, data, mode === undefined ? 'utf8' : { encoding: 'utf8', mode });
    if (mode !== undefined) await chmod(tmp, mode);
    await rename(tmp, file);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

export function createAgentProfilesStore(directory: string): AgentProfilesStore {
  const file = join(directory, AGENT_PROFILES_FILE_NAME);
  const promptDir = join(directory, 'agent-profiles', 'prompts');
  const promptPath = (id: string): string => {
    // Ids are schema-checked to `profile-[A-Za-z0-9_-]+`; this is the last line of defence for a path.
    if (!/^profile-[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Invalid agent id: ${id}`);
    return join(promptDir, `${id}.md`);
  };

  return {
    load: async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        return [];
      }
      if (typeof raw !== 'object' || raw === null) return [];
      return parseAgentProfiles((raw as { profiles?: unknown }).profiles);
    },

    save: async (profiles) => {
      await mkdir(directory, { recursive: true });
      await writeAtomic(file, `${JSON.stringify({ version: 1, profiles: [...profiles] }, null, 2)}\n`);
    },

    writePrompt: async (id, text) => {
      const path = promptPath(id);
      if (text === '') {
        await rm(path, { force: true });
        return null;
      }
      await mkdir(promptDir, { recursive: true });
      await writeAtomic(path, text, 0o600);
      return path;
    },

    removePrompt: async (id) => {
      await rm(promptPath(id), { force: true });
    },

    promptPath,
  };
}

/** A store that remembers nothing — the fallback before one is configured. */
export const nullAgentProfilesStore: AgentProfilesStore = {
  load: async () => [],
  save: async () => {},
  writePrompt: async () => null,
  removePrompt: async () => {},
  promptPath: (id) => id,
};
