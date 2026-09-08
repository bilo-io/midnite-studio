/**
 * The agent roster, as site copy.
 *
 * These are the ten `BUILTIN_AGENTS` labels from
 * `packages/shared/src/terminal.ts`, in that array's order —
 * **hard-coded rather than imported.** The website is allowed to import
 * `@midnite/studio-shared`, but doing it for ten strings would pull zod and the
 * whole IPC contract into a marketing bundle that has a 250 KB gzipped budget
 * for the entire site. The cost of the duplication is that adding an eleventh
 * agent means editing here too; `roster.test.ts` at least stops the list
 * silently rotting into something with a duplicate or a blank in it.
 *
 * Used by the early-access chips ("which of these do you use?") and by the
 * footer's Agents column.
 */

export type RosterAgent = {
  /** Matches the agent's id in the app's roster. Used as a form value. */
  id: string;
  /** The name as the vendor writes it. */
  label: string;
};

export const AGENT_ROSTER: readonly RosterAgent[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'agy', label: 'Antigravity' },
  { id: 'codex', label: 'Codex' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'copilot', label: 'Copilot' },
  { id: 'openclaude', label: 'OpenClaude' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'kilo', label: 'Kilo Code' },
  { id: 'aider', label: 'Aider' },
  { id: 'cline', label: 'Cline' },
];

/** The label for an id, or the id itself if it names no agent we know. */
export const rosterLabel = (id: string): string =>
  AGENT_ROSTER.find((agent) => agent.id === id)?.label ?? id;
