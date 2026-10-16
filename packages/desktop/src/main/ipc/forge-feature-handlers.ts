import { listRemotes } from '@midnite/studio-git-engine';
import { createForgePoller, forgeMain, type ForgePoller } from '@midnite/studio-feature-forge/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { BrowserWindow } from 'electron';

import { defaultLogger } from '../log';
import { resolveWorkdir } from '../repo-registry';
import { currentSettings } from '../settings-mirror';
import { broadcastToWindowsOnRepo } from '../window-manager';
import { anyWindowVisible, systemIdleState } from '../window-visibility-gate';
import { handle, handleBare, handleSend, handleSendFromSender } from './handle';

/**
 * Studio's composition of the forge feature's main half (Phase 113 Theme O).
 * The providers, the account registry, the poller and every forge channel live
 * in `@midnite/studio-feature-forge/main`; this file hands it what only Studio
 * has — its repo registry (a repo's remotes come from git, over the registry's
 * workdir), the settings mirror, and its windows.
 */

/** The one poller for the whole process — the workflow trigger scheduler subscribes onto it too. */
export function createStudioForgePoller(): ForgePoller {
  return createForgePoller(defaultLogger, {
    anyWindowVisible,
    idleState: systemIdleState,
    broadcastOnRepo: broadcastToWindowsOnRepo,
  });
}

export function registerForgeFeatureHandlers(poller: ForgePoller): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: () => undefined,
    trashItem: () => Promise.reject(new Error('the forge never trashes')),
  };
  forgeMain.register(ctx, {
    remotes: async (repoId) => {
      const cwd = await resolveWorkdir(repoId);
      return cwd ? listRemotes(cwd) : null;
    },
    // `!== false`: the field is optional on the wire so an older payload that
    // never set it still means "on", the default everywhere else it is declared.
    syncGhAuthSwitch: () => currentSettings().forgeSyncGhAuthSwitch !== false,
    poll: {
      poller,
      subscriptions: {
        sendFromSender: (channel, schema, handler, onInvalid) =>
          handleSendFromSender(channel, schema, (payload, win) => handler(payload, win?.id ?? null), onInvalid),
        onWindowClosed: (windowId, fn) => BrowserWindow.fromId(windowId)?.once('closed', fn),
        warn: (message) => defaultLogger.warn(message),
      },
    },
  });
}
