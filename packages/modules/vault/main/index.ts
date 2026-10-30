// The Vault module's main half (Phase 124 Theme D). Never imports `electron`: the host injects it.
export { createVaultBridge, type RendererIpc, type VaultBridge } from './bridge';
export { prepareVault, registerVaultHandlers, type VaultElectron } from './context';
export { vaultModuleMain } from './module';
export { vaultManifest } from '../manifest';
