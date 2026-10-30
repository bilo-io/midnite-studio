/** The `ipcRenderer` members a preload bridge uses — injected so the shape is testable without electron. */
export type RendererIpc = {
  invoke(channel: string, req?: unknown): Promise<unknown>;
  send(channel: string, req?: unknown): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- electron's own listener signature
  on(channel: string, listener: (event: any, ...args: any[]) => void): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- electron's own listener signature
  removeListener(channel: string, listener: (event: any, ...args: any[]) => void): unknown;
};

export type BridgeSlice = {
  /** `invoke` a channel and await its result. */
  call<Req, Res>(channel: string, req?: Req): Promise<Res>;
  /** Fire-and-forget to main. */
  send(channel: string, req?: unknown): void;
  /** Listen to an event channel; the returned teardown removes exactly this listener. */
  subscribe<T>(channel: string, handler: (payload: T) => void): () => void;
};

/**
 * The three helpers an app's preload bridge is written with, so it only lists channels.
 * Every subscription returns its teardown — StrictMode double-mounts otherwise stack listeners.
 */
export function createBridgeSlice(ipc: RendererIpc): BridgeSlice {
  return {
    call: <Req, Res>(channel: string, req?: Req): Promise<Res> =>
      ipc.invoke(channel, req) as Promise<Res>,
    send: (channel, req) => ipc.send(channel, req),
    subscribe: <T>(channel: string, handler: (payload: T) => void) => {
      const listener = (_event: unknown, payload: T): void => handler(payload);
      ipc.on(channel, listener);
      return () => void ipc.removeListener(channel, listener);
    },
  };
}

const isNamespace = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The union of several modules' bridge slices, for a host that mounts more than one (Phase 124 Theme E.3).
 *
 * Namespaces merge key by key, so two slices that each expose part of one (`terminal.list` from one, more of
 * `terminal` from another) end up with both halves. Where two slices define the same leaf — every module
 * carries its own `report` bridge over the same channels — the **first** wins: the leaves are interchangeable
 * because they call the same channel, and the host's own module is passed first.
 */
export function unionBridgeSlices<T extends object>(...slices: readonly object[]): T {
  const out: Record<string, unknown> = {};
  for (const slice of slices) mergeInto(out, slice as Record<string, unknown>);
  return out as T;
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (existing === undefined) target[key] = isNamespace(value) ? cloneNamespace(value) : value;
    else if (isNamespace(existing) && isNamespace(value)) mergeInto(existing, value);
  }
}

function cloneNamespace(value: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  mergeInto(copy, value);
  return copy;
}
