import type { WorkflowNode, WorkflowNodeKind } from '@midnite/studio-shared';
import {
  LuBadgeCheck,
  LuBot,
  LuClock,
  LuGitBranch,
  LuGlobe,
  LuMerge,
  LuShieldCheck,
  LuShuffle,
  LuSplit,
  LuSquareTerminal,
  LuStickyNote,
  LuTimer,
} from 'react-icons/lu';

import type { IconComponent } from '../../../components/icon-button';

/**
 * The workflow node view's five category hues (`styles.css`'s
 * `--node-trigger|action|logic|data|storage`, ported from midnite —
 * Phase 95 Theme I). `trigger` sat unmapped from the MVP through Phase 97
 * Themes A-F — every run was manual, so nothing WAS a trigger — until Theme H
 * gives it the one kind it was always reserved for.
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
  /**
   * Phase 95 Theme J. Both take the `action` hue — they run something with a
   * real side effect, exactly like `http`, rather than the unused `trigger`
   * hue: every run in this app is still manual, and neither kind starts one
   * on its own.
   */
  agent: {
    label: 'Agent',
    icon: LuBot,
    category: 'action',
    description: 'Run a roster agent in a real terminal session.',
  },
  script: {
    label: 'Script',
    icon: LuSquareTerminal,
    category: 'action',
    description: 'Run a shell command in a real terminal session.',
  },
  /**
   * Phase 97 Theme B. `logic` hue, beside `condition` — a join is a routing
   * decision (which inputs count, and how), not an action with a side
   * effect. Full canvas treatment (the pill shape, taken/dead edge styling)
   * is Theme J's job; this is the minimal entry the exhaustive maps below
   * need to keep compiling.
   */
  join: {
    label: 'Join',
    icon: LuMerge,
    category: 'logic',
    description: 'Merge several branches — all, any, or every outcome.',
  },
  /**
   * Phase 97 Theme D. `logic` hue, beside `condition`/`join` — a gate is a
   * routing decision too, just one a human (or an MCP tool, or a PR comment)
   * makes instead of the engine. The shield glyph is the one visual claim
   * this theme makes; the shape (a distinct node silhouette) is Theme J's
   * canvas-styling extension point — see `node-shape.ts`.
   */
  gate: {
    label: 'Gate',
    icon: LuShieldCheck,
    category: 'logic',
    description: 'Pause the run for approval — the run panel, the bell, MCP, or a PR comment.',
  },
  /**
   * Phase 97 Theme F. `logic` hue, beside `condition`/`join`/`gate` — a
   * router is a routing decision too, just fanning out to N named cases
   * instead of two. `LuSplit` over `LuGitBranch` (`condition`'s own glyph)
   * so the two read as different jobs at a glance despite sharing the
   * `diamond-header` shape (`node-shape.ts`).
   */
  router: {
    label: 'Router',
    icon: LuSplit,
    category: 'logic',
    description: 'Send the run down one of several named cases, or default.',
  },
  /**
   * Phase 97 Theme E. `logic` hue, beside `condition`/`join` — a verifier is
   * a routing decision (`pass`/`fail`) over a computed or agent-graded
   * check, not an action with its own side effect (the checked action
   * already ran upstream).
   */
  verify: {
    label: 'Verify',
    icon: LuBadgeCheck,
    category: 'logic',
    description: 'Check the upstream result — agent verdict, exit code, test counts or a JSON path.',
  },
  /**
   * Phase 97 Theme H. The one kind that finally uses the `trigger` hue —
   * every other kind runs an action or a routing decision, this one is the
   * graph's own start. At most one per workflow (`validateWorkflow`). The
   * plain Run button still always works regardless of `config.on` — this is
   * only how the workflow is armed to fire *automatically*.
   */
  trigger: {
    label: 'Trigger',
    icon: LuTimer,
    category: 'trigger',
    description: 'Start the run — manual, on a schedule, or a forge PR event.',
  },
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
    case 'agent':
      return node.config.agentId.trim() ? `Run ${node.config.agentId}` : 'No agent selected';
    case 'script':
      return node.config.command.trim() || 'No command';
    case 'join':
      return `${node.config.mode} · ${node.config.inputs} inputs`;
    case 'gate':
      return node.config.title.trim() || 'No title';
    case 'router':
      return node.config.mode === 'agent-label'
        ? `Agent label · ${node.config.cases.length} case${node.config.cases.length === 1 ? '' : 's'}`
        : `Expression · ${node.config.cases.length} case${node.config.cases.length === 1 ? '' : 's'}`;
    case 'verify':
      switch (node.config.check) {
        case 'agent':
          return node.config.agentId.trim() ? `Agent verdict · ${node.config.agentId}` : 'No agent selected';
        case 'exit-code':
          return node.config.command.trim() ? `Exit code · ${node.config.command}` : 'No command';
        case 'test-counts':
          return node.config.command.trim() ? `Test counts (${node.config.parser})` : 'No command';
        case 'json-path':
          return node.config.op === 'empty'
            ? `${node.config.source || '…'} is empty`
            : `${node.config.source || '…'} ${node.config.op} ${node.config.right || '…'}`;
      }
      break;
    case 'trigger':
      if (node.config.on === 'manual') return 'Manual';
      if (node.config.on === 'schedule') return `Schedule · ${node.config.cron}`;
      return `Forge PR · ${node.config.events.join('/')}`;
  }
}
