import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';

import { modelsManifest } from '../manifest';
import {
  ollamaCloudTags,
  ollamaCreate,
  ollamaDelete,
  ollamaPs,
  ollamaShow,
  ollamaSignedIn,
  ollamaTags,
  ollamaUnload,
  ollamaVersion,
  resolveOllamaBaseUrl,
} from './client';
import { getOllamaDigestLedger } from './digest-ledger';
import { searchOllamaLibrary } from './library-search';
import { cancelOllamaPull, configureOllamaPullQueue, startOllamaPull } from './pull-queue';
import { getConfiguredOllamaHost, getOllamaSettings, setOllamaSettings } from './settings-service';

export { modelsManifest, type ModelsManifest } from '../manifest';
export * from './client';
export { runOllamaPrompt, type OllamaHeadlessDeps } from './ollama-headless';
export {
  configureOllamaDigests,
  createOllamaDigestLedger,
  createOllamaDigestStore,
  manifestPathFor,
  ollamaModelsDir,
  verifyManifestDigest,
  type OllamaDigestLedger,
  type OllamaDigestStore,
} from './digest-ledger';
export { searchOllamaLibrary } from './library-search';
export { cancelOllamaPull, configureOllamaPullQueue, resetOllamaPullQueueState, startOllamaPull } from './pull-queue';
export {
  configureOllamaSettings,
  getConfiguredOllamaHost,
  getOllamaSettings,
  resetOllamaSettingsState,
  setOllamaSettings,
} from './settings-service';
export { createOllamaSettingsStore, nullOllamaSettingsStore, type OllamaSettingsStore } from './settings-store';

/**
 * The models feature's main half (Phase 113 Theme N).
 *
 * The Ollama client, the pull queue and the persisted host override moved here
 * from `packages/desktop/src/main/ollama` — none of it imports `electron`.
 * Where the settings file lives is the composer's call (it hands
 * {@link configureOllamaSettings} a store over a directory it chose), and so is
 * the Ollama cloud key: **it is read here, through `cloudApiKey`, and answers
 * no channel.** The renderer is told whether one is set (`secretsHas`), never
 * what it is.
 *
 * The client is exported whole because other main-process features call the
 * daemon too (chats, councils, the media engines, workflow's agent node); a
 * composer hands those the functions they need rather than letting one feature
 * import another.
 */
export type ModelsMainServices = {
  /**
   * The Ollama cloud API key, read from the composer's vault on every call so a
   * key set in Settings applies without a restart. `null` when unset *or when
   * the vault refuses this app* — the cloud catalogue is then fetched unauthenticated.
   */
  cloudApiKey: () => Promise<string | null>;
};

/** The configured override (Theme C) wins; an unset override falls back to
 *  Theme B's env-only `resolveOllamaBaseUrl()`. */
export async function resolveOllamaHost(): Promise<string> {
  return (await getConfiguredOllamaHost()) ?? resolveOllamaBaseUrl();
}
const resolveHost = resolveOllamaHost;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const modelsMain = defineFeatureMain<ModelsMainServices>({
  feature: modelsManifest.feature,
  channels: modelsManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    configureOllamaPullQueue((event) => ctx.emit(EVENT_CHANNELS.ollamaPullProgress, event));

    // Plain data, never a `GitOpResult` — an unreachable daemon is an ordinary
    // state the Health page and Models view both render, not a failure.
    ipc.handleBare(CHANNELS.ollamaStatus, async () => {
      const host = await resolveHost();
      try {
        const version = await ollamaVersion({ baseUrl: host });
        return { reachable: true, version, host };
      } catch {
        return { reachable: false, version: null, host };
      }
    });

    ipc.handleBare(CHANNELS.ollamaList, async () => {
      try {
        const models = await ollamaTags({ baseUrl: await resolveHost() });
        // Phase 121 Theme I: a pinned model whose digest moved without a pull is a finding, raised here.
        void getOllamaDigestLedger()?.checkPinned(models).catch(() => undefined);
        return ok({ models });
      } catch (error) {
        return failure(errorMessage(error));
      }
    });

    ipc.handle(
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

    ipc.handleBare(CHANNELS.ollamaPs, async () => {
      try {
        return ok({ models: await ollamaPs({ baseUrl: await resolveHost() }) });
      } catch (error) {
        return failure(errorMessage(error));
      }
    });

    ipc.handle(
      CHANNELS.ollamaPull,
      schemas.OllamaPullRequest,
      async ({ model }) => ok(startOllamaPull(model, await resolveHost())),
      (issue) => failure(issue),
    );

    ipc.handle(
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

    ipc.handle(
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

    ipc.handle(
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

    ipc.handle(
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

    ipc.handleBare(CHANNELS.ollamaSettingsGet, async () => getOllamaSettings());

    ipc.handle(
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

    // --- search + cloud (Phase 96 Themes D, F) ---------------------------------

    ipc.handle(
      CHANNELS.ollamaSearch,
      schemas.OllamaSearchRequest,
      async ({ query, scope }) => searchOllamaLibrary(query, scope),
      (issue) => failure(issue),
    );

    ipc.handleBare(CHANNELS.ollamaCloudList, async () => {
      try {
        const apiKey = (await services.cloudApiKey()) ?? undefined;
        return ok({ models: await ollamaCloudTags({ apiKey }) });
      } catch (error) {
        return failure(errorMessage(error));
      }
    });

    ipc.handleBare(CHANNELS.ollamaSignInStatus, async () => {
      return { signedIn: await ollamaSignedIn({ baseUrl: await resolveHost() }) };
    });
  }
});
