import type { ComponentType } from 'react';

import type { VaultManifest } from '../manifest';

/**
 * The vault feature's renderer half (Phase 113 Theme J). The frame (bridge,
 * chrome port) and, since slice 3, the {@link VaultHostProvider} port: how the
 * composing app opens a web app, and Studio's forge-account kit for the
 * credential components its settings pages render.
 */
export { vaultManifest, type VaultManifest } from '../manifest';
export { vaultResponseSchemas } from '../response-schemas';
export {
  useVaultHost,
  VaultHostProvider,
  type VaultAddForgeAccount,
  type VaultAddForgeAccountInput,
  type VaultForgeKit,
  type VaultForgeProvider,
  type VaultHost,
  type VaultRemoveForgeAccount,
} from './host';

// The credential components Studio's settings pages render (slice 3): Settings ▸ Accounts' add form,
// remove button and note, and Settings ▸ Agent's write-only key field.
export { AgentKeyField } from './agent-key-field';
export { ForgeAccountAddForm, ForgeAccountRemoveButton, ForgeCredentialsNote } from './forge-account-credentials';
export { SecretMaskedValue, type SecretMaskedValueHandle, type SecretMaskedValueProps } from './secret-masked-value';

type ViewIds = VaultManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const vaultViews = {
  vault: () => import('./vault-page').then((m) => m.VaultPage),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
