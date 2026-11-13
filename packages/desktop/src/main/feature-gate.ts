import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  failure,
  FEATURE_TOGGLE_IDS,
  featureToggle,
  resolveSuitePrefs,
  SUITE_PREFS_FILE_NAME,
  type FeatureToggleId,
  type GitOpResult,
} from '@midnite/studio-shared';

import { defaultLogger, type Logger } from './log';

/**
 * Main's copy of which features are switched off (Phase 135 Theme E).
 *
 * The renderer's `useFeatureTogglesStore` owns the choice and writes it to the `studioFeatures` group of
 * `suite-prefs.json`. Main reads that file synchronously at boot ({@link loadFeatureGate}) — before any
 * feature's work starts, so a switched-off feature's timers never start at all — and hears every later
 * change from the suite-prefs service ({@link applyDisabledFeatures}).
 *
 * Two things hang off it:
 * - **The IPC gate.** `ipc/handle.ts` asks {@link featureOffAnswer} before running a handler; a channel owned
 *   by a switched-off feature answers the error envelope instead of running, and stays registered, so
 *   switching back on needs nothing re-bound.
 * - **Lifecycles.** {@link bindFeatureLifecycle} runs a feature's background work only while it is on, and
 *   stops it when it is switched off at runtime.
 */

let disabled = new Set<FeatureToggleId>();
const channelOwner = new Map<string, FeatureToggleId>();
const mcpToolOwner = new Map<string, FeatureToggleId>();
type Lifecycle = { id: FeatureToggleId; label: string; start: () => void; stop: () => void; running: boolean };
const lifecycles: Lifecycle[] = [];
let log: Logger = defaultLogger;

/** Read the persisted choice. Unreadable or absent means everything on. */
export function loadFeatureGate(runtimeDirectory: string, logger: Logger = defaultLogger): readonly FeatureToggleId[] {
  log = logger;
  let raw: unknown = {};
  try {
    raw = JSON.parse(readFileSync(join(runtimeDirectory, SUITE_PREFS_FILE_NAME), 'utf8')) as unknown;
  } catch {
    // No file yet (a fresh profile) or a corrupt one: the suite-prefs service reports the latter itself.
  }
  disabled = new Set(resolveSuitePrefs(raw).prefs.studioFeatures.disabled);
  if (disabled.size > 0) log.info(`feature-gate: switched off at boot: ${[...disabled].join(', ')}`);
  return [...disabled];
}

/**
 * Which feature owns each channel — every toggle's feature main `channels`, except a toggle whose IPC stays
 * open (`ipcOpen`) and any channel two features share, so an always-on caller is never refused.
 */
export function configureFeatureChannels(channels: Partial<Record<FeatureToggleId, readonly string[]>>): void {
  channelOwner.clear();
  const claims = new Map<string, number>();
  for (const list of Object.values(channels)) for (const c of new Set(list)) claims.set(c, (claims.get(c) ?? 0) + 1);
  for (const id of FEATURE_TOGGLE_IDS) {
    if (featureToggle(id).ipcOpen) continue;
    for (const channel of channels[id] ?? []) if (claims.get(channel) === 1) channelOwner.set(channel, id);
  }
}

export function isFeatureEnabled(id: FeatureToggleId): boolean {
  return !disabled.has(id);
}

/** The switched-off feature that owns `channel`, if any. */
export function channelFeatureOff(channel: string): FeatureToggleId | undefined {
  const owner = channelOwner.get(channel);
  return owner !== undefined && disabled.has(owner) ? owner : undefined;
}

/** Which feature owns each `midnite` MCP tool a switched-off feature should refuse. */
export function configureFeatureMcpTools(tools: Partial<Record<FeatureToggleId, readonly string[]>>): void {
  mcpToolOwner.clear();
  for (const id of FEATURE_TOGGLE_IDS) for (const tool of tools[id] ?? []) mcpToolOwner.set(tool, id);
}

/** The refusal an MCP call to a switched-off feature's tool gets, or undefined when it may run. */
export function mcpToolOffMessage(tool: string): string | undefined {
  const owner = mcpToolOwner.get(tool);
  if (owner === undefined || !disabled.has(owner)) return undefined;
  return `"${tool}" belongs to ${featureToggle(owner).label}, which is switched off in Settings ▸ Features.`;
}

/** The answer a gated `invoke` gets: the error envelope, never a throw. */
export function featureOffAnswer(channel: string): GitOpResult | undefined {
  const owner = channelFeatureOff(channel);
  if (owner === undefined) return undefined;
  return failure(`${featureToggle(owner).label} is switched off in Settings ▸ Features`);
}

/**
 * Run `start` while the feature is on and `stop` when it goes off. Starts now when it is on; a feature off at
 * boot never starts. Returns an unbind that stops it.
 */
export function bindFeatureLifecycle(id: FeatureToggleId, label: string, start: () => void, stop: () => void): () => void {
  const entry: Lifecycle = { id, label, start, stop, running: false };
  lifecycles.push(entry);
  if (!disabled.has(id)) run(entry, true);
  else log.info(`feature-gate: ${label} not started (${id} is switched off)`);
  return () => {
    if (entry.running) run(entry, false);
    lifecycles.splice(lifecycles.indexOf(entry), 1);
  };
}

function run(entry: Lifecycle, on: boolean): void {
  try {
    if (on) entry.start();
    else entry.stop();
    entry.running = on;
    log.info(`feature-gate: ${on ? 'started' : 'stopped'} ${entry.label} (${entry.id})`);
  } catch (err) {
    log.error(`feature-gate: ${on ? 'starting' : 'stopping'} ${entry.label} failed`, err);
  }
}

/** A new choice from the suite-prefs service: stop what went off, start what came back on. */
export function applyDisabledFeatures(next: readonly FeatureToggleId[]): void {
  const nextSet = new Set(next);
  const changed = FEATURE_TOGGLE_IDS.filter((id) => disabled.has(id) !== nextSet.has(id));
  disabled = nextSet;
  if (changed.length === 0) return;
  log.info(`feature-gate: switched off now: ${[...nextSet].join(', ') || 'none'}`);
  for (const entry of lifecycles) {
    const on = !nextSet.has(entry.id);
    if (on !== entry.running) run(entry, on);
  }
}

/** Test-only reset. */
export function resetFeatureGateForTests(): void {
  disabled = new Set();
  channelOwner.clear();
  mcpToolOwner.clear();
  lifecycles.length = 0;
  log = defaultLogger;
}
