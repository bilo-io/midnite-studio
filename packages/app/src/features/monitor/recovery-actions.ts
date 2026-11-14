import { previousBuildSessions } from '@midnite/studio-feature-terminal/renderer';
import type { MonitorAction } from '@midnite/studio-frame';
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
  /** Theme D: `runFullRecoveryFromWidget`, over PR #1259's recovery. */
  fullRecovery?: () => void;
};

const noop = (): void => undefined;

const openOptimizer = (): void => void requestHandoff({ app: 'cleaner', view: 'optimizer' });

/**
 * The one way to Manage resources: the flyout's action and the Full recovery dialog both call it, so
 * Theme B's Lost filter (B.7) lands in a single place and applies to both.
 */
export const openManageResources = (): void => openOptimizer();

const DEFAULT_SEAMS: Required<Pick<RecoverySeams, 'cleanSystem' | 'manageResources'>> = {
  cleanSystem: openOptimizer,
  manageResources: openManageResources,
};

/** The four actions in their fixed order: Clean system, Manage resources, Free RAM, Full recovery. */
export function buildRecoveryActions(seams: RecoverySeams = {}): readonly MonitorAction[] {
  const { cleanSystem, manageResources, freeRam, fullRecovery } = { ...DEFAULT_SEAMS, ...seams };
  return [
    {
      id: 'clean-system',
      label: 'Clean system',
      description:
        'Open the Optimizer to sweep system caches (nothing is removed without a confirm)',
      Icon: LuSparkles,
      run: cleanSystem,
    },
    {
      id: 'manage-resources',
      label: 'Manage resources',
      description: 'Open the Optimizer to see which processes hold your memory',
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
 * How many sessions still run in a previous build's broker — #1259's `previousBuildSessions()`, so the
 * badge and the End… confirm agree on the list. It reads the store outside React, so the three slices it
 * depends on are subscribed here to re-render the cluster when any of them changes.
 */
export function usePreviousBuildCount(): number {
  useTerminalStore((state) => state.sessions);
  useTerminalStore((state) => state.legacy);
  useTerminalStore((state) => state.states);
  return previousBuildSessions().length;
}

/** The cluster's attention line: `null` when nothing is running from a previous build. */
export function usePreviousBuildAttention(): string | null {
  const count = usePreviousBuildCount();
  if (count === 0) return null;
  return `${count} ${count === 1 ? 'session' : 'sessions'} from a previous build`;
}
