import type { ComponentType } from 'react';

import { DiagnosticsSegment } from '../diagnostics/diagnostics-segment';
import { MonitorCluster } from '../monitor/monitor-cluster';
import { ActiveWorktreeSegment } from './active-worktree';
import { AgentCountSegment } from './agent-count';
import { BrowserToggle } from './browser-toggle';
import { ChecksVerdictSegment } from './checks-verdict';
import { InProgressSegment } from './in-progress';
import { OpProgressSegment } from './op-progress';
import { ReattachedNote } from './reattached-note';
import { ReposToggle } from './repos-toggle';
import { SearchProgressSegment } from './search-progress';
import { TerminalToggle } from './terminal-toggle';
import { TestVerdictSegment } from './test-verdict';


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
  // Rendered last (array order), but the lowest `priority` of the three
  // toggles — Repos and Terminal both toggle panels that hold work, and the
  // browser pane holds nothing yet, so it is the first into Theme E's
  // overflow popover.
  { id: 'repos-toggle', zone: 'left', priority: 10, label: 'Repositories', El: ReposToggle },
  { id: 'terminal-toggle', zone: 'left', priority: 20, label: 'Terminal', El: TerminalToggle },
  { id: 'browser-toggle', zone: 'left', priority: 5, label: 'Browser', El: BrowserToggle },
  // Priority 30: identity beats the toggles at overflow time — knowing which
  // checkout the bar is even about outranks a button that summons a panel.
  {
    id: 'active-worktree',
    zone: 'left',
    priority: 30,
    label: 'Active worktree',
    El: ActiveWorktreeSegment,
  },
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
  // Rendered before diagnostics; lowest priority of the right zone's five —
  // the least critical of the new readouts, collapsing before diagnostics,
  // the monitor, and both verdicts.
  { id: 'agent-count', zone: 'right', priority: 5, label: 'Live agents', El: AgentCountSegment },
  { id: 'diagnostics', zone: 'right', priority: 10, label: 'Diagnostics', El: DiagnosticsSegment },
  { id: 'monitor', zone: 'right', priority: 20, label: 'System monitor', El: MonitorCluster },
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
];
