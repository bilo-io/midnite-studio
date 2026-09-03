import { LuActivity } from 'react-icons/lu';

import { useUiStore } from '../../store/ui-store';

import { chordFor, displayChord } from './chord-hint';
import { StatusToggle } from './status-toggle';

const activityChord = chordFor('activity.toggle', 'Mod+Shift+a');

/**
 * Toggle the commit-activity timeline — the panel beside the repositories, or
 * the strip above this very bar, depending on the orientation setting.
 *
 * See [`StatusToggle`](./status-toggle.tsx) for the shared behaviour.
 */
export function ActivityToggle() {
  const active = useUiStore((s) => s.activityTimelineOpen);

  return (
    <StatusToggle
      testId="activity-toggle"
      icon={LuActivity}
      name="Activity"
      chord={displayChord(activityChord)}
      active={active}
      onToggle={() => useUiStore.getState().toggleActivityTimeline()}
      ariaLabel="Toggle Activity Timeline"
      tooltip={`Toggle activity timeline (${displayChord(activityChord)})`}
    />
  );
}
