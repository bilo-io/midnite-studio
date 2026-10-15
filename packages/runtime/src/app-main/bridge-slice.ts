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
