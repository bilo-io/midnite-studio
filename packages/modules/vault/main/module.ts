import { vaultMain, type VaultMainServices } from '@midnite/studio-feature-vault/main';
import { defineFeatureMain } from '@midnite/studio-runtime';

/**
 * The Vault module's main half (Phase 124 Theme D), on the same seam a feature uses so a host can
 * mount it through `mountModuleMains`. It registers the vault feature's metadata-only channels over
 * whatever vault client the host passes (a runtime-host guest in an app) — it holds no cipher.
 */
export const vaultModuleMain = defineFeatureMain<VaultMainServices>({
  feature: 'vault',
  channels: vaultMain.channels,
  register: (ctx, services) => vaultMain.register(ctx, services),
});
