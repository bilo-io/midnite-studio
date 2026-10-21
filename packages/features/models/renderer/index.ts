import type { ComponentType } from 'react';

import type { ModelsManifest } from '../manifest';

/**
 * The models feature's renderer half (Phase 113 Theme N). Needs the frame
 * (bridge, chrome port, empty states, spinners) and its own {@link ModelsHost}
 * for what differs per app: the modal and code preview, the repositories, and
 * the *optional* terminal — launching an agent on a model and running
 * `ollama serve` only exist where the app has a terminal to run them in.
 *
 * `sideEffects: false` keeps an app that imports only the hooks (the title
 * bar's Ollama chip, Settings ▸ Ollama) from pulling the view into its entry
 * chunk.
 */
export { modelsManifest, type ModelsManifest } from '../manifest';
export {
  ModelsHostProvider,
  useModelsHost,
  type ModelLaunchOverride,
  type ModelLaunchRequest,
  type ModelsCodePreviewProps,
  type ModelsHost,
  type ModelsModalProps,
  type ModelsTerminal,
} from './host';
export {
  launchOverrideFor,
  OLLAMA_OPTION_PREFIX,
  ollamaModelFromOption,
  ollamaOptionId,
  useOllamaLaunchFit,
  useOllamaLaunchOptions,
} from './launch-options';
export { useModelsPullQueueStore, type ModelsPullQueueState, type PullEntry } from './models-pull-queue-store';
export {
  useCreateModel,
  useDeleteModel,
  useOllamaApiKeyHasKey,
  useOllamaCloudList,
  useOllamaModels,
  useOllamaRunning,
  useOllamaSearch,
  useOllamaSettings,
  useOllamaShow,
  useOllamaSignInStatus,
  useOllamaStatus,
  usePullCancel,
  usePullModel,
  useRefetchModelsOnFocus,
  useRefetchModelsOnPullDone,
  useSetOllamaApiKey,
  useSetOllamaSettings,
  useUnloadModel,
  useVerifyPullTarget,
  type OllamaSearchQueryResult,
} from './use-models';

type ViewIds = ModelsManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const modelsViews = {
  models: () => import('./models-view').then((m) => m.ModelsView),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
