import React, { useState } from 'react';
import {
  LuCheck,
  LuDownload,
  LuEye,
  LuEyeOff,
  LuFileArchive,
  LuFolderOpen,
  LuTriangleAlert,
  LuUpload,
} from 'react-icons/lu';

function evaluateStrength(passphrase: string): {
  valid: boolean;
  score: number;
  label: string;
} {
  if (!passphrase || passphrase.length < 12) {
    return { valid: false, score: 0, label: 'Too short (< 12)' };
  }
  let score = 1;
  if (passphrase.length >= 16) score += 1;
  if (/[a-z]/.test(passphrase) && /[A-Z]/.test(passphrase)) score += 1;
  if (/[0-9]/.test(passphrase) && /[^a-zA-Z0-9]/.test(passphrase)) score += 1;

  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return { valid: true, score, label: labels[score] ?? 'Fair' };
}

export function ExportSection(): React.ReactElement {
  // Passphrase state
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);

  // Export state
  const [exportPath, setExportPath] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    ok: boolean;
    path?: string;
    entryCount?: number;
    error?: string;
  } | null>(null);

  // Import state
  const [importPath, setImportPath] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    ok: boolean;
    totalEntries?: number;
    entries?: Array<{
      namespace: string;
      key: string;
      existsLocally: boolean;
      hasFingerprint: boolean;
    }>;
    error?: string;
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    ok: boolean;
    importedCount?: number;
    skippedCount?: number;
    error?: string;
  } | null>(null);

  const strength = evaluateStrength(passphrase);

  const bridge = () =>
    (
      window as unknown as {
        midniteStudio?: {
          vaultBackup?: {
            export: (req: { passphrase: string; outputPath?: string }) => Promise<{
              ok: boolean;
              path?: string;
              entryCount?: number;
              error?: string;
            }>;
            importPreview: (req: { passphrase: string; inputPath?: string }) => Promise<{
              ok: boolean;
              totalEntries?: number;
              entries?: Array<{
                namespace: string;
                key: string;
                existsLocally: boolean;
                hasFingerprint: boolean;
              }>;
              error?: string;
            }>;
            import: (req: {
              passphrase: string;
              inputPath?: string;
              overwriteExisting?: boolean;
            }) => Promise<{
              ok: boolean;
              importedCount?: number;
              skippedCount?: number;
              error?: string;
            }>;
            pickExportPath: (req?: { defaultFileName?: string }) => Promise<{ path: string | null }>;
            pickImportPath: (req?: Record<string, never>) => Promise<{ path: string | null }>;
          };
        };
      }
    ).midniteStudio;

  const handlePickExportPath = async () => {
    try {
      const res = await bridge()?.vaultBackup?.pickExportPath({
        defaultFileName: 'midnite-vault-backup.json',
      });
      if (res?.path) setExportPath(res.path);
    } catch {
      // Ignore cancelled dialog
    }
  };

  const handleExport = async () => {
    if (!strength.valid) return;
    setIsExporting(true);
    setExportResult(null);
    try {
      const res = await bridge()?.vaultBackup?.export({
        passphrase,
        outputPath: exportPath || undefined,
      });
      setExportResult(res ?? { ok: false, error: 'Export failed' });
    } catch (e) {
      setExportResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePickImportPath = async () => {
    try {
      const res = await bridge()?.vaultBackup?.pickImportPath();
      if (res?.path) {
        setImportPath(res.path);
        setPreviewResult(null);
        setImportResult(null);
      }
    } catch {
      // Ignore cancelled dialog
    }
  };

  const handlePreviewImport = async () => {
    if (!passphrase) return;
    setIsPreviewing(true);
    setPreviewResult(null);
    setImportResult(null);
    try {
      const res = await bridge()?.vaultBackup?.importPreview({
        passphrase,
        inputPath: importPath || undefined,
      });
      setPreviewResult(res ?? { ok: false, error: 'Preview failed' });
    } catch (e) {
      setPreviewResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!passphrase) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const res = await bridge()?.vaultBackup?.import({
        passphrase,
        inputPath: importPath || undefined,
        overwriteExisting,
      });
      setImportResult(res ?? { ok: false, error: 'Import failed' });
    } catch (e) {
      setImportResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
        <div className="flex items-center gap-2">
          <LuFileArchive className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Encrypted Backup & Restore</h2>
          <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
            midnite-vault-export-v1
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Passphrase-encrypted archive (scrypt + AES-256-GCM). Never plaintext.
        </p>
      </header>

      {/* Shared Passphrase Input */}
      <div className="mb-4 rounded-md border border-border/60 bg-muted/20 p-3">
        <label className="mb-1 block text-xs font-medium text-foreground">
          Backup Passphrase (min 12 characters)
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={showPassphrase ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter passphrase for backup encryption / decryption..."
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-xs pr-8 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassphrase(!showPassphrase)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
            >
              {showPassphrase ? <LuEyeOff className="size-3.5" /> : <LuEye className="size-3.5" />}
            </button>
          </div>
          {passphrase ? (
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${
                strength.valid
                  ? strength.score >= 3
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-amber-500/15 text-amber-400'
                  : 'bg-rose-500/15 text-rose-400'
              }`}
            >
              {strength.label}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          This passphrase encrypts all secrets, forge tokens, and DB passwords. Keep it safe — there is no recovery mechanism.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Export Panel */}
        <div className="flex flex-col justify-between rounded-md border border-border/60 bg-muted/10 p-3">
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <LuDownload className="size-3.5 text-emerald-400" />
              <h3 className="text-xs font-semibold text-foreground">Export Vault</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Exports an encrypted JSON backup file (mode 0600) to your chosen location.
            </p>

            <div className="mb-3">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Destination Path (optional, save dialog will open if empty)
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={exportPath}
                  onChange={(e) => setExportPath(e.target.value)}
                  placeholder="Auto (choose via save dialog)..."
                  className="flex-1 rounded border border-border bg-background px-2.5 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={handlePickExportPath}
                  className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                  title="Browse destination file"
                >
                  <LuFolderOpen className="size-3.5" />
                </button>
              </div>
            </div>

            {exportResult?.ok ? (
              <div className="mb-3 rounded bg-emerald-500/10 p-2 text-xs text-emerald-400">
                <div className="flex items-center gap-1 font-medium">
                  <LuCheck className="size-3.5" />
                  Successfully exported {exportResult.entryCount} entries
                </div>
                <div className="mt-0.5 truncate text-[11px] text-emerald-400/80">
                  {exportResult.path}
                </div>
              </div>
            ) : null}

            {exportResult && !exportResult.ok ? (
              <div className="mb-3 rounded bg-rose-500/10 p-2 text-xs text-rose-400">
                <div className="flex items-center gap-1 font-medium">
                  <LuTriangleAlert className="size-3.5" />
                  Export failed: {exportResult.error}
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            disabled={!strength.valid || isExporting}
            onClick={handleExport}
            className="inline-flex items-center justify-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <LuDownload className="size-3.5" />
            {isExporting ? 'Exporting...' : 'Export Vault'}
          </button>
        </div>

        {/* Import Panel */}
        <div className="flex flex-col justify-between rounded-md border border-border/60 bg-muted/10 p-3">
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <LuUpload className="size-3.5 text-sky-400" />
              <h3 className="text-xs font-semibold text-foreground">Import & Restore</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Restore credentials from an encrypted backup. Previews items before merge.
            </p>

            <div className="mb-3">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Backup File Path
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={importPath}
                  onChange={(e) => setImportPath(e.target.value)}
                  placeholder="Select backup file..."
                  className="flex-1 rounded border border-border bg-background px-2.5 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={handlePickImportPath}
                  className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                  title="Browse backup file"
                >
                  <LuFolderOpen className="size-3.5" />
                </button>
              </div>
            </div>

            <div className="mb-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="overwriteExisting"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="overwriteExisting" className="text-xs text-muted-foreground cursor-pointer">
                Overwrite existing credentials (default: keep existing)
              </label>
            </div>

            {previewResult?.ok ? (
              <div className="mb-3 rounded border border-border/50 bg-background/80 p-2 text-xs">
                <div className="font-medium text-foreground">
                  Backup contains {previewResult.totalEntries} entries:
                </div>
                <ul className="mt-1 max-h-28 overflow-y-auto divide-y divide-border/40 text-[11px]">
                  {previewResult.entries?.map((e) => (
                    <li key={`${e.namespace}:${e.key}`} className="flex items-center justify-between py-1">
                      <span className="font-mono text-muted-foreground">
                        {e.namespace}:<strong className="text-foreground">{e.key}</strong>
                      </span>
                      {e.existsLocally ? (
                        <span className="text-[10px] text-amber-400">Exists locally</span>
                      ) : (
                        <span className="text-[10px] text-emerald-400">New</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {previewResult && !previewResult.ok ? (
              <div className="mb-3 rounded bg-rose-500/10 p-2 text-xs text-rose-400">
                <div className="flex items-center gap-1 font-medium">
                  <LuTriangleAlert className="size-3.5" />
                  Preview failed: {previewResult.error}
                </div>
              </div>
            ) : null}

            {importResult?.ok ? (
              <div className="mb-3 rounded bg-emerald-500/10 p-2 text-xs text-emerald-400">
                <div className="flex items-center gap-1 font-medium">
                  <LuCheck className="size-3.5" />
                  Import completed: {importResult.importedCount} restored, {importResult.skippedCount} skipped
                </div>
              </div>
            ) : null}

            {importResult && !importResult.ok ? (
              <div className="mb-3 rounded bg-rose-500/10 p-2 text-xs text-rose-400">
                <div className="flex items-center gap-1 font-medium">
                  <LuTriangleAlert className="size-3.5" />
                  Import failed: {importResult.error}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!passphrase || isPreviewing}
              onClick={handlePreviewImport}
              className="flex-1 rounded border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {isPreviewing ? 'Decrypting...' : 'Preview Backup'}
            </button>
            <button
              type="button"
              disabled={!passphrase || isImporting}
              onClick={handleConfirmImport}
              className="flex-1 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isImporting ? 'Importing...' : 'Apply Import'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
