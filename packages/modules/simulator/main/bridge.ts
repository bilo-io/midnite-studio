import type { RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';

/**
 * The slice of `window.midniteStudio` the Simulator module adds. Empty until Theme F's `simulator` channel.
 * No `report` here: the host's other module already carries Report an Issue, and `unionBridgeSlices` must not
 * see the key twice.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type SimulatorAppBridge = {};

export type { RendererIpc };

export function createSimulatorBridge(_ipc: RendererIpc): SimulatorAppBridge {
  return {};
}
