import { scienceModuleMain, type ShowOpenDialog } from '@midnite/studio-module-science/main';
import { simulatorModuleMain } from '@midnite/studio-module-simulator/main';
import { createIpcContext, mountModuleMains, type IpcContextElectron, type ModuleMount } from '@midnite/studio-runtime';

export type ScienceHostElectron = IpcContextElectron & { userData: string; showOpenDialog: ShowOpenDialog };

/**
 * Mounts the Science host's modules (Phase 126 Theme A.4, Phase 127 Theme A.4) through `mountModuleMains`:
 * Science, then Simulator.
 */
export function registerScienceHost(el: ScienceHostElectron): void {
  const mounts: ModuleMount[] = [
    { module: scienceModuleMain, services: { userData: el.userData, showOpenDialog: el.showOpenDialog } },
    { module: simulatorModuleMain, services: { userData: el.userData } },
  ];
  mountModuleMains(createIpcContext(el), mounts);
}
