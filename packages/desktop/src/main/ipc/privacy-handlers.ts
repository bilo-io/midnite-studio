import { execFile } from 'node:child_process';

import { app, shell } from 'electron';

import { CHANNELS } from '@midnite/studio-shared';

import { clearHistory, historyStats, pruneHistory } from '../history-retention';
import { defaultLogger } from '../log';
import { currentSettings, onSettingsChange } from '../settings-mirror';
import { nullSessionHistoryStore, type SessionHistoryStore } from '../session-history-store';
import { listSessionIds } from '../terminal-service';
import { safeId } from '../terminal-store';
import { handleBare } from './handle';

/**
 * Settings ▸ Privacy's housekeeping (Phase 115 Theme B): the "Clear all local history" blast radius
 * and delete, the FileVault note, and the retention pruner. Chats, settings and live sessions are
 * never touched; `history-retention.ts` holds the rules and is tested without electron.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
let sessionHistory: SessionHistoryStore = nullSessionHistoryStore;

/** Injected at boot with the same store `configureSessions` got. */
export function configurePrivacy(next: SessionHistoryStore): void {
  sessionHistory = next;
}

// Files are named by `safeId(id)`, so protect that spelling.
const liveIds = async (): Promise<Set<string>> => new Set((await listSessionIds()).map(safeId));

/** `fdesetup status` needs no admin: "FileVault is On." / "FileVault is Off.". */
function readFileVault(): Promise<'on' | 'off' | 'unknown'> {
  return new Promise((resolve) => {
    execFile('/usr/bin/fdesetup', ['status'], { timeout: 5_000 }, (err, stdout) => {
      if (err) return resolve('unknown');
      if (/FileVault is On/i.test(stdout)) return resolve('on');
      if (/FileVault is Off/i.test(stdout)) return resolve('off');
      resolve('unknown');
    });
  });
}

async function pruneNow(): Promise<void> {
  const days = currentSettings().historyRetentionDays ?? null;
  if (days === null) return;
  try {
    const out = await pruneHistory(app.getPath('userData'), { days, liveIds: await liveIds() });
    // Drop the closed-session rows whose transcripts were just pruned.
    if (out.transcriptIds?.length) {
      const gone = new Set(out.transcriptIds);
      for (const row of await sessionHistory.list()) if (gone.has(safeId(row.id))) await sessionHistory.purge(row.id);
    }
    if (out.files > 0) defaultLogger.info(`[privacy] retention (${days}d) removed ${out.files} history files`);
  } catch (error) {
    defaultLogger.warn(`[privacy] retention prune failed: ${String(error)}`);
  }
}

export function registerPrivacyHandlers(): void {
  handleBare(CHANNELS.privacyHistoryStats, async () => historyStats(app.getPath('userData'), await liveIds()));
  handleBare(CHANNELS.privacyHistoryClear, async () => {
    const out = await clearHistory(app.getPath('userData'), await liveIds());
    // The closed-session rows point at transcripts that are now gone.
    await sessionHistory.purge(null);
    defaultLogger.info(`[privacy] cleared local history: ${out.files} files`);
    return { removedFiles: out.files, removedBytes: out.bytes };
  });
  handleBare(CHANNELS.privacyFileVault, async () => ({ status: await readFileVault() }));
  handleBare(CHANNELS.privacyOpenFileVault, async () => {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?FileVault');
  });

  // The renderer pushes the retention setting after boot, so prune when it changes as well as daily.
  let last = currentSettings().historyRetentionDays ?? null;
  onSettingsChange((s) => {
    const next = s.historyRetentionDays ?? null;
    if (next === last) return;
    last = next;
    void pruneNow();
  });
  setInterval(() => void pruneNow(), DAY_MS).unref();
}
