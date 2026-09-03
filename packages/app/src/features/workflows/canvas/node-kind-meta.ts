import type { WorkflowNodeKind } from '@midnite/studio-shared';
import { LuClock, LuGitBranch, LuGlobe, LuShuffle, LuStickyNote } from 'react-icons/lu';

import type { IconComponent } from '../../../components/icon-button';

/**
 * Icon + toolbar label per node kind — one table read by the canvas's "add
 * node" toolbar and by the node chrome itself, so the two can never show a
 * different glyph for the same kind.
 */
export const NODE_KIND_META: Record<WorkflowNodeKind, { label: string; icon: IconComponent }> = {
  http: { label: 'HTTP', icon: LuGlobe },
  transform: { label: 'Transform', icon: LuShuffle },
  condition: { label: 'Condition', icon: LuGitBranch },
  delay: { label: 'Delay', icon: LuClock },
  note: { label: 'Note', icon: LuStickyNote },
};
