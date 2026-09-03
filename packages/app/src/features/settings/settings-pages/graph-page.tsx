import { Accordion } from '@bilo-io/ui';
import { LuActivity, LuGitBranch, LuRows3 } from 'react-icons/lu';

import { ActivityTimelineSettings } from '../activity-timeline-settings';
import { GraphDensityPicker } from '../density-picker';
import { GraphThemePicker } from '../graph-theme-picker';

/**
 * How the graph is drawn: the style, then the density.
 *
 * Two independent axes, in the order they matter — style decides what the graph
 * looks like, density only how much of it fits. The density preview reads the
 * chosen style's numbers, so picking a style above changes the illustration
 * below.
 */
export function GraphPage() {
  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Style" icon={<LuGitBranch className="h-4 w-4" />} defaultOpen>
        <div className="p-3">
          <GraphThemePicker />
        </div>
      </Accordion>

      <Accordion title="Row density" icon={<LuRows3 className="h-4 w-4" />} defaultOpen>
        <div className="p-3">
          <GraphDensityPicker />
        </div>
      </Accordion>

      <Accordion title="Activity timeline" icon={<LuActivity className="h-4 w-4" />} defaultOpen>
        <div className="p-3">
          <ActivityTimelineSettings />
        </div>
      </Accordion>
    </div>
  );
}
