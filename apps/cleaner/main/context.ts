import type { z } from 'zod';

import { optimizerMain } from '@midnite/studio-feature-optimizer/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { CLEANER_OPTIMIZER_SERVICES, NOT_PORTED } from './services';

/** The electron pieces Cleaner's main needs, injected so registration is testable under bare vitest. */
export type CleanerElectron = {
  ipcMain: { handle(channel: string, listener: (event: unknown, raw: unknown) => unknown): void };
  /** `shell.trashItem`. */
  trashItem(path: string): Promise<void>;
  /** The live window's `webContents.send`, or a no-op when there is none. */
  send(channel: string, payload: unknown): void;
  /** The native directory picker. */
  pickDirectory(): Promise<string | null>;
};

/** Builds the {@link FeatureMainContext}: payloads are zod-parsed before a feature sees them. */
export function createCleanerContext(el: CleanerElectron): FeatureMainContext {
  return {
    ipc: {
      handle<S extends z.ZodTypeAny, R>(
        channel: string,
        schema: S,
        handler: (payload: z.output<S>) => Promise<R> | R,
        onInvalid: (issue: string) => R,
      ) {
        el.ipcMain.handle(channel, async (_event, raw) => {
          const parsed = schema.safeParse(raw);
          if (!parsed.success) return onInvalid(`${channel}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
          return handler(parsed.data);
        });
      },
      handleBare<R>(channel: string, handler: () => Promise<R> | R) {
        el.ipcMain.handle(channel, () => handler());
      },
    },
    emit: (channel, payload) => el.send(channel, payload),
    trashItem: (path) => el.trashItem(path),
  };
}

/**
 * Registers every channel Cleaner's renderer can call: the optimizer feature's, plus the three
 * the feature leaves to its composer (the Trash pair, and the directory picker).
 */
export function registerCleanerHandlers(el: CleanerElectron): void {
  optimizerMain.register(createCleanerContext(el), CLEANER_OPTIMIZER_SERVICES);
  el.ipcMain.handle(CHANNELS.optimizerTrashSummary, () => ({ ok: false, message: NOT_PORTED }));
  el.ipcMain.handle(CHANNELS.optimizerTrashEmpty, () => ({ ok: false, message: NOT_PORTED }));
  el.ipcMain.handle(CHANNELS.repoPickDirectory, () => el.pickDirectory());
}
