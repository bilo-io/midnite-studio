import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize } from 'node:path';

import { RETIRED_APP_ALIASES, type ModuleHostId, type RetiredAppId } from '@midnite/studio-shared';

import { appDataDirectory } from '../data-directory';

/**
 * Phase 124 Theme G.4 — a host takes over a retired app's own data, once.
 *
 * Coder, Creator, Capture and the rest each kept their state under their own
 * `<appData>/Midnite Runtime/apps/<id>`. Their host (Agents, Vanguard, Mind) keeps the same layout
 * under its own id, so on its first launch it copies what the retired app left, then writes a marker
 * so it never runs again. The source is **left in place** — nothing is moved or deleted, so the old
 * app (if still installed) keeps working beside the host — and an entry the host already has is
 * never overwritten.
 *
 * Secrets are not in this plan. A vault secret lives in the runtime vault service
 * (`runtime/src/vault/`, `<appData>/Midnite Runtime/vault`), which every app already shares, so
 * there is nothing app-local to copy and the vault's files are never listed here. The suite's
 * settings sit in `suite-prefs`, also shared. What follows is only what was app-local.
 */
export const RETIRED_APP_DATA: Readonly<Record<RetiredAppId, readonly string[]>> = {
  // Coder's repository registry, forge account metadata (tokens are in the vault), database
  // connections (passwords too) and the test-trust list: `<userData>/<file>`.
  coder: ['repos.json', 'forge-accounts.json', 'db-connections.json', 'tests-trust.json'],
  // Creator's media root and its video setting.
  creator: ['media', 'video-settings.json'],
  // Capture's clipboard history and recordings index (`CAPTURE_DATA_DIR`).
  capture: ['capture'],
  // Nothing app-local: Vault's data is the runtime vault, Cleaner and Monitor keep logs only.
  vault: [],
  cleaner: [],
  monitor: [],
  // Never shipped as apps.
  accountant: [],
  simulator: [],
};

export type RetiredImportResult =
  | { app: RetiredAppId; status: 'imported'; copied: string[]; skipped: string[] }
  | { app: RetiredAppId; status: 'already-done' | 'no-source' }
  | { app: RetiredAppId; status: 'error'; message: string };

/** The marker under the host's data directory: `.migrated/<retired id>.json`. */
export function retiredImportMarker(hostDir: string, app: RetiredAppId): string {
  return join(hostDir, '.migrated', `${app}.json`);
}

/** A plan entry must be a plain relative path under the data directory. */
function safeEntry(entry: string): boolean {
  const n = normalize(entry);
  return !isAbsolute(n) && n !== '..' && !n.startsWith(`..${'/'}`) && n !== '.';
}

/**
 * Imports every retired app that `host` now carries. Never throws: a failure is a result, and leaves
 * no marker, so the next launch tries again. `appData` is `app.getPath('appData')`.
 */
export function importRetiredAppData(opts: {
  appData: string;
  host: ModuleHostId;
  now?: () => Date;
}): RetiredImportResult[] {
  const hostDir = appDataDirectory(opts.appData, opts.host);
  const now = opts.now ?? (() => new Date());
  const results: RetiredImportResult[] = [];
  for (const app of Object.keys(RETIRED_APP_ALIASES) as RetiredAppId[]) {
    if (RETIRED_APP_ALIASES[app].app !== opts.host) continue;
    try {
      const marker = retiredImportMarker(hostDir, app);
      if (existsSync(marker)) {
        results.push({ app, status: 'already-done' });
        continue;
      }
      const sourceDir = appDataDirectory(opts.appData, app);
      if (!existsSync(sourceDir)) {
        results.push({ app, status: 'no-source' });
        continue;
      }
      const copied: string[] = [];
      const skipped: string[] = [];
      for (const entry of RETIRED_APP_DATA[app]) {
        if (!safeEntry(entry)) continue;
        const from = join(sourceDir, entry);
        const to = join(hostDir, entry);
        // Absent in the source, or already present in the host: nothing to bring over, nothing to overwrite.
        if (!existsSync(from) || existsSync(to)) {
          skipped.push(entry);
          continue;
        }
        mkdirSync(dirname(to), { recursive: true });
        // Into a temp name, then a rename: an interrupted copy never leaves a half-filled entry that a
        // later launch would take for a finished one.
        const partial = `${to}.importing`;
        rmSync(partial, { recursive: true, force: true });
        cpSync(from, partial, { recursive: true, verbatimSymlinks: true });
        renameSync(partial, to);
        copied.push(entry);
      }
      mkdirSync(dirname(marker), { recursive: true });
      writeFileSync(marker, `${JSON.stringify({ app, host: opts.host, importedAt: now().toISOString(), copied, skipped }, null, 2)}\n`);
      results.push({ app, status: 'imported', copied, skipped });
    } catch (error) {
      results.push({ app, status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
