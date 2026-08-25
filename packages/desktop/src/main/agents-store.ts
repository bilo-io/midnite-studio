import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AgentDefinitionSchema, BUILTIN_AGENTS, type AgentDefinition } from '@midnite/git-shared';

/**
 * The roster of coding agents the terminal's `+` menu can start.
 *
 * `BUILTIN_AGENTS` ships with the app; `agents.json` in the userData directory
 * lets a user add or retune one without a rebuild, which is the whole reason the
 * roster is data rather than a switch in the renderer.
 *
 * Read-only by design. The app never writes this file — it is a config the user
 * edits, and a settings UI that rewrote it would have to preserve their comments
 * and ordering to be worth having.
 */
const FILE_NAME = 'agents.json';

export type AgentsStore = {
  load: () => Promise<AgentDefinition[]>;
};

export function createAgentsStore(directory: string): AgentsStore {
  const file = join(directory, FILE_NAME);

  return {
    load: async () => {
      let overrides: unknown;
      try {
        overrides = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        // Missing (the common case) or malformed — the builtins are a complete,
        // working roster on their own, so a bad edit costs the user their
        // customisation and nothing else.
        return [...BUILTIN_AGENTS];
      }
      return mergeAgents(BUILTIN_AGENTS, overrides);
    },
  };
}

/**
 * Merge the user's entries over the builtins by `id`.
 *
 * An override replaces the builtin in place — keeping its position, so the menu
 * doesn't reshuffle when someone retunes Claude's command — and an unknown id
 * appends. Entries that fail the schema are dropped individually: one typo'd
 * agent should not cost the user the rest of their file.
 */
export function mergeAgents(
  builtins: readonly AgentDefinition[],
  overrides: unknown,
): AgentDefinition[] {
  const raw = readAgentArray(overrides);
  const merged = [...builtins];

  for (const entry of raw) {
    const parsed = AgentDefinitionSchema.safeParse(entry);
    if (!parsed.success) continue;

    const index = merged.findIndex((a) => a.id === parsed.data.id);
    if (index === -1) merged.push(parsed.data);
    else merged[index] = parsed.data;
  }

  return merged;
}

/** Accepts either a bare array or `{ agents: [...] }`, since both read naturally. */
function readAgentArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && value !== null) {
    const agents = (value as { agents?: unknown }).agents;
    if (Array.isArray(agents)) return agents;
  }
  return [];
}
