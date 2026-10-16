import { DbLoginsSection } from './db-logins-section';
import { ForgeAccountsSection } from './forge-accounts-section';
import { GrantsSection } from './grants-section';
import { SecretsSection } from './secrets-section';

/**
 * The Vault view (Phase 113 Theme J): what is stored — never what it is.
 * Secrets, forge accounts and database logins are listed as metadata; a value
 * can be written or removed here and is never read back.
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
      <GrantsSection />
      <section aria-labelledby="vault-later" className="rounded-lg border border-border p-4">
        <h2 id="vault-later" className="mb-1 text-sm font-medium">Not in the vault yet</h2>
        <p className="text-xs text-muted-foreground">
          Web-app sign-ins live in the browser&apos;s own partitions, not in the vault, so they are not listed here.
        </p>
      </section>
    </div>
  );
}
