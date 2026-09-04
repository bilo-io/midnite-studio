import { ipcMain, type BrowserWindow } from 'electron';
import type { z } from 'zod';

import { failure, type GitOpResult } from '@midnite/studio-shared';

import { resolveWindow } from '../window-manager';

/**
 * Register an `invoke` handler that validates its payload before doing anything.
 *
 * The renderer is a separate process. contextIsolation stops a page script
 * reaching into main directly, but everything that *does* cross is still
 * attacker-shaped input as far as main is concerned — and half these payloads
 * end up as arguments to a git process. Parsing at the boundary is what makes
 * the handler bodies allowed to assume their inputs.
 *
 * Validation failures resolve rather than reject: an exception crossing
 * `ipcRenderer.invoke` arrives in the renderer as an opaque
 * "Error invoking remote method …" string with the real cause gone.
 */
export function handle<S extends z.ZodTypeAny, R>(
  channel: string,
  schema: S,
  handler: (payload: z.output<S>) => Promise<R> | R,
  onInvalid: (issue: string) => R,
): void {
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return onInvalid(`${channel}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
    }
    return handler(parsed.data);
  });
}

/**
 * The common case: a handler returning `GitOpResult`, where an invalid payload
 * is just another error the UI renders.
 */
export function handleOp<S extends z.ZodTypeAny>(
  channel: string,
  schema: S,
  handler: (payload: z.output<S>) => Promise<GitOpResult>,
): void {
  handle<S, GitOpResult>(channel, schema, handler, (issue) => failure(issue));
}

/** A handler taking no payload. */
export function handleBare<R>(channel: string, handler: () => Promise<R> | R): void {
  ipcMain.handle(channel, () => handler());
}

/**
 * Like {@link handle}, but also resolves the `BrowserWindow` that sent the
 * call (Phase 55) — for the handful of handlers where two windows can
 * legitimately ask for different answers. `resolveWindow` returns `null` for
 * a webContents Electron cannot map back to a window (a destroyed window
 * mid-teardown); handlers treat that the same as no window at all.
 */
export function handleFromSender<S extends z.ZodTypeAny, R>(
  channel: string,
  schema: S,
  handler: (payload: z.output<S>, win: BrowserWindow | null) => Promise<R> | R,
  onInvalid: (issue: string) => R,
): void {
  ipcMain.handle(channel, async (event, raw: unknown) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return onInvalid(`${channel}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
    }
    return handler(parsed.data, resolveWindow(event.sender));
  });
}
