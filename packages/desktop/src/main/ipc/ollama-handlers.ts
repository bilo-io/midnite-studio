import { CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';

import {
  ollamaCreate,
  ollamaDelete,
  ollamaPs,
  ollamaShow,
  ollamaTags,
  ollamaUnload,
  ollamaVersion,
  resolveOllamaBaseUrl,
} from '../ollama/client';
import { cancelOllamaPull, startOllamaPull } from '../ollama/pull-queue';
import { handle, handleBare } from './handle';

/**
 * Ollama (Phase 96 Theme B) — thin `handle`/`handleBare` forwarding onto
 * `ollama/client.ts` and `ollama/pull-queue.ts`, mirroring `video-handlers.ts`'s
 * own shape: every decision (mapping, throttling, one-pull-per-model) lives in
 * those two modules, not here.
 */
export function registerOllamaHandlers(): void {
  // Plain data, never a `GitOpResult` — an unreachable daemon is an ordinary
  // state the Health page and Models view both render, not a failure.
  handleBare(CHANNELS.ollamaStatus, async () => {
    const host = resolveOllamaBaseUrl();
    try {
      const version = await ollamaVersion({ baseUrl: host });
      return { reachable: true, version, host };
    } catch {
      return { reachable: false, version: null, host };
    }
  });

  handleBare(CHANNELS.ollamaList, async () => {
    try {
      return ok({ models: await ollamaTags() });
    } catch (error) {
      return failure(errorMessage(error));
    }
  });

  handle(
    CHANNELS.ollamaShow,
    schemas.OllamaShowRequest,
    async ({ model, verbose }) => {
      try {
        return ok(await ollamaShow(model, { verbose }));
      } catch (error) {
        return failure(errorMessage(error));
      }
    },
    (issue) => failure(issue),
  );

  handleBare(CHANNELS.ollamaPs, async () => {
    try {
      return ok({ models: await ollamaPs() });
    } catch (error) {
      return failure(errorMessage(error));
    }
  });

  handle(
    CHANNELS.ollamaPull,
    schemas.OllamaPullRequest,
    async ({ model }) => ok(startOllamaPull(model)),
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.ollamaPullCancel,
    schemas.OllamaPullCancelRequest,
    // A cancel on an id that already finished is a normal race, not a
    // failure — always resolves `ok`, mirroring `api-client/send.ts`'s own
    // `cancelRequest`.
    async ({ pullId }) => {
      cancelOllamaPull(pullId);
      return ok();
    },
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.ollamaDelete,
    schemas.OllamaDeleteRequest,
    async ({ model }) => {
      try {
        await ollamaDelete(model);
        return ok();
      } catch (error) {
        return failure(errorMessage(error));
      }
    },
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.ollamaCreate,
    schemas.OllamaCreateRequest,
    async ({ from, name, parameters }) => {
      try {
        await ollamaCreate({ from, name, parameters });
        return ok({ name });
      } catch (error) {
        return failure(errorMessage(error));
      }
    },
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.ollamaUnload,
    schemas.OllamaUnloadRequest,
    async ({ model }) => {
      try {
        await ollamaUnload(model);
        return ok();
      } catch (error) {
        return failure(errorMessage(error));
      }
    },
    (issue) => failure(issue),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
