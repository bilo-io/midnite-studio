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
 * profile never listens until something turns it on. Phase 57 (Themes A–D)
 * shipped no UI to turn it on; Phase 81 Theme F's Settings ▸ MCP page is
 * what finally did, alongside `allowUi` below.
 *
 * **`version: 2` adds `allowUi`** (Phase 81 Theme F) — a second, narrower
 * switch gating whether the `ui.navigate`/`ui.command` tools may actually
 * steer the window, off by default like `enabled` itself and never implied
 * by it: turning the server on lets an agent *read* eight tools' worth of
 * repository state; `allowUi` is the separate consent for it to also change
 * what the user is looking at. `parseStoredSettings` reads a `version: 1`
 * file (no `allowUi` field at all) the same way it reads a corrupt one —
 * `allowUi` defaults to `false` either way, so an upgrade never silently
 * grants the wider permission.
 *
 * **`version: 3` adds `allowGateDecide`** (Phase 97 Theme D) — a THIRD
 * switch, identical shape and identical off-by-default posture, gating
 * `workflow_gate_decide`: the first MCP tool that changes app state rather
 * than the window chrome. A `version: 1`/`version: 2` file has no
 * `allowGateDecide` key at all, which the same plain `=== true` check below
 * already turns into `false` — no separate migration branch needed, exactly
 * Theme F's own precedent for `allowUi`.
 */
export type McpSettings = { version: 3; enabled: boolean; allowUi: boolean; allowGateDecide: boolean };

export type McpStore = {
  load: () => Promise<McpSettings>;
  save: (settings: McpSettings) => Promise<void>;
};

const FILE_NAME = 'mcp.json';

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  version: 3,
  enabled: false,
  allowUi: false,
  allowGateDecide: false,
};

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
 * Validate without zod: this module is main-only and the shape is four
 * fields, matching `repo-store.ts`'s own reasoning for a hand-rolled guard.
 *
 * Reads all three versions the same way and always answers `version: 3`: a
 * `version: 1`/`version: 2` file has no `allowGateDecide` key at all, which
 * the plain `=== true` check below already turns into `false` — the exact
 * migration Theme D calls for, with no separate branch on the stored
 * `version` needed (the same reasoning `version: 2`'s own comment gave for
 * `allowUi`).
 */
export function parseStoredSettings(value: unknown): McpSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_MCP_SETTINGS };
  const enabled = (value as { enabled?: unknown }).enabled === true;
  const allowUi = (value as { allowUi?: unknown }).allowUi === true;
  const allowGateDecide = (value as { allowGateDecide?: unknown }).allowGateDecide === true;
  return { version: 3, enabled, allowUi, allowGateDecide };
}

/** A store that always reports "off" — the fallback before one is configured. */
export const nullMcpStore: McpStore = {
  load: async () => ({ ...DEFAULT_MCP_SETTINGS }),
  save: async () => {},
};
