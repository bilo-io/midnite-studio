import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { SimulatorBridge } from '@midnite/studio-shared';
import { CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` the Simulator module adds: the scenario channel. No `report` here: the
 * host's other module already carries Report an Issue, and `unionBridgeSlices` must not see the key twice.
 */
export type SimulatorAppBridge = {
  /** Scenarios — one channel, one method per `op` (Phase 127 Theme F). */
  simulator: SimulatorBridge;
};

export type { RendererIpc };

export function createSimulatorBridge(ipc: RendererIpc): SimulatorAppBridge {
  const { call } = createBridgeSlice(ipc);
  return {
    simulator: {
      list: (req) => call(CHANNELS.simulator, { op: 'list', ...req }),
      read: (req) => call(CHANNELS.simulator, { op: 'read', ...req }),
      save: (req) => call(CHANNELS.simulator, { op: 'save', ...req }),
      rename: (req) => call(CHANNELS.simulator, { op: 'rename', ...req }),
      remove: (req) => call(CHANNELS.simulator, { op: 'remove', ...req }),
    },
  };
}
