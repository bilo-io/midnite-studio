import { createRecordingContext, type RuntimeIpc } from '@midnite/studio-runtime';

/** A registered handler, invoked the way `ipcMain` would: `(event, payload)`. */
export type CapturedHandler = (event: unknown, payload?: unknown) => Promise<unknown>;

/**
 * For the handler tests only: a runtime `RuntimeIpc` (zod-parsing, like every
 * composer's) that also records each channel into `into`, so a test calls
 * `into.get(channel)!(event, payload)` exactly as it did against a captured
 * `ipcMain.handle` before the handlers moved into this feature.
 */
export function capturingIpc(into: Map<string, CapturedHandler>): RuntimeIpc {
  const ctx = createRecordingContext();
  const capture = (channel: string): void => {
    into.set(channel, (_event, payload) => ctx.invoke(channel, payload));
  };
  return {
    handle(channel, schema, handler, onInvalid) {
      ctx.ipc.handle(channel, schema, handler, onInvalid);
      capture(channel);
    },
    handleBare(channel, handler) {
      ctx.ipc.handleBare(channel, handler);
      capture(channel);
    },
    send(channel, schema, handler, onInvalid) {
      ctx.ipc.send(channel, schema, handler, onInvalid);
      capture(channel);
    },
  };
}
