import { startupModuleMain, type StartupElectron } from '@midnite/studio-module-startup/main';
import { createIpcContext, mountModuleMains } from '@midnite/studio-runtime';

/** What Startup's host needs from Electron: the module's own port. */
export type StartupHostElectron = StartupElectron;

/**
 * Mounts the Startup host's one module through `mountModuleMains`, the registration path every module host
 * shares. Startup holds no secret, so there is no vault connection and no pairing. Report an Issue stays the
 * app's own (`report.ts`); the module registers none.
 */
export function registerStartupHost(el: StartupHostElectron): { dispose: () => Promise<void> } {
  mountModuleMains(createIpcContext(el), [{ module: startupModuleMain, services: { electron: el } }]);
  return { dispose: async () => undefined };
}
