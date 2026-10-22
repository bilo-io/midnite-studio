import { createReportBridge, type ReportBridge } from '@midnite/studio-feature-report/bridge';
import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Vanguard exposes — exactly what the Vanguard view and its settings
 * read, and nothing else: `vanguard.*` (findings, sensors, settings), the report feature's `report.*`, and
 * the Sessions guest's `terminal.list` plus an attach-only `pty` (snapshot, stream, input, resize — no
 * `create`, no `kill`: Vanguard starts nothing, and a pause is a keystroke into a session it did not
 * start). Every other bridge namespace is deliberately absent, so a Vanguard renderer cannot reach git,
 * the vault or the browser even by accident (`bridge.test.ts` holds the list).
 */
export type VanguardBridge = {
  vanguard: MidniteStudioBridge['vanguard'];
  terminal: Pick<MidniteStudioBridge['terminal'], 'list'>;
  pty: Pick<MidniteStudioBridge['pty'], 'snapshot' | 'input' | 'resize' | 'subscribe' | 'unsubscribe' | 'onData' | 'onExit'>;
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
        onChanged: (handler) => subscribe(EVENT_CHANNELS.securityFindingsChanged, handler),
      },
      sensors: () => call(CHANNELS.vanguardSensors),
      runSensor: (req) => call(CHANNELS.vanguardSensorRun, req),
      settings: () => call(CHANNELS.vanguardSettingsGet),
      setSettings: (req) => call(CHANNELS.vanguardSettingsSet, req),
      viewOpened: () => call(CHANNELS.vanguardViewOpened),
      openQuarantine: () => call(CHANNELS.vanguardOpenQuarantine),
      onChanged: (handler) => subscribe(EVENT_CHANNELS.vanguardChanged, handler),
    },
    terminal: { list: () => call(CHANNELS.terminalList) },
    pty: ptySlice(slice),
    report: createReportBridge(slice),
  };
}

function ptySlice({ call, send, subscribe }: ReturnType<typeof createBridgeSlice>): VanguardBridge['pty'] {
  return {
    snapshot: (req) => call(CHANNELS.ptySnapshot, req),
    input: (req) => send(CHANNELS.ptyInput, req),
    resize: (req) => send(CHANNELS.ptyResize, req),
    subscribe: (req) => send(CHANNELS.ptySubscribe, req),
    unsubscribe: (req) => send(CHANNELS.ptyUnsubscribe, req),
    onData: (handler) => subscribe(EVENT_CHANNELS.ptyData, handler),
    onExit: (handler) => subscribe(EVENT_CHANNELS.ptyExit, handler),
  };
}
