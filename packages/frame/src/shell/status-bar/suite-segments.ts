import type { ComponentType } from 'react';

import type { StatusSegment } from './segments';

/**
 * The status segments every suite app shares (Phase 123 Theme J, Decision 5):
 * the terminal and palette toggles, the system monitor, the notification bell
 * and the assistant menu — at the zones, groups and priorities they hold in
 * Studio's bar today, so a non-Studio bar overflows in the same order.
 *
 * The frame owns *where* each segment sits; the app hands in *what* it is. A
 * toggle is bound to its app's own panel state and each of these components
 * belongs to a feature (the terminal panel, the companion, the monitor), so
 * the frame cannot draw one itself without importing the feature. Hence
 * `AppPanels` maps each panel to its segment component: a panel the app does
 * not have is `false` or absent, and its segment is left out — never a dead
 * button.
 */
export type SuitePanel = 'terminal' | 'palette' | 'monitor' | 'notifications' | 'assistant';

export type AppPanels = Partial<Record<SuitePanel, ComponentType | false>>;

type SegmentMeta = Omit<StatusSegment, 'El'> & { panel: SuitePanel };

/** In render order. Studio's `STATUS_SEGMENTS` carries the same five with the same metadata (`segments.test.ts`). */
export const SUITE_SEGMENT_META: readonly SegmentMeta[] = [
  { panel: 'terminal', id: 'terminal-toggle', zone: 'left', group: 'shortcuts', priority: 20, label: 'Terminal' },
  { panel: 'palette', id: 'palette-toggle', zone: 'left', group: 'shortcuts', priority: 40, label: 'Command palette' },
  { panel: 'monitor', id: 'monitor', zone: 'right', group: 'machine', priority: 42, label: 'System monitor' },
  { panel: 'notifications', id: 'notification-bell', zone: 'right', group: 'alerts', priority: 50, label: 'Notifications' },
  { panel: 'assistant', id: 'assistant-menu', zone: 'right', group: 'alerts', priority: 60, label: 'Midnite Assistant' },
];

export function suiteSegments(panels: AppPanels): StatusSegment[] {
  const out: StatusSegment[] = [];
  for (const { panel, ...meta } of SUITE_SEGMENT_META) {
    const El = panels[panel];
    if (El) out.push({ ...meta, El });
  }
  return out;
}
