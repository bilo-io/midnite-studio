import type { z } from 'zod';

/**
 * The contract a feature's main half is registered against — Phase 113
 * Theme C.
 *
 * A feature package (`packages/features/<name>/main/`) owns its IPC handlers,
 * but it never touches `ipcMain`, a `BrowserWindow` or `electron.shell`
 * itself. It is handed a {@link FeatureMainContext} by whoever composes it —
 * today Studio's `packages/desktop`, from Theme D on the runtime daemon — and
 * registers through that. Two things follow:
 *
 * - **A feature's main half runs under bare vitest.** Nothing in it imports
 *   `electron`, so its tests register against {@link createRecordingContext}
 *   and invoke handlers directly, without mocking a module.
 * - **The composer keeps the trust boundary.** `ipc.handle` is desktop's
 *   `ipc/handle.ts` helper — payloads are zod-parsed before a feature sees
 *   them, exactly as for every other channel — so moving a handler into a
 *   feature package cannot quietly skip validation.
 *
 * The surface is deliberately the smallest one the first feature (optimizer)
 * needs. Add a member when a feature needs it, not before: every member is a
 * promise every composer has to keep.
 */

/** IPC registration, mirroring desktop's `ipc/handle.ts` `handle`/`handleBare`. */
export interface RuntimeIpc {
  /** An `invoke` handler whose payload is parsed by `schema` first; `onInvalid` answers a bad one. */
  handle<S extends z.ZodTypeAny, R>(
    channel: string,
    schema: S,
    handler: (payload: z.output<S>) => Promise<R> | R,
    onInvalid: (issue: string) => R,
  ): void;
  /** An `invoke` handler that takes no payload. */
  handleBare<R>(channel: string, handler: () => Promise<R> | R): void;
}

export interface FeatureMainContext {
  ipc: RuntimeIpc;
  /**
   * Push an event to the feature's window — a no-op when it is gone. Today
   * that is Studio's main window; once apps run as their own processes it is
   * the window of the app that composed the feature.
   */
  emit(channel: string, payload: unknown): void;
  /** Move a path to the OS Trash (`electron.shell.trashItem` in a real composer). */
  trashItem(path: string): Promise<void>;
}

/**
 * A feature's main half: the channels it promises to register, and the
 * function that registers them. `services` is the feature's own port — the
 * implementations it needs that have not moved into its package yet — so a
 * feature can land before every service under it does.
 */
export interface FeatureMainModule<Services> {
  /** The placement-map folder this module belongs to. */
  feature: string;
  /** Every `invoke` channel `register` installs, for the composer and tests to check. */
  channels: readonly string[];
  register(ctx: FeatureMainContext, services: Services): void;
}

/** Identity helper that pins a module to the {@link FeatureMainModule} shape. */
export function defineFeatureMain<Services>(module: FeatureMainModule<Services>): FeatureMainModule<Services> {
  return module;
}
