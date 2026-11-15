import { basename } from 'node:path';

import { app } from 'electron';

import { getSharedBrokerLocation } from '@midnite/studio-feature-terminal/main';
import {
  planBrokerSweep,
  sweepBrokerDir,
  type BrokerSweepOptions,
  type BrokerSweepOutcome,
  type BrokerSweepPlan,
} from '@midnite/studio-runtime';

/**
 * Studio's binding of the broker-dir sweep (Phase 148 Theme E): the directory and this build's own
 * socket come from the live broker connection, so the sweep can tell "this build" from "another".
 * With no broker connection (in-process terminals) there is no identity to protect, so there is
 * nothing to sweep and the plan is empty.
 */
function options(): BrokerSweepOptions | null {
  const location = getSharedBrokerLocation();
  if (!location) return null;
  return {
    brokerDir: location.directory,
    ownSocketName: basename(location.socketPath),
    ownVersion: app.getVersion(),
  };
}

export function brokerSweepPlan(): BrokerSweepPlan {
  const opts = options();
  return opts ? planBrokerSweep(opts) : { entries: [], totalBytes: 0 };
}

export function brokerSweep(names: readonly string[]): BrokerSweepOutcome {
  const opts = options();
  if (!opts) return { removed: 0, freedBytes: 0, skipped: names.map((name) => ({ name, reason: 'no broker connection' })) };
  return sweepBrokerDir(opts, names);
}
