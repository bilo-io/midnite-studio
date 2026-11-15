import { listHiddenBrowserTabs, discardBrowserTab } from '@midnite/studio-feature-browser/main';
import { probeReclaimableBytes } from '@midnite/studio-feature-monitor/main';

import { readProcessRows } from '../agent-process';
import { liveBrokerSessions } from '../pty-service';
import { endSessions } from '../terminal-service';
import { EVENT_CHANNELS } from '@midnite/studio-shared';
import { windowForRole } from '../window-manager';
import {
  planFreeRam,
  runFreeRam,
  type FreeRamDeps,
  type FreeRamOutcome,
  type FreeRamPlan,
} from './free-ram';
import { getProcessTableResult, killTree, primaryBrokerPids, readBrokerInventory } from './kill-service';

/**
 * Studio's binding of Free RAM (Phase 148 Theme C): the real `ps`, inventory, terminal service, browser
 * and window, handed to the pure planner in `free-ram.ts`. Every kill still goes through `endSessions`
 * and `killTree`, which carry their own guards; nothing here signals a process directly.
 */

/** Σ RSS of everything the process table calls ours: main, renderers, gpu, utility, brokers and their trees. */
async function snapshotRss(): Promise<number | null> {
  const result = await getProcessTableResult();
  if (result.error !== null && result.processes.length === 0) return null;
  return result.processes.reduce((sum, p) => (p.ours ? sum + (p.rssBytes ?? 0) : sum), 0);
}

/** Drop the HTTP cache of the main window's session and ask its preload to clear the frame's resource cache. */
async function clearRendererCaches(): Promise<void> {
  const win = windowForRole('main');
  if (!win || win.isDestroyed()) return;
  await win.webContents.session.clearCache();
  win.webContents.send(EVENT_CHANNELS.optimizerClearRendererCache);
}

const DEPS: FreeRamDeps = {
  readRows: () => readProcessRows(),
  readInventory: (rows) => readBrokerInventory(rows),
  primaryPids: (inventory) => primaryBrokerPids(inventory),
  brokerSessions: () => liveBrokerSessions(),
  hiddenTabs: () => listHiddenBrowserTabs(),
  endSessions: (ids) => endSessions(ids),
  killTree: (pid, argv) => killTree(pid, argv, false),
  discardTab: (id) => discardBrowserTab(id),
  clearRendererCaches,
  snapshotRss,
  freeBytes: () => probeReclaimableBytes(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export function freeRamPlan(): Promise<FreeRamPlan> {
  return planFreeRam(DEPS);
}

export function freeRam(candidateIds: readonly string[]): Promise<FreeRamOutcome> {
  return runFreeRam(DEPS, candidateIds);
}
