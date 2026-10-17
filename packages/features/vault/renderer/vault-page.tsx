import { DbLoginsSection } from './db-logins-section';
import { ForgeAccountsSection } from './forge-accounts-section';
import { GrantsSection } from './grants-section';
import { PairingSection } from './pairing-section';
import { SecretsSection } from './secrets-section';
import { WebAppSignInsSection } from './web-app-sign-ins-section';

/**
 * The Vault view (Phase 113 Theme J): what is stored — never what it is.
 * Secrets, forge accounts, database logins and web-app sign-ins are listed as
 * metadata; a value can be written or removed here and is never read back. A
 * web app's sign-in is never in the vault at all — it lives in the app's own
 * browser partition, which the section reads as a cookie count and site names.
 */
export function VaultPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-lg font-semibold">Vault</h1>
        <p className="text-xs text-muted-foreground">Stored credentials. Values are encrypted and never shown.</p>
      </header>
      <SecretsSection />
      <ForgeAccountsSection />
      <DbLoginsSection />
      <WebAppSignInsSection />
      <GrantsSection />
      <PairingSection />
    </div>
  );
}
