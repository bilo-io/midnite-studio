import type { VaultHost } from '@midnite/studio-feature-vault/renderer';
import { WEB_APP_ROLE, type WebAppId } from '@midnite/studio-shared';

import { FORGE_PROVIDERS } from '../features/settings/settings-pages/forge-providers';
import { bridge } from '../services/bridge';
import { useAddForgeAccount, useRemoveForgeAccount } from '../services/queries';
import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the vault feature's host port (Phase 113 Theme J slice 3).
 *
 * - **`openWebApp`** is what the rail's own icon does (`web-apps-rail-row.tsx`'s click): a detached app's
 *   window is focused; otherwise the app is switched on if it was off (`enabledWebApps`, the persisted
 *   source of truth `use-web-apps-sync.ts` follows), its flyout opens, and main enables and activates its
 *   view — over its own, unchanged `persist:app-<id>` partition, where the user signs in.
 * - **`forge`** lends the credential half of Settings ▸ Accounts what it used before it moved into the
 *   vault feature: `forge-providers.ts`' rows and `queries.ts`' add/remove mutations, so a change still
 *   invalidates every forge-accounts query.
 */
function openWebApp(id: WebAppId): void {
  const ui = useUiStore.getState();
  if (ui.detachedWebApps.includes(id)) {
    useUiStore.setState({ lastOpenedWebAppId: id });
    bridge()?.window.focusRole({ role: WEB_APP_ROLE[id] });
    return;
  }
  if (!ui.enabledWebApps.includes(id)) ui.setWebAppEnabled(id, true);
  ui.openWebAppsFlyout(id);
  void bridge()
    ?.webApps.enable({ id })
    .then(() => bridge()?.webApps.activate({ id }));
}

export const STUDIO_VAULT_HOST: VaultHost = {
  openWebApp,
  forge: {
    providers: FORGE_PROVIDERS,
    useAddAccount: useAddForgeAccount,
    useRemoveAccount: useRemoveForgeAccount,
  },
};
