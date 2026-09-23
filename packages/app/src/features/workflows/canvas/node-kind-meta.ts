import type { WorkflowNode, WorkflowNodeKind } from '@midnite/studio-shared';
import { LuClock, LuGitBranch, LuGlobe, LuShuffle, LuStickyNote } from 'react-icons/lu';

import type { IconComponent } from '../../../components/icon-button';

/**
 * The workflow node view's five category hues (`styles.css`'s
 * `--node-trigger|action|logic|data|storage`, ported from midnite —
 * Phase 95 Theme I). `trigger` has no mapped kind in this MVP's five-kind
 * vocabulary — every run here is manual, so nothing IS a trigger yet — and
 * stays reachable for the `agent`/`script` node kinds Theme J adds.
 */
export type NodeCategory = 'trigger' | 'action' | 'logic' | 'data' | 'storage';

/**
 * Icon + toolbar label + category per node kind — one table read by the
 * canvas's node view, the node palette (Theme I) and the "add node" toolbar,
 * so none of the three can show a different glyph, name or tint for the same
 * kind.
 */
export const NODE_KIND_META: Record<
  WorkflowNodeKind,
  { label: string; icon: IconComponent; category: NodeCategory; description: string }
> = {
  http: { label: 'HTTP', icon: LuGlobe, category: 'action', description: 'Call a URL and capture the response.' },
  transform: {
    label: 'Transform',
    icon: LuShuffle,
    category: 'data',
    description: 'Pick and rename fields from upstream output.',
  },
  condition: {
    label: 'Condition',
    icon: LuGitBranch,
    category: 'logic',
    description: 'Gate everything downstream on a comparison.',
  },
  delay: { label: 'Delay', icon: LuClock, category: 'action', description: 'Pause the run for a fixed time.' },
  note: { label: 'Note', icon: LuStickyNote, category: 'storage', description: 'A label on the canvas — never runs.' },
};

/** One line describing what a node actually does, for the palette, the node card and the bottom run panel. */
export function nodeSummary(node: WorkflowNode): string {
  switch (node.kind) {
    case 'http':
      return node.config.url.trim() ? `${node.config.method} ${node.config.url}` : `${node.config.method} (no URL)`;
    case 'transform':
      return node.config.picks.length === 0
        ? 'No fields picked'
        : `${node.config.picks.length} field${node.config.picks.length === 1 ? '' : 's'} picked`;
    case 'condition':
      return node.config.op === 'empty'
        ? `${node.config.left || '…'} is empty`
        : `${node.config.left || '…'} ${node.config.op} ${node.config.right || '…'}`;
    case 'delay':
      return `${node.config.ms}ms`;
    case 'note':
      return node.config.text.trim() || 'Empty note';
  }
}
