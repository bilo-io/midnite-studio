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
import { getConfiguredOllamaHost, getOllamaSettings, setOllamaSettings } from '../ollama/settings-service';
import { handle, handleBare } from './handle';

/** The configured override (Theme C) wins; an unset override falls back to
 *  Theme B's env-only `resolveOllamaBaseUrl()`. */
async function resolveHost(): Promise<string> {
  return (await getConfiguredOllamaHost()) ?? resolveOllamaBaseUrl();
}

/**
 * Ollama (Phase 96 Theme B/C) — thin `handle`/`handleBare` forwarding onto
 * `ollama/client.ts`, `ollama/pull-queue.ts` and `ollama/settings-service.ts`,
 * mirroring `video-handlers.ts`'s own shape: every decision (mapping,
 * throttling, one-pull-per-model, host resolution) lives in those modules,
 * not here.
 */
export function registerOllamaHandlers(): void {
  // Plain data, never a `GitOpResult` — an unreachable daemon is an ordinary
  // state the Health page and Models view both render, not a failure.
  handleBare(CHANNELS.ollamaStatus, async () => {
    const host = await resolveHost();
    try {
      const version = await ollamaVersion({ baseUrl: host });
      return { reachable: true, version, host };
    } catch {
      return { reachable: false, version: null, host };
    }
  });

  handleBare(CHANNELS.ollamaList, async () => {
    try {
      return ok({ models: await ollamaTags({ baseUrl: await resolveHost() }) });
    } catch (error) {
      return failure(errorMessage(error));
    }
  });

  handle(
    CHANNELS.ollamaShow,
    schemas.OllamaShowRequest,
    async ({ model, verbose }) => {
      try {
        return ok(await ollamaShow(model, { verbose, baseUrl: await resolveHost() }));
      } catch (error) {
        return failure(errorMessage(error));
      }
    },
    (issue) => failure(issue),
  );

  handleBare(CHANNELS.ollamaPs, async () => {
    try {
      return ok({ models: await ollamaPs({ baseUrl: await resolveHost() }) });
    } catch (error) {
      return failure(errorMessage(error));
    }
  });

  handle(
    CHANNELS.ollamaPull,
    schemas.OllamaPullRequest,
    async ({ model }) => ok(startOllamaPull(model, await resolveHost())),
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
        await ollamaDelete(model, { baseUrl: await resolveHost() });
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
        await ollamaCreate({ from, name, parameters }, { baseUrl: await resolveHost() });
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
        await ollamaUnload(model, { baseUrl: await resolveHost() });
        return ok();
      } catch (error) {
        return failure(errorMessage(error));
      }
    },
    (issue) => failure(issue),
  );

  handleBare(CHANNELS.ollamaSettingsGet, async () => getOllamaSettings());

  handle(
    CHANNELS.ollamaSettingsSet,
    schemas.OllamaSettingsSetRequest,
    async (patch) => {
      try {
        return ok(await setOllamaSettings(patch));
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
