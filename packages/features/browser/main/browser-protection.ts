import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_PRIVACY_SETTINGS, registrableDomain, type PrivacySettings } from './browser-request-filter';
import type { DownloadsSettings } from './browser-downloads';
import type { ExecResult, QuarantineDeps } from './download-quarantine';

/**
 * Mutable protection state for the browser partition (Phase 117 Themes D + E): the privacy
 * switches, the per-site exceptions, the downloads opt-in, and the real Node-backed side effects
 * the quarantine pipeline runs against. The renderer owns the switches (Settings ▸ Browser) and
 * pushes them on mount and on change; until it does, main runs the defaults — protection on,
 * downloads off.
 */

export const DOWNLOADS_LEDGER_FILE = 'downloads.ndjson';
export const TRACKER_EXCEPTIONS_FILE = 'browser-tracker-exceptions.json';

export function defaultQuarantineFolder(): string {
  return join(homedir(), 'Downloads', 'Midnite Quarantine');
}

let privacy: PrivacySettings = { ...DEFAULT_PRIVACY_SETTINGS };
let downloads: DownloadsSettings = { enabled: false, folder: '' };
const exceptions = new Set<string>();
let exceptionsLoadedFrom: string | undefined | null = null;

export const getPrivacySettings = (): PrivacySettings => privacy;
export const setPrivacySettings = (next: PrivacySettings): void => {
  privacy = { ...next };
};
export const getDownloadsSettings = (): DownloadsSettings => downloads;
export const setDownloadsSettings = (next: DownloadsSettings): void => {
  downloads = { enabled: next.enabled, folder: next.folder };
};

function loadExceptions(dir: string | undefined): void {
  if (exceptionsLoadedFrom === dir) return;
  exceptionsLoadedFrom = dir;
  exceptions.clear();
  if (!dir) return;
  try {
    const raw = JSON.parse(readFileSync(join(dir, TRACKER_EXCEPTIONS_FILE), 'utf8')) as unknown;
    if (Array.isArray(raw)) for (const h of raw) if (typeof h === 'string') exceptions.add(h);
  } catch {
    /* none yet, or unreadable: start empty — protection stays on */
  }
}

export function isTrackerExcepted(registrable: string, dir: string | undefined): boolean {
  loadExceptions(dir);
  return exceptions.has(registrable);
}

export function setTrackerException(host: string, allow: boolean, dir: string | undefined): void {
  loadExceptions(dir);
  const key = registrableDomain(host);
  if (allow) exceptions.add(key);
  else exceptions.delete(key);
  if (!dir) return;
  try {
    const target = join(dir, TRACKER_EXCEPTIONS_FILE);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, JSON.stringify([...exceptions].sort()), { mode: 0o600 });
    renameSync(tmp, target);
  } catch {
    /* an unwritable exception list is a lost preference, not an error worth surfacing */
  }
}

export function resetProtectionStateForTest(): void {
  privacy = { ...DEFAULT_PRIVACY_SETTINGS };
  downloads = { enabled: false, folder: '' };
  exceptions.clear();
  exceptionsLoadedFrom = null;
}

function run(file: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve) => {
    // GUI apps inherit a minimal PATH; a Homebrew-installed `clamscan` lives outside it.
    const env = { ...process.env, PATH: `${process.env.PATH ?? ''}:/opt/homebrew/bin:/usr/local/bin` };
    execFile(file, args, { env, timeout: 120_000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 127) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/** The real side effects. The ledger is `<userData>/downloads.ndjson`, 0600. */
export function createNodeQuarantineDeps(userDataPath: string | undefined): QuarantineDeps {
  return {
    platform: process.platform,
    exec: run,
    sha256File,
    appendLedger: async (line) => {
      if (!userDataPath) return;
      await appendFile(join(userDataPath, DOWNLOADS_LEDGER_FILE), line, { mode: 0o600 });
    },
    now: () => Date.now(),
  };
}

export function ensureQuarantineFolder(folder: string): void {
  mkdirSync(folder, { recursive: true, mode: 0o700 });
}

export const pathExists = (p: string): boolean => existsSync(p);
