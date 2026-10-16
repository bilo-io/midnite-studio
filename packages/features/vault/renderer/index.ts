import type { ComponentType } from 'react';

import type { VaultManifest } from '../manifest';

/**
 * The vault feature's renderer half (Phase 113 Theme J). Needs only the frame
 * (bridge, chrome port) — no host port, it owns no app state.
 */
export { vaultManifest, type VaultManifest } from '../manifest';
export { vaultResponseSchemas } from '../response-schemas';

type ViewIds = VaultManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const vaultViews = {
  vault: () => import('./vault-page').then((m) => m.VaultPage),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
