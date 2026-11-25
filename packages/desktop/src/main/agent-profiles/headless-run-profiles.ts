/**
 * Which custom agent a headless run is (#1697). A pty session carries its `profileId` on its row; a headless
 * run (the companion's one ask, a council seat, a workflow step) has no row, so the breaker could not find
 * its limits. The run registers here under the id its private socket was bound to — the id on its audit rows
 * — and the breaker's session lookup falls back to it. In memory only: a headless run dies with main.
 */
export type HeadlessRunProfile = { profileId: string; agentId: string; cwd: string; title: string };

/** How a headless run is stopped: its child process's (or council seat pty's) kill (#1713). */
export type HeadlessRunHandle = { kill: () => void };

export type HeadlessRunRegistry = {
  /** Returns the unregister; call it when the run settles. A second register under the same id replaces it. */
  register(runId: string, run: HeadlessRunProfile): () => void;
  lookup(runId: string): HeadlessRunProfile | null;
  /** The runner hands over its child once it is spawned; a run already aborted is killed at once. */
  attach(runId: string, handle: HeadlessRunHandle): void;
  /**
   * The breaker's stop for a run with no pty (#1713): kills the attached child, or marks the run so the child
   * is killed as it attaches. `false` when no such run is registered.
   */
  abort(runId: string): boolean;
};

type Entry = { run: HeadlessRunProfile; handle: HeadlessRunHandle | null; aborted: boolean };

export function createHeadlessRunRegistry(): HeadlessRunRegistry {
  const runs = new Map<string, Entry>();
  const kill = (handle: HeadlessRunHandle): void => {
    try {
      handle.kill();
    } catch {
      // Already gone: nothing left to stop.
    }
  };
  return {
    register(runId, run) {
      const entry: Entry = { run, handle: null, aborted: false };
      runs.set(runId, entry);
      return () => {
        // Only this registration: a later one under the same id stays.
        if (runs.get(runId) === entry) runs.delete(runId);
      };
    },
    lookup: (runId) => runs.get(runId)?.run ?? null,
    attach(runId, handle) {
      const entry = runs.get(runId);
      if (!entry) return;
      entry.handle = handle;
      if (entry.aborted) kill(handle);
    },
    abort(runId) {
      const entry = runs.get(runId);
      if (!entry) return false;
      entry.aborted = true;
      if (entry.handle) kill(entry.handle);
      return true;
    },
  };
}

let studio: HeadlessRunRegistry | null = null;

/** Studio's one registry, shared by every headless surface and the breaker. */
export function studioHeadlessRuns(): HeadlessRunRegistry {
  studio ??= createHeadlessRunRegistry();
  return studio;
}
