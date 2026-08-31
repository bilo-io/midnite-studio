import type { ComponentType } from 'react';

import { BatterySegment } from '../battery/battery-segment';
import { DiagnosticsSegment } from '../diagnostics/diagnostics-segment';
import { FinanceSegment } from '../finance/finance-segment';
import { MonitorCluster } from '../monitor/monitor-cluster';

import { AgentCountSegment } from './agent-count';
import { AssistantMenu } from './assistant-menu';
import { BrowserToggle } from './browser-toggle';
import { ChecksVerdictSegment } from './checks-verdict';
import { InProgressSegment } from './in-progress';
import { NotificationBell } from './notification-bell';
import { OpProgressSegment } from './op-progress';
import { ReattachedNote } from './reattached-note';
import { ReposToggle } from './repos-toggle';
import { SearchProgressSegment } from './search-progress';
import { RightDelimiterSegment } from './right-delimiter';
import { TerminalToggle } from './terminal-toggle';
import { TestVerdictSegment } from './test-verdict';

import { UpdatePill } from './update-pill';

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
  // Left zone: Repository / Terminal / Browser toggles, Reattached sessions, and Finance
  { id: 'repos-toggle', zone: 'left', priority: 10, label: 'Repositories', El: ReposToggle },
  { id: 'terminal-toggle', zone: 'left', priority: 20, label: 'Terminal', El: TerminalToggle },
  { id: 'browser-toggle', zone: 'left', priority: 5, label: 'Browser', El: BrowserToggle },
  { id: 'agent-count', zone: 'left', priority: 30, label: 'Live agents', El: AgentCountSegment },
  { id: 'finance', zone: 'left', priority: 7, label: 'Finance', El: FinanceSegment },
  {
    id: 'reattached-note',
    zone: 'left',
    priority: 40,
    label: 'Reattached sessions',
    El: ReattachedNote,
  },
  { id: 'search-progress', zone: 'center', priority: 5, label: 'Search progress', El: SearchProgressSegment },
  { id: 'op-progress', zone: 'center', priority: 10, label: 'Operation progress', El: OpProgressSegment },
  // Outranks op-progress: a rebase you have forgotten you are mid-way through
  // is the single most expensive thing this bar can tell you.
  { id: 'in-progress', zone: 'center', priority: 20, label: 'Mid-operation', El: InProgressSegment },
  // Right zone:
  { id: 'diagnostics', zone: 'right', priority: 10, label: 'Diagnostics', El: DiagnosticsSegment },
  { id: 'battery', zone: 'right', priority: 22, label: 'Battery', El: BatterySegment },
  {
    id: 'right-delimiter',
    zone: 'right',
    priority: 25,
    label: 'Delimiter',
    El: RightDelimiterSegment,
  },
  // The two verdicts sit at the window's outer corner, the highest-attention
  // position, and outrank diagnostics/monitor at collapse time — a failing
  // test outranks a CPU readout.
  { id: 'test-verdict', zone: 'right', priority: 30, label: 'Test verdict', El: TestVerdictSegment },
  {
    id: 'checks-verdict',
    zone: 'right',
    priority: 40,
    label: 'Checks verdict',
    El: ChecksVerdictSegment,
  },
  { id: 'monitor', zone: 'right', priority: 42, label: 'System monitor', El: MonitorCluster },
  { id: 'app-update', zone: 'right', priority: 45, label: 'Update', El: UpdatePill },
  { id: 'notification-bell', zone: 'right', priority: 50, label: 'Notifications', El: NotificationBell },
  { id: 'assistant-menu', zone: 'right', priority: 60, label: 'Midnite Assistant', El: AssistantMenu },
];
