// The Accountant module's main half (Phase 129). Never imports `electron`: the host injects it.
export { createAccountantBridge, type AccountantBridge, type RendererIpc } from './bridge';
export { createAccountantServices, type AccountantElectron } from './context';
export { accountantModuleMain } from './module';
export { accountantManifest } from '../manifest';
