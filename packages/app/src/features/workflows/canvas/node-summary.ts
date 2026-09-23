import type { WorkflowNode } from '@midnite/studio-shared';

/**
 * A node's one-line subtitle on its canvas card (Phase 95 Theme I, porting
 * midnite's `workflow-node-view.tsx` `summarize()`) — what the node actually
 * *does*, so a glance at the canvas reads as a workflow rather than a pile of
 * identically-labelled boxes. Kept beside `node-kind-meta.ts` rather than
 * folded into it: that table is icon/label metadata read by both the palette
 * and the node view, and a summary needs the node's own config, which a
 * `Record<WorkflowNodeKind, …>` table has no way to carry.
 */
export function summarizeNode(node: WorkflowNode): string {
  switch (node.kind) {
    case 'http':
      return node.config.url.trim() === '' ? `${node.config.method} …` : `${node.config.method} ${node.config.url}`;
    case 'transform':
      return node.config.picks.length === 0
        ? 'No fields picked'
        : `${node.config.picks.length} field${node.config.picks.length === 1 ? '' : 's'} picked`;
    case 'condition':
      return node.config.op === 'empty'
        ? `${node.config.left || '…'} is empty`
        : `${node.config.left || '…'} ${node.config.op} ${node.config.right ?? '…'}`;
    case 'delay':
      return `${node.config.ms}ms`;
    case 'note':
      return node.config.text.trim() === '' ? 'Empty note' : node.config.text.trim().split('\n')[0]!;
  }
}
