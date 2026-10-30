// The Vault module's renderer half: the vault feature composed over the frame (Phase 124 Theme D).
// Never import an app, another module, `packages/app` or `electron`.
export { VaultApp } from './vault-app';
export { VaultPane } from './vault-pane';
export { VAULT_NAV_GROUP, VAULT_APP, type VaultApp as VaultAppManifest } from './vault-manifest';
export { VaultHome } from './views/vault-home';
export { VAULT_CHROME } from './compose/vault-chrome';
export { vaultManifest } from '../manifest';
