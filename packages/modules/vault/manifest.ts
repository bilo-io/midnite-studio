import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Vault module (Phase 124 Theme D). Pure data both halves read: it imports
 * `@midnite/studio-shared` and nothing else. Vanguard mounts it as one nav group
 * (glyph + label, its view beneath); `apps/vault` still composes it on its own until Theme H.
 */
export const vaultManifest = defineModuleManifest({
  module: 'vault',
  label: 'Vault',
  glyph: 'PiVaultFill',
  accent: '#6366f1',
  features: ['vault'],
  views: [
    {
      id: 'vault',
      // Global: the machine's, not one checkout's.
      global: true,
      rail: {
        group: 'workspace',
        label: 'Vault',
        description: 'Stored secrets, forge accounts, database logins and web-app sign-ins — set, rotate or remove, never read back',
      },
    },
  ],
});
