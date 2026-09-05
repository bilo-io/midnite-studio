import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Whether the MCP server is allowed to listen — main-side state, not a
 * renderer `localStorage` value (Phase 57 Decision 8).
 *
 * The server has to know this at `app.whenReady()`, before any window (and so
 * any renderer store) exists, so `useUiStore`'s persisted `localStorage` is
 * not readable in time. `createRepoStore` (`repo-store.ts`) is the exact
 * precedent copied here line for line: a versioned JSON file under
 * `userData`, no `electron` import so this stays testable against a temp
 * directory, and a corrupt file loads the safe default rather than throwing.
 *
 * Off by default on purpose (Decision 8 / the phase's own scope guardrail): a
 * local socket that hands any process on the machine a parsed view of the
 * user's repositories is a real widening of the attack surface, so a fresh
 * profile never listens until something turns it on. This phase (Themes
 * A–D) ships no UI to turn it on — that is Theme F's settings page, a later
 * batch — so in practice the flag stays `false` for every user until then.
 */
export type McpSettings = { version: 1; enabled: boolean };

export type McpStore = {
  load: () => Promise<McpSettings>;
  save: (settings: McpSettings) => Promise<void>;
};

const FILE_NAME = 'mcp.json';

export const DEFAULT_MCP_SETTINGS: McpSettings = { version: 1, enabled: false };

export function createMcpStore(directory: string): McpStore {
  const file = join(directory, FILE_NAME);

  return {
    load: async () => {
      try {
        return parseStoredSettings(JSON.parse(await readFile(file, 'utf8')));
      } catch {
        // Missing (first launch) or unreadable/corrupt — the safe default is
        // "off", never "on by whatever the last valid write happened to say".
        return { ...DEFAULT_MCP_SETTINGS };
      }
    },

    save: async (settings) => {
      try {
        await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
      } catch {
        // A read-only data dir shouldn't take the app down; the setting just
        // won't persist across the next launch.
      }
    },
  };
}

/**
 * Validate without zod: this module is main-only and the shape is two
 * fields, matching `repo-store.ts`'s own reasoning for a hand-rolled guard.
 */
export function parseStoredSettings(value: unknown): McpSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_MCP_SETTINGS };
  const enabled = (value as { enabled?: unknown }).enabled;
  return { version: 1, enabled: enabled === true };
}

/** A store that always reports "off" — the fallback before one is configured. */
export const nullMcpStore: McpStore = {
  load: async () => ({ ...DEFAULT_MCP_SETTINGS }),
  save: async () => {},
};
