import { healthModuleMain, type ShowSaveDialog } from '@midnite/studio-module-health/main';
import { createIpcContext, mountModuleMains, type IpcContextElectron, type ModuleMount } from '@midnite/studio-runtime';

export type HealthHostElectron = IpcContextElectron & { userData: string; showSaveDialog: ShowSaveDialog };

/**
 * Mounts the Health host's modules (Phase 128 Theme A.4) through `mountModuleMains`. A list of one:
 * Health is a one-module host.
 */
export function registerHealthHost(el: HealthHostElectron): void {
  const mounts: ModuleMount[] = [
    { module: healthModuleMain, services: { userData: el.userData, showSaveDialog: el.showSaveDialog } },
  ];
  mountModuleMains(createIpcContext(el), mounts);
}
