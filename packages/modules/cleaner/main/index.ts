// The Cleaner module's main half (Phase 124 Theme D). Never imports `electron`: the host injects it.
export { createCleanerBridge, type CleanerBridge, type RendererIpc } from './bridge';
export { registerCleanerHandlers, type CleanerElectron } from './context';
export { cleanerModuleMain, type CleanerModuleServices } from './module';
export { CLEANER_OPTIMIZER_SERVICES, NOT_PORTED } from './services';
export { cleanerManifest } from '../manifest';
