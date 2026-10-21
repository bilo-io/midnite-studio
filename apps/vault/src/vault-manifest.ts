import { vaultManifest } from '@midnite/studio-feature-vault/renderer';

/**
 * Vault's app manifest — pure data (Phase 113 Theme J).
 *
 * `accent` matches the launcher catalog's `vault` tile; the glyph is the
 * catalog's too (`PiVaultFill`, rendered by the home view and baked into
 * `resources/icon.icns` by the launcher's `scripts/app-icons.cjs`). `home` is the one view
 * Vault opens on.
 */
export const VAULT_APP = {
  id: 'vault',
  name: 'Midnite Vault',
  tagline: 'Secrets and credentials for every app',
  accent: '#6366f1',
  home: 'vault',
  features: [vaultManifest.feature],
} as const;

export type VaultApp = typeof VAULT_APP;
