import type { ComponentType } from 'react';

import { DiagnosticsSegment } from '../diagnostics/diagnostics-segment';
import { MonitorCluster } from '../monitor/monitor-cluster';
import { ReposToggle } from './repos-toggle';
import { TerminalToggle } from './terminal-toggle';

export type StatusZone = 'left' | 'center' | 'right';

/**
 * `priority` decides Theme E's overflow order within a zone; render order
 * within a zone always follows this array's order, not `priority`. Two
 * numbers doing two jobs is the trap here — kept as distinct fields rather
 * than reusing array position for both.
 */
export type StatusSegment = {
  id: string;
  zone: StatusZone;
  priority: number;
  label: string;
  El: ComponentType;
};

/**
 * Static composition, not a registration store — a segment is a component
 * with declared metadata, and it owns its own hooks and returns `null` when
 * it has nothing to report, exactly as `DiagnosticsSegment` and
 * `MonitorCluster` already do.
 *
 * Priorities are gapped (10, 20, …) rather than sequential so Theme D's new
 * segments (active-worktree, op-progress, agent-count, checks-verdict) can
 * slot in between existing ones without renumbering the zone.
 */
export const STATUS_SEGMENTS: StatusSegment[] = [
  { id: 'repos-toggle', zone: 'left', priority: 10, label: 'Repositories', El: ReposToggle },
  { id: 'terminal-toggle', zone: 'left', priority: 20, label: 'Terminal', El: TerminalToggle },
  { id: 'diagnostics', zone: 'right', priority: 10, label: 'Diagnostics', El: DiagnosticsSegment },
  { id: 'monitor', zone: 'right', priority: 20, label: 'System monitor', El: MonitorCluster },
];
