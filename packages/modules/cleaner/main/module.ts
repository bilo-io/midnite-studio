import { optimizerMain } from '@midnite/studio-feature-optimizer/main';
import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { CLEANER_OPTIMIZER_SERVICES, NOT_PORTED } from './services';

/** What the host hands the Cleaner module: the native directory picker. */
export type CleanerModuleServices = {
  pickDirectory(): Promise<string | null>;
};

/**
 * The Cleaner module's main half (Phase 124 Theme D): the optimizer feature's channels, plus the
 * three the feature leaves to its composer — the Trash pair (not ported here) and the directory picker.
 */
export const cleanerModuleMain = defineFeatureMain<CleanerModuleServices>({
  feature: 'cleaner',
  channels: [...optimizerMain.channels, CHANNELS.optimizerTrashSummary, CHANNELS.optimizerTrashEmpty, CHANNELS.repoPickDirectory],
  register(ctx, services) {
    optimizerMain.register(ctx, CLEANER_OPTIMIZER_SERVICES);
    ctx.ipc.handleBare(CHANNELS.optimizerTrashSummary, () => ({ ok: false, message: NOT_PORTED }));
    ctx.ipc.handleBare(CHANNELS.optimizerTrashEmpty, () => ({ ok: false, message: NOT_PORTED }));
    ctx.ipc.handleBare(CHANNELS.repoPickDirectory, () => services.pickDirectory());
  },
});
