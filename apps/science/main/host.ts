import { scienceModuleMain, type ShowOpenDialog } from '@midnite/studio-module-science/main';
import { createIpcContext, mountModuleMains, type IpcContextElectron, type ModuleMount } from '@midnite/studio-runtime';

export type ScienceHostElectron = IpcContextElectron & { userData: string; showOpenDialog: ShowOpenDialog };

/**
 * Mounts the Science host's modules (Phase 126 Theme A.4) through `mountModuleMains`. A list of one:
 * Phase 127 appends the Simulator mount and nothing else.
 */
export function registerScienceHost(el: ScienceHostElectron): void {
  const mounts: ModuleMount[] = [
    { module: scienceModuleMain, services: { userData: el.userData, showOpenDialog: el.showOpenDialog } },
  ];
  mountModuleMains(createIpcContext(el), mounts);
}
