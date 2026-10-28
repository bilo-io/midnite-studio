import { bridge } from '@midnite/studio-frame';
import { useCallback, useEffect, useState } from 'react';
import { LuKey, LuLock, LuLockOpen, LuTriangleAlert } from 'react-icons/lu';

import { AuditSection } from './audit-section';
import { DbLoginsSection } from './db-logins-section';
import { ExportSection } from './export-section';
import { ForgeAccountsSection } from './forge-accounts-section';
import { GrantsSection } from './grants-section';
import { PairingSection } from './pairing-section';
import { SecretScanSection } from './secret-scan-section';
import { SecretsSection } from './secrets-section';
import { WebAppSignInsSection } from './web-app-sign-ins-section';

/**
 * The Vault view (Phase 113 Theme J, Phase 118 Security Hardening): what is stored — never what it is.
 * Secrets, forge accounts, database logins and web-app sign-ins are listed as
 * metadata; a value can be written or removed here and is never read back. A
 * web app's sign-in is never in the vault at all — it lives in the app's own
 * browser partition, which the section reads as a cookie count and site names.
 */
export function VaultPage() {
  const [locked, setLocked] = useState<boolean>(false);
  const [hasPasscode, setHasPasscode] = useState<boolean>(false);
  const [canTouchId, setCanTouchId] = useState<boolean>(false);
  const [recentUnlockAt, setRecentUnlockAt] = useState<number | null>(null);
  const [tamperedFile, setTamperedFile] = useState<string | null>(null);
  const [passcodeDraft, setPasscodeDraft] = useState<string>('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const refreshLock = useCallback(async () => {
    const api = bridge()?.vaultLock;
    if (!api) return;
    try {
      const res = await api.status({});
      setLocked(res.locked);
      setHasPasscode(res.hasPasscode);
      setCanTouchId(res.canPromptTouchId);
      setRecentUnlockAt(res.recentUnlockAt);
      setTamperedFile(res.tamperedFile ?? null);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    void refreshLock();
    const interval = setInterval(() => void refreshLock(), 5000);
    return () => clearInterval(interval);
  }, [refreshLock]);

  const handleLock = async () => {
    await bridge()?.vaultLock?.lock({});
    await refreshLock();
  };

  const handleUnlock = async (useTouchId = false) => {
    setUnlockError(null);
    try {
      const res = await bridge()?.vaultLock?.unlock({
        passcode: passcodeDraft || undefined,
        useTouchId,
      });
      if (res?.ok) {
        setPasscodeDraft('');
        await refreshLock();
      } else {
        setUnlockError(res?.error ?? 'Unlock failed');
      }
    } catch (e) {
      setUnlockError(e instanceof Error ? e.message : 'Unlock failed');
    }
  };

  const isReauthActive =
    !locked && recentUnlockAt !== null && Date.now() - recentUnlockAt <= 60_000;

  return (
    // The view root owns the scroll, so it works under any host (Studio's view slot clips overflow).
    <div className="h-full min-h-0 w-full overflow-y-auto" data-testid="vault-scroll">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">Vault</h1>
              {locked ? (
                <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400">
                  <LuLock className="size-3" />
                  Locked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  <LuLockOpen className="size-3" />
                  Unlocked
                </span>
              )}
              {isReauthActive ? (
                <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400">
                  Re-auth active (&le;60s)
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Stored credentials. Values are encrypted and never shown.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {locked ? (
              <div className="flex items-center gap-2">
                {hasPasscode ? (
                  <input
                    type="password"
                    placeholder="Passcode"
                    value={passcodeDraft}
                    onChange={(e) => setPasscodeDraft(e.target.value)}
                    className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleUnlock(false)}
                  className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-3 py-1 text-xs hover:bg-muted"
                >
                  <LuLockOpen className="size-3" />
                  Unlock
                </button>
                {canTouchId ? (
                  <button
                    type="button"
                    onClick={() => void handleUnlock(true)}
                    className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-3 py-1 text-xs hover:bg-muted"
                  >
                    <LuKey className="size-3" />
                    Touch ID
                  </button>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleLock()}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-3 py-1 text-xs hover:bg-muted"
              >
                <LuLock className="size-3" />
                Lock Vault
              </button>
            )}
          </div>
        </header>

        {tamperedFile ? (
          <div
            role="alert"
            data-testid="tamper-alert"
            className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300"
          >
            <LuTriangleAlert className="size-4 shrink-0 text-rose-400" />
            <span>
              Vault integrity violation: Tamper detected in <strong>{tamperedFile}</strong>. The
              vault has been locked.
            </span>
          </div>
        ) : null}

        {unlockError ? (
          <div className="rounded bg-rose-500/10 p-2 text-xs text-rose-400">{unlockError}</div>
        ) : null}

        <SecretsSection />
        <ForgeAccountsSection />
        <DbLoginsSection />
        <WebAppSignInsSection />
        <GrantsSection />
        <PairingSection />
        <AuditSection />
        <SecretScanSection />
        <ExportSection />
      </div>
    </div>
  );
}
