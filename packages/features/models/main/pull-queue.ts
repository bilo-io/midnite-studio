import { randomUUID } from 'node:crypto';

import type { OllamaPullProgressEvent } from '@midnite/studio-shared';

import { ollamaPull, ollamaTags, type OllamaPullLine } from './client';
import { getOllamaDigestLedger } from './digest-ledger';

/**
 * The main-side pull queue (Phase 96 Theme B) — one active HTTP stream per
 * model, cancel aborts it, progress is coalesced to roughly 10 events/s per
 * pull so a fast link does not flood IPC. Module-level state, mirroring
 * `video/render-service.ts`'s own `queueRender`/`runNext` shape (a `Map` per
 * concern, a `configure*` thunk for the window to push events to), the
 * closest existing precedent for "streamed progress from a long-lived main
 * operation" in this repo.
 */

type PullState = {
  pullId: string;
  model: string;
  controller: AbortController;
  lastEmitAt: number;
  cancelled: boolean;
};

const pullsById = new Map<string, PullState>();
const pullIdByModel = new Map<string, string>();

/**
 * Where progress goes — the composer's window push (Studio: the main window;
 * an app: its own). Nothing here imports `electron`, so the queue runs under
 * bare vitest. `null` drops events.
 */
let emitProgress: ((event: OllamaPullProgressEvent) => void) | null = null;

export function configureOllamaPullQueue(emit: ((event: OllamaPullProgressEvent) => void) | null): void {
  emitProgress = emit;
}

/** Test-only: drop all in-flight tracking between suites. */
export function resetOllamaPullQueueState(): void {
  for (const state of pullsById.values()) state.controller.abort();
  pullsById.clear();
  pullIdByModel.clear();
}

/** Caps progress pushes at roughly 10/s per pull — a terminal event always
 *  gets through immediately regardless of this. */
const PROGRESS_THROTTLE_MS = 100;

function emitPullProgress(event: OllamaPullProgressEvent): void {
  emitProgress?.(event);
}

/**
 * Start (or join) a pull for `model`. One active pull per model: a second
 * request for a model already pulling returns the same `pullId` rather than
 * opening a second HTTP stream against the same daemon download.
 */
export function startOllamaPull(
  model: string,
  baseUrl?: string,
): { pullId: string; model: string } {
  const existingId = pullIdByModel.get(model);
  if (existingId && pullsById.has(existingId)) {
    return { pullId: existingId, model };
  }

  const pullId = randomUUID();
  const controller = new AbortController();
  const state: PullState = { pullId, model, controller, lastEmitAt: 0, cancelled: false };
  pullsById.set(pullId, state);
  pullIdByModel.set(model, pullId);

  void runPull(state, baseUrl);

  return { pullId, model };
}

async function runPull(state: PullState, baseUrl?: string): Promise<void> {
  try {
    await ollamaPull(state.model, {
      baseUrl,
      signal: state.controller.signal,
      onLine: (line: OllamaPullLine) => {
        const done = line.status === 'success';
        const now = Date.now();
        if (!done && now - state.lastEmitAt < PROGRESS_THROTTLE_MS) return;
        state.lastEmitAt = now;
        emitPullProgress({
          pullId: state.pullId,
          model: state.model,
          status: line.status,
          digest: line.digest,
          total: line.total,
          completed: line.completed,
          done,
        });
      },
    });
    await pinInstalledDigest(state.model, baseUrl);
  } catch (error) {
    if (state.cancelled) {
      emitPullProgress({ pullId: state.pullId, model: state.model, status: 'cancelled', done: true });
    } else {
      const message = error instanceof Error ? error.message : String(error);
      emitPullProgress({
        pullId: state.pullId,
        model: state.model,
        status: `error: ${message}`,
        done: true,
      });
    }
  } finally {
    pullsById.delete(state.pullId);
    if (pullIdByModel.get(state.model) === state.pullId) pullIdByModel.delete(state.model);
  }
}

/**
 * Phase 121 Theme I: the pull finished, so ask the daemon what it now lists for the model, check that
 * against the manifest on disk and pin it. Best effort — a daemon that cannot list, or a ledger that is not
 * configured, never turns a finished pull into an error.
 */
async function pinInstalledDigest(model: string, baseUrl: string | undefined): Promise<void> {
  const ledger = getOllamaDigestLedger();
  if (!ledger) return;
  try {
    const installed = (await ollamaTags(baseUrl ? { baseUrl } : {})).find((m) => m.name === model || m.model === model);
    if (installed) await ledger.recordInstalled(installed);
  } catch {
    // Nothing to pin.
  }
}

/** No-op (and `ok`) on an unknown or already-settled `pullId` — the pull
 *  finishing just as the user clicks Cancel is a normal race, not a failure. */
export function cancelOllamaPull(pullId: string): { found: boolean } {
  const state = pullsById.get(pullId);
  if (!state) return { found: false };
  state.cancelled = true;
  state.controller.abort();
  return { found: true };
}
