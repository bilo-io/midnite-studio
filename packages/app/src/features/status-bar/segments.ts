import type { ComponentType } from 'react';

import { BatterySegment } from '../battery/battery-segment';
import { DiagnosticsSegment } from '../diagnostics/diagnostics-segment';
import { FinanceSegment } from '../finance/finance-segment';
import { MonitorCluster } from '../monitor/monitor-cluster';

import { AssistantMenu } from './assistant-menu';
import { BrowserToggle } from './browser-toggle';
import { ChecksVerdictSegment } from './checks-verdict';
import { ExplorerToggle } from './explorer-toggle';
import { FilesToggle } from './files-toggle';
import { InProgressSegment } from './in-progress';
import { NotificationBell } from './notification-bell';
import { OpProgressSegment } from './op-progress';
import { PaletteToggle } from './palette-toggle';
import { ReattachedNote } from './reattached-note';
import { ReposToggle } from './repos-toggle';
import { SearchProgressSegment } from './search-progress';
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
  /**
   * Which cluster this segment belongs to. Separators are drawn wherever two
   * adjacent segments disagree about it — see
   * [`segments-groups.ts`](./segments-groups.ts) — so grouping is data here
   * rather than a hand-placed `<div>` in the middle of the array, which is what
   * the retired `right-delimiter` segment used to be.
   *
   * A group's segments must be **contiguous** in this array; `segments.test.ts`
   * asserts it, because a group resuming after another group's segment would
   * draw two separators for one logical break.
   */
  group: StatusGroup;
  priority: number;
  label: string;
  El: ComponentType;
};

/**
 * Left: the shortcut rail, then this repository's health, then what is running.
 * Right: this repository's forge verdicts, the machine's vitals, then the
 * notification controls — names for the clusters the hand-placed
 * `right-delimiter` already separated, so the right zone gains a description of
 * itself without a pixel changing.
 */
export type StatusGroup =
  | 'shortcuts'
  | 'health'
  | 'live'
  | 'progress'
  | 'repo'
  | 'machine'
  | 'alerts';

/**
 * Static composition, not a registration store — a segment is a component
 * with declared metadata, and it owns its own hooks and returns `null` when
 * it has nothing to report, exactly as `DiagnosticsSegment` and
 * `MonitorCluster` already do.
 *
 * Priorities are gapped (10, 20, …) rather than sequential so Theme D's new
 * segments (active-worktree, op-progress, checks-verdict) can slot in between
 * existing ones without renumbering the zone — and so a departure leaves a gap
 * rather than forcing a renumber, as the agent cluster's did.
 */
export const STATUS_SEGMENTS: StatusSegment[] = [
  // ---- Left zone -------------------------------------------------------
  // `shortcuts`: the rail. Every entry is a `StatusToggle` naming a command
  // that already exists in `COMMANDS`, showing its chord at rest and its name
  // while open or hovered. Priorities ascend with render order — before
  // Phase 39 `browser-toggle` sat at 5, the LOWEST in the zone, so it rendered
  // first and would have been the first thing shed on a narrow window.
  { id: 'repos-toggle', zone: 'left', group: 'shortcuts', priority: 10, label: 'Repositories', El: ReposToggle },
  { id: 'terminal-toggle', zone: 'left', group: 'shortcuts', priority: 20, label: 'Terminal', El: TerminalToggle },
  { id: 'explorer-toggle', zone: 'left', group: 'shortcuts', priority: 25, label: 'Explorer', El: ExplorerToggle },
  { id: 'browser-toggle', zone: 'left', group: 'shortcuts', priority: 30, label: 'Browser', El: BrowserToggle },
  { id: 'palette-toggle', zone: 'left', group: 'shortcuts', priority: 40, label: 'Command palette', El: PaletteToggle },
  { id: 'files-toggle', zone: 'left', group: 'shortcuts', priority: 50, label: 'Go to file', El: FilesToggle },
  // `health`: this repository's own problems. Moved out of the right zone in
  // Phase 39 — it is a fact about the checkout, and it had been sitting between
  // two machine-vitals readouts. Its own header comment already says it follows
  // the sidebar selection rather than the workbench tab, which is a left-zone
  // kind of statement. One member, and it returns `null` for a repository
  // nobody has measured, which is why separators are DOM-derived.
  { id: 'diagnostics', zone: 'left', group: 'health', priority: 60, label: 'Diagnostics', El: DiagnosticsSegment },
  // `live`: what is running right now.
  //
  // Down to one member: the live-agent count and the loop-launcher strip both
  // moved to the title bar's right cluster
  // (`components/title-bar-agents.tsx`), which is why the priorities here jump
  // 60 → 80.
  //
  // The zone still DECLARES two separators — `shortcuts` | `health` and
  // `health` | `live` — but `ReattachedNote` is a dismissible one-shot notice,
  // so the trailing one is now normally stranded and pruned. Each of the two
  // states therefore draws one rule fewer than it used to: none at all when
  // diagnostics has nothing to say either, and one when it does. That is
  // `strandedSeparators` doing exactly its job rather than something to fix,
  // and `shortcut-rail.spec.ts` pins both counts.
  {
    id: 'reattached-note',
    zone: 'left',
    group: 'live',
    priority: 80,
    label: 'Reattached sessions',
    El: ReattachedNote,
  },
  // ---- Centre zone -----------------------------------------------------
  { id: 'search-progress', zone: 'center', group: 'progress', priority: 5, label: 'Search progress', El: SearchProgressSegment },
  { id: 'op-progress', zone: 'center', group: 'progress', priority: 10, label: 'Operation progress', El: OpProgressSegment },
  // Outranks op-progress: a rebase you have forgotten you are mid-way through
  // is the single most expensive thing this bar can tell you.
  { id: 'in-progress', zone: 'center', group: 'progress', priority: 20, label: 'Mid-operation', El: InProgressSegment },
  // ---- Right zone ------------------------------------------------------
  // `repo`: forge verdicts about the checkout. They sit at the window's outer
  // corner, the highest-attention position, and outrank the machine's vitals at
  // collapse time — a failing test outranks a CPU readout. Phase 39 moved
  // diagnostics left and deliberately left these two here for that reason.
  { id: 'finance', zone: 'right', group: 'repo', priority: 7, label: 'Finance', El: FinanceSegment },
  { id: 'test-verdict', zone: 'right', group: 'repo', priority: 30, label: 'Test verdict', El: TestVerdictSegment },
  {
    id: 'checks-verdict',
    zone: 'right',
    group: 'repo',
    priority: 40,
    label: 'Checks verdict',
    El: ChecksVerdictSegment,
  },
  // `machine`: vitals, hard against the window edge where they do not move as
  // things are added. Battery reads as the last member of this group rather
  // than the first of the notification controls, and its `%` already carries
  // `.status-label`, so compact density drops the number and keeps the icon.
  { id: 'monitor', zone: 'right', group: 'machine', priority: 42, label: 'System monitor', El: MonitorCluster },
  { id: 'battery', zone: 'right', group: 'machine', priority: 43, label: 'Battery', El: BatterySegment },
  // `alerts`: the notification controls.
  { id: 'app-update', zone: 'right', group: 'alerts', priority: 45, label: 'Update', El: UpdatePill },
  { id: 'notification-bell', zone: 'right', group: 'alerts', priority: 50, label: 'Notifications', El: NotificationBell },
  { id: 'assistant-menu', zone: 'right', group: 'alerts', priority: 60, label: 'Midnite Assistant', El: AssistantMenu },
];
