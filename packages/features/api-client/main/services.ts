import { guardedFetch } from '@midnite/studio-runtime';
import type { ScriptContext, ScriptRun } from '@midnite/studio-shared';

/**
 * What only the composer knows (Phase 113 Theme O), held at module level the way
 * the forge feature holds its remotes resolver — the send engine, the collection
 * runner and the handlers all read it, and none of them imports `electron` or a
 * repository registry.
 *
 * - **`workdir`** — a repository's checkout, from a `repoId`. Studio asks its repo
 *   registry; Coder reads its own list. `null` is a repository that is no longer
 *   open, a normal outcome and never an exception.
 * - **`fetch`** — the HTTP transport. The global `fetch` by default; tests hand a
 *   fake so nothing reaches a network.
 * - **`scriptRunner`** — runs one user script in a separate OS process the composer
 *   forks ({@link ScriptRunner}). The feature never runs user code in main itself.
 */
export type ApiClientServices = {
  workdir: (repoId: string) => Promise<string | null>;
  fetch: typeof fetch;
  scriptRunner: ScriptRunner;
};

/** The out-of-process script runner: one run at a time per child, killed on a cancel, a timeout and quit. */
export type ScriptRunner = {
  /**
   * Run one script. Never rejects: a timeout, a crashed child, a cancelled run or a malformed reply
   * all resolve to a {@link ScriptRun} with `error` set. Aborting `signal` kills the child that is
   * running it (the next run forks a fresh one).
   */
  run(source: string, context: ScriptContext, timeoutMs: number, signal?: AbortSignal): Promise<ScriptRun>;
  /** Kill the child, if one is alive — called on quit. */
  dispose(): void;
};

/** The runner of an app that cannot fork one: every script answers with an error, nothing runs. */
export const unavailableScriptRunner: ScriptRunner = {
  run: async () => ({
    results: [],
    logs: [],
    mutations: { environment: {}, collectionVariables: {} },
    error: 'Scripts cannot run in this app.',
  }),
  dispose: () => undefined,
};

const defaults: ApiClientServices = {
  workdir: async () => null,
  fetch: (input, init) => guardedFetch('api-client', input instanceof Request ? input.url : input, init),
  scriptRunner: unavailableScriptRunner,
};

let services: ApiClientServices = defaults;

/** Install the composer's services. A member left out keeps its default (no workdir, global fetch, no scripts). */
export function configureApiClient(next: Partial<ApiClientServices>): void {
  services = { ...defaults, ...next };
}

export const resolveWorkdir = (repoId: string): Promise<string | null> => services.workdir(repoId);

export const apiFetch = (input: string | URL, init?: RequestInit): Promise<Response> => services.fetch(input, init);

export const currentScriptRunner = (): ScriptRunner => services.scriptRunner;

/** Kill the script runner's child process — the composer calls this on quit. */
export function disposeScriptRunner(): void {
  services.scriptRunner.dispose();
}

/** Back to the defaults — for tests. */
export function __resetApiClientForTests(): void {
  services = defaults;
}
