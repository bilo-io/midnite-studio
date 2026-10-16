import { Suspense, lazy } from 'react';
import { PiVaultFill } from 'react-icons/pi';

import { vaultViews } from '@midnite/studio-feature-vault/renderer';

import { VAULT_APP } from '../vault-manifest';

// The feature's one view, kept in its own lazy chunk as the feature intends.
const VaultPage = lazy(() => vaultViews.vault().then((component) => ({ default: component })));

/** What Vault shows on open: the accent mark and name on top, the feature's view below. */
export function VaultHome() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: VAULT_APP.accent }}
        >
          <PiVaultFill className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">{VAULT_APP.name}</p>
      </header>
      <main className="min-h-0 flex-1 overflow-auto" aria-label="Vault">
        <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading the vault…</p>}>
          <VaultPage />
        </Suspense>
      </main>
    </div>
  );
}
