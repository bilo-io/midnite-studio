import { createReportBridge, type ReportBridge } from '@midnite/studio-feature-report/bridge';
import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Vanguard exposes — exactly what the Vanguard view and its settings
 * read, and nothing else: `vanguard.*` (findings, sensors, settings), the report feature's `report.*`, and
 * the Sessions guest's `terminal.list` plus a read-only `pty` (snapshot and stream — no `input`, `resize`,
 * `create` or `kill`: Vanguard renders untrusted evidence, so its renderer must never be able to type into a
 * terminal; "pause the session" is a main-side action over the broker, not a keystroke from here). Every other bridge namespace is deliberately absent, so a Vanguard renderer cannot reach git,
 * the vault or the browser even by accident (`bridge.test.ts` holds the list).
 */
export type VanguardBridge = {
  vanguard: MidniteStudioBridge['vanguard'];
  terminal: Pick<MidniteStudioBridge['terminal'], 'list'>;
  pty: Pick<
    MidniteStudioBridge['pty'],
    'snapshot' | 'subscribe' | 'unsubscribe' | 'onData' | 'onExit'
  >;
  /** Report an Issue — the report feature's own bridge half. */
  report: ReportBridge;
};

export type { RendererIpc };

export function createVanguardBridge(ipc: RendererIpc): VanguardBridge {
  const slice = createBridgeSlice(ipc);
  const { call, subscribe } = slice;
  return {
    vanguard: {
      findings: {
        list: (req) => call(CHANNELS.securityFindingsList, req),
        setStatus: (req) => call(CHANNELS.securityFindingsSetStatus, req),
        act: (req) => call(CHANNELS.securityFindingsAct, req),
        preview: (req) => call(CHANNELS.securityFindingsActPreview, req),
        onChanged: (handler) => subscribe(EVENT_CHANNELS.securityFindingsChanged, handler),
      },
      sensors: () => call(CHANNELS.vanguardSensors),
      runSensor: (req) => call(CHANNELS.vanguardSensorRun, req),
      settings: () => call(CHANNELS.vanguardSettingsGet),
      setSettings: (req) => call(CHANNELS.vanguardSettingsSet, req),
      viewOpened: () => call(CHANNELS.vanguardViewOpened),
      openQuarantine: () => call(CHANNELS.vanguardOpenQuarantine),
      responseState: () => call(CHANNELS.vanguardResponseState),
      connections: () => call(CHANNELS.vanguardConnections),
      malware: {
        status: () => call(CHANNELS.vanguardMalwareStatus),
        scan: (req) => call(CHANNELS.vanguardMalwareScan, req),
        cancel: () => call(CHANNELS.vanguardMalwareScanCancel),
      },
      onChanged: (handler) => subscribe(EVENT_CHANNELS.vanguardChanged, handler),
    },
    terminal: { list: () => call(CHANNELS.terminalList) },
    pty: ptySlice(slice),
    report: createReportBridge(slice),
  };
}

function ptySlice({
  call,
  send,
  subscribe,
}: ReturnType<typeof createBridgeSlice>): VanguardBridge['pty'] {
  return {
    snapshot: (req) => call(CHANNELS.ptySnapshot, req),
    subscribe: (req) => send(CHANNELS.ptySubscribe, req),
    unsubscribe: (req) => send(CHANNELS.ptyUnsubscribe, req),
    onData: (handler) => subscribe(EVENT_CHANNELS.ptyData, handler),
    onExit: (handler) => subscribe(EVENT_CHANNELS.ptyExit, handler),
  };
}
