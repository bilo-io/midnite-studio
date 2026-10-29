import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { VaultHostProvider } from '@midnite/studio-feature-vault/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';

import { VAULT_CHROME, VaultDialogHost } from './compose/vault-chrome';
import { VAULT_APP_HOST } from './compose/vault-host';
import { VaultHome } from './views/vault-home';

/**
 * Midnite Vault — the vault feature composed over the frame as its own app.
 * The frame chrome, and the feature's host port with nothing to lend: no web
 * apps to open and no forge kit (`compose/vault-host.ts`).
 */
export function VaultApp() {
  return (
    <FrameChromeProvider chrome={VAULT_CHROME}>
      <VaultHostProvider host={VAULT_APP_HOST}>
        <VaultHome />
      </VaultHostProvider>
      <VaultDialogHost />
      <ReportIssueHost app="midnite-vault" />
    </FrameChromeProvider>
  );
}
