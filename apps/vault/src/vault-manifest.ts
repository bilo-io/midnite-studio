import { vaultManifest } from '@midnite/studio-feature-vault/renderer';
import type { NavConfig } from '@midnite/studio-frame';
import { LuKeyRound } from 'react-icons/lu';

/**
 * The shell's rail (Phase 123 Theme B): its one view (Settings sits below it, so the rail is never one
 * item). Settings is never listed — `AppShell` puts it at the rail's foot. `panels` is absent, so the
 * app carries every panel (decision 12).
 */
const VAULT_NAV: NavConfig = {
  views: [
    { id: 'vault', label: 'Vault', icon: LuKeyRound },
  ],
};

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
  nav: VAULT_NAV,
} as const;

export type VaultApp = typeof VAULT_APP;
