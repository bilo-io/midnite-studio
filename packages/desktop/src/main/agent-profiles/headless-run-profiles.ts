/**
 * Which custom agent a headless run is (#1697). A pty session carries its `profileId` on its row; a headless
 * run (the companion's one ask, a council seat, a workflow step) has no row, so the breaker could not find
 * its limits. The run registers here under the id its private socket was bound to — the id on its audit rows
 * — and the breaker's session lookup falls back to it. In memory only: a headless run dies with main.
 */
export type HeadlessRunProfile = { profileId: string; agentId: string; cwd: string; title: string };

export type HeadlessRunRegistry = {
  /** Returns the unregister; call it when the run settles. A second register under the same id replaces it. */
  register(runId: string, run: HeadlessRunProfile): () => void;
  lookup(runId: string): HeadlessRunProfile | null;
};

export function createHeadlessRunRegistry(): HeadlessRunRegistry {
  const runs = new Map<string, HeadlessRunProfile>();
  return {
    register(runId, run) {
      runs.set(runId, run);
      return () => {
        // Only this registration: a later one under the same id stays.
        if (runs.get(runId) === run) runs.delete(runId);
      };
    },
    lookup: (runId) => runs.get(runId) ?? null,
  };
}

let studio: HeadlessRunRegistry | null = null;

/** Studio's one registry, shared by every headless surface and the breaker. */
export function studioHeadlessRuns(): HeadlessRunRegistry {
  studio ??= createHeadlessRunRegistry();
  return studio;
}
