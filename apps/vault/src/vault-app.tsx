import { FrameChromeProvider } from '@midnite/studio-frame';

import { VAULT_CHROME, VaultDialogHost } from './compose/vault-chrome';
import { VaultHome } from './views/vault-home';

/**
 * Midnite Vault — the vault feature composed over the frame as its own app.
 * The feature needs no host port (it owns no app state), only the frame chrome.
 */
export function VaultApp() {
  return (
    <FrameChromeProvider chrome={VAULT_CHROME}>
      <VaultHome />
      <VaultDialogHost />
    </FrameChromeProvider>
  );
}
