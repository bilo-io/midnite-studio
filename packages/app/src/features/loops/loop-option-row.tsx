// Moved to @midnite/studio-feature-loops (Phase 123 Theme G); re-exported so no import path moves.
import { LoopOptionRow as FeatureLoopOptionRow, SkillCombobox as FeatureSkillCombobox, TooltipSwitchRow as FeatureTooltipSwitchRow } from '@midnite/studio-feature-loops/renderer';

import { withStudioLoopsHost } from '../../compose/loops-host';

export const LoopOptionRow = withStudioLoopsHost(FeatureLoopOptionRow);
export const SkillCombobox = withStudioLoopsHost(FeatureSkillCombobox);
export const TooltipSwitchRow = withStudioLoopsHost(FeatureTooltipSwitchRow);

export {
  contributorOptions,
  matchSkills,
} from '@midnite/studio-feature-loops/renderer';
