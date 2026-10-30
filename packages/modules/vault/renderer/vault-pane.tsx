import { VaultHostProvider } from '@midnite/studio-feature-vault/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';

import { VAULT_CHROME, VaultDialogHost } from './compose/vault-chrome';
import { VAULT_APP_HOST } from './compose/vault-host';
import { VaultHome } from './views/vault-home';

/**
 * Vault as a pane inside a host's shell (Phase 124 Theme E.3): its chrome and host port, the view without its
 * own app header (the host's rail names it), and no `ReportIssueHost` — the host owns the one menu entry.
 */
export function VaultPane() {
  return (
    <FrameChromeProvider chrome={VAULT_CHROME}>
      <VaultHostProvider host={VAULT_APP_HOST}>
        <VaultHome embedded />
      </VaultHostProvider>
      <VaultDialogHost />
    </FrameChromeProvider>
  );
}
