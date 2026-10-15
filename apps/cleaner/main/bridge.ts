import { CHANNELS, EVENT_CHANNELS, type MidniteStudioBridge, type Unsubscribe } from '@midnite/studio-shared';

/**
 * The slice of `window.midniteStudio` Cleaner exposes — exactly what the optimizer renderer and
 * the frame's metrics stream read, and nothing else: `optimizer.*`, `metrics.*` and
 * `repos.pickDirectory`. Every other bridge namespace is deliberately absent, so a Cleaner
 * renderer cannot reach git, the pty or the browser even by accident (`bridge-surface.test.ts`
 * holds the list).
 */
export type CleanerBridge = {
  optimizer: MidniteStudioBridge['optimizer'];
  metrics: MidniteStudioBridge['metrics'];
  repos: Pick<MidniteStudioBridge['repos'], 'pickDirectory'>;
};

/** The `ipcRenderer` members the bridge uses — injected so the shape is testable without electron. */
export type RendererIpc = {
  invoke(channel: string, req?: unknown): Promise<unknown>;
  send(channel: string, req?: unknown): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- electron's own listener signature
  on(channel: string, listener: (event: any, ...args: any[]) => void): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- electron's own listener signature
  removeListener(channel: string, listener: (event: any, ...args: any[]) => void): unknown;
};

export function createCleanerBridge(ipc: RendererIpc): CleanerBridge {
  const call = <Req, Res>(channel: string, req?: Req): Promise<Res> => ipc.invoke(channel, req) as Promise<Res>;
  // Every subscription returns its teardown — StrictMode double-mounts otherwise stack listeners.
  const subscribe = <T>(channel: string, handler: (payload: T) => void): Unsubscribe => {
    const listener = (_event: unknown, payload: T): void => handler(payload);
    ipc.on(channel, listener);
    return () => void ipc.removeListener(channel, listener);
  };
  return {
    optimizer: {
      scan: (req) => call(CHANNELS.optimizerScan, req),
      onScanProgress: (handler) => subscribe(EVENT_CHANNELS.optimizerScanProgress, handler),
      clean: (req) => call(CHANNELS.optimizerClean, req),
      processes: () => call(CHANNELS.optimizerProcesses),
      kill: (req) => call(CHANNELS.optimizerKill, req),
      gpu: () => call(CHANNELS.optimizerGpu),
      trashSummary: () => call(CHANNELS.optimizerTrashSummary),
      emptyTrash: () => call(CHANNELS.optimizerTrashEmpty),
      systemCatalogue: () => call(CHANNELS.optimizerSystemCatalogue),
      systemScan: (req) => call(CHANNELS.optimizerSystemScan, req),
      onSystemScanProgress: (handler) => subscribe(EVENT_CHANNELS.optimizerSystemScanProgress, handler),
      systemClean: (req) => call(CHANNELS.optimizerSystemClean, req),
      systemReclaim: (req) => call(CHANNELS.optimizerSystemReclaim, req),
    },
    metrics: {
      start: (req) => ipc.send(CHANNELS.metricsStart, req),
      stop: () => ipc.send(CHANNELS.metricsStop),
      onSample: (handler) => subscribe(EVENT_CHANNELS.metricsSample, handler),
    },
    repos: { pickDirectory: () => call(CHANNELS.repoPickDirectory) },
  };
}
