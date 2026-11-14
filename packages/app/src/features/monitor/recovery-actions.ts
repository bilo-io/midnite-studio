import type { MonitorAction } from '@midnite/studio-frame';
import { openOptimizerAt } from '@midnite/studio-feature-optimizer/renderer';
import { LuGauge, LuLifeBuoy, LuMemoryStick, LuSparkles } from 'react-icons/lu';

import { requestHandoff } from '../../services/handoff';
import { useTerminalStore } from '../terminal/terminal-store';

/**
 * The entry points the monitor flyout's recovery actions call (Phase 148). Each one is optional:
 * an action whose entry point does not exist yet renders disabled, with its description saying
 * when it arrives, rather than being hidden or faked. Later themes (and PR #1259's detached-session
 * recovery) fill these in; nothing here depends on them landing first.
 */
export type RecoverySeams = {
  /** Theme E's confirm-gated system clean. Until then the Optimizer's own sweep is the entry point. */
  cleanSystem?: () => void;
  manageResources?: () => void;
  /** Theme C. */
  freeRam?: () => void;
  /** Theme D, over PR #1259's `recoverDetachedSessions`. */
  fullRecovery?: () => void;
};

const noop = (): void => undefined;

const openOptimizer = (): void => void requestHandoff({ app: 'cleaner', view: 'optimizer' });

/** Theme B: land on Memory ▸ Lost — old-build brokers, unreachable brokers and rowless ptys. */
export const manageLostResources = (): void => {
  openOptimizerAt({ tab: 'memory', memoryFilter: 'lost' });
  openOptimizer();
};

const DEFAULT_SEAMS: Required<Pick<RecoverySeams, 'cleanSystem' | 'manageResources'>> = {
  cleanSystem: openOptimizer,
  manageResources: manageLostResources,
};

/** The four actions in their fixed order: Clean system, Manage resources, Free RAM, Full recovery. */
export function buildRecoveryActions(seams: RecoverySeams = {}): readonly MonitorAction[] {
  const { cleanSystem, manageResources, freeRam, fullRecovery } = { ...DEFAULT_SEAMS, ...seams };
  return [
    {
      id: 'clean-system',
      label: 'Clean system',
      description: 'Open the Optimizer to sweep system caches (nothing is removed without a confirm)',
      Icon: LuSparkles,
      run: cleanSystem,
    },
    {
      id: 'manage-resources',
      label: 'Manage resources',
      description: 'Open the Optimizer on lost processes: old-build terminal brokers and sessions nothing lists',
      Icon: LuGauge,
      run: manageResources,
    },
    {
      id: 'free-ram',
      label: 'Free RAM',
      description: freeRam
        ? 'End leftover sessions and discard hidden tabs to release memory'
        : 'End leftover sessions and discard hidden tabs to release memory. Not available yet',
      Icon: LuMemoryStick,
      run: freeRam ?? noop,
      ...(freeRam ? {} : { disabled: true }),
    },
    {
      id: 'full-recovery',
      label: 'Full recovery',
      description: fullRecovery
        ? 'Re-attach every detached agent session to its repo'
        : 'Re-attach every detached agent session to its repo. Not available yet',
      Icon: LuLifeBuoy,
      run: fullRecovery ?? noop,
      ...(fullRecovery ? {} : { disabled: true }),
    },
  ];
}

/**
 * How many sessions in the sidebar belong to a previous build — read from the terminal store's
 * `legacy` map, counted against the sessions that still exist so ending one clears it. A hook
 * (it subscribes), called from the cluster's render. PR #1259 supplies `previousBuildSessions()`;
 * this swaps to it then, with no change to the badge.
 */
export function usePreviousBuildCount(): number {
  return useTerminalStore((state) => state.sessions.filter((session) => state.legacy[session.id]).length);
}

/** The cluster's attention line: `null` when nothing is running from a previous build. */
export function usePreviousBuildAttention(): string | null {
  const count = usePreviousBuildCount();
  if (count === 0) return null;
  return `${count} ${count === 1 ? 'session' : 'sessions'} from a previous build`;
}
