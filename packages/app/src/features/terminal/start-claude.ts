import { startAgent } from './start-agent';

/**
 * Open the terminal on a fresh **Claude** session in `cwd`, with `prompt` typed
 * at its shell and NOT executed.
 *
 * A thin, Claude-pinned wrapper over {@link startAgent} — kept apart from the
 * midnite menu's primary-agent-aware launch because `sync-controls.tsx`'s
 * conflict-repair flow is a deliberately Claude-only feature (its confirm
 * labels literally say "with Claude" — see `sync-resolution.ts`), not something
 * that should follow whatever the user picked as their primary agent.
 */
export function startClaude({
  repoId,
  cwd,
  title,
  prompt,
}: {
  repoId: string;
  cwd: string;
  /** The session's label in the terminal list. */
  title: string;
  prompt: string;
}): void {
  startAgent({ repoId, cwd, title, prompt, agentId: 'claude', command: 'claude' });
}
