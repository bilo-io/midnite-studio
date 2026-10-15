import type { z } from 'zod';

import type { FeatureMainContext } from '../feature-main';

/**
 * The electron pieces an app's main hands the runtime, as injected shapes — the runtime
 * never imports `electron`, so this registers under bare vitest.
 */
export type IpcContextElectron = {
  ipcMain: { handle(channel: string, listener: (event: unknown, raw: unknown) => unknown): void };
  /** `shell.trashItem`. */
  trashItem(path: string): Promise<void>;
  /** The live window's `webContents.send`, or a no-op when there is none. */
  send(channel: string, payload: unknown): void;
};

/** Builds the {@link FeatureMainContext} every composed app hands its features: payloads are zod-parsed first. */
export function createIpcContext(el: IpcContextElectron): FeatureMainContext {
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
          if (!parsed.success) {
            return onInvalid(`${channel}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
          }
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
