import { createSculptHost } from './sculpt-host';
import type { SculptRequest } from './sculpt-protocol';

/** The sculpt worker (Phase 104 Theme A): `sculpt-host.ts` bound to the worker's global scope. */
// Typed structurally rather than with `lib: webworker`, which would retype the whole app's globals.
const scope = self as unknown as {
  postMessage: (message: unknown, transfer: Transferable[]) => void;
  onmessage: ((event: MessageEvent<SculptRequest>) => void) | null;
};

const host = createSculptHost((message, transfer) => scope.postMessage(message, transfer ?? []));
scope.onmessage = (event) => host(event.data);
