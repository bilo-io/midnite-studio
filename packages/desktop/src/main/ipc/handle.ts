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

/**
 * The `ipcMain.on` counterpart to {@link handle} — Phase 65 Theme B.
 *
 * Forty one-way channels in this app hand-roll their own `safeParse` because
 * this helper did not exist. It does now; only Phase 65's own channel is
 * migrated onto it, since converting the rest is a mechanical sweep with no
 * behaviour change that would bury the phase it landed in.
 *
 * Two things differ from `handle`, and both follow from there being no reply.
 * `onInvalid` cannot return a value to the caller, so it is a *reporting* hook
 * rather than a fallback — what a caller does with it is a per-channel
 * decision, and this phase's is "log it, because a payload malformed enough to
 * fail `safeParse` is itself evidence of the bug being reported". And the
 * handler is wrapped: an exception thrown out of an `ipcMain.on` listener is an
 * uncaught exception in the main process, where `handle`'s would merely reject
 * a promise.
 */
export function handleSend<S extends z.ZodTypeAny>(
  channel: string,
  schema: S,
  handler: (payload: z.output<S>) => void,
  onInvalid: (issue: string) => void,
): void {
  ipcMain.on(channel, (_event, raw: unknown) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      onInvalid(`${channel}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
      return;
    }
    try {
      handler(parsed.data);
    } catch (error) {
      onInvalid(`${channel}: handler threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
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
