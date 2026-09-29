import type { WorkflowNode, WorkflowNodeKind } from '@midnite/studio-shared';
import {
  LuBadgeCheck,
  LuBell,
  LuBot,
  LuBraces,
  LuCheckCheck,
  LuCircleDot,
  LuClipboardCopy,
  LuClock,
  LuDatabase,
  LuFilePen,
  LuFileText,
  LuFrame,
  LuGitBranch,
  LuGitCommitHorizontal,
  LuGlobe,
  LuLayers,
  LuMerge,
  LuMessageSquare,
  LuOctagonX,
  LuScanText,
  LuShieldAlert,
  LuShieldCheck,
  LuShuffle,
  LuSparkles,
  LuSplit,
  LuSquareTerminal,
  LuStickyNote,
  LuTerminal,
  LuTimer,
  LuVariable,
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
 * The node palette's labelled, collapsible sections, in display order. A
 * group is what a kind is *for* ("which shelf do I look on"), which is a
 * different axis from {@link NodeCategory}'s hue — `verify` and `gate` are
 * both `logic`-tinted, but both also sit under "Control flow" here, while
 * `http` (an `action` hue) sits under "Actions" beside `script`.
 *
 * Declared as a closed list so {@link NODE_KIND_META}'s required `group`
 * field can only name one of these — a new kind cannot be left ungrouped
 * (the `Record` over `WorkflowNodeKind` makes the entry itself mandatory, and
 * the field makes the group mandatory within it). `node-kind-meta.test.ts`
 * asserts the converse: no group is left empty.
 */
export const NODE_GROUPS = [
  { id: 'triggers', label: 'Triggers' },
  { id: 'ai', label: 'Agents & AI' },
  { id: 'control', label: 'Control flow' },
  { id: 'actions', label: 'Actions' },
  { id: 'git', label: 'Git & forge' },
  { id: 'data', label: 'Data & transform' },
  { id: 'output', label: 'Output & notify' },
  { id: 'harness', label: 'Harness & notes' },
] as const;
export type NodeGroup = (typeof NODE_GROUPS)[number]['id'];

/**
 * Icon + toolbar label + category + palette group per node kind — one table
 * read by the canvas's node view, the node palette (Theme I) and the "add node" toolbar,
 * so none of the three can show a different glyph, name or tint for the same
 * kind.
 */
export const NODE_KIND_META: Record<
  WorkflowNodeKind,
  {
    label: string;
    icon: IconComponent;
    category: NodeCategory;
    group: NodeGroup;
    description: string;
  }
> = {
  http: {
    label: 'HTTP',
    icon: LuGlobe,
    category: 'action',
    group: 'actions',
    description: 'Call a URL and capture the response.',
  },
  transform: {
    label: 'Transform',
    icon: LuShuffle,
    category: 'data',
    group: 'data',
    description: 'Pick and rename fields from upstream output.',
  },
  condition: {
    label: 'Condition',
    icon: LuGitBranch,
    category: 'logic',
    group: 'control',
    description: 'Gate everything downstream on a comparison.',
  },
  delay: {
    label: 'Delay',
    icon: LuClock,
    category: 'action',
    group: 'control',
    description: 'Pause the run for a fixed time.',
  },
  note: {
    label: 'Note',
    icon: LuStickyNote,
    category: 'storage',
    group: 'harness',
    description: 'A label on the canvas — never runs.',
  },
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
    group: 'ai',
    description: 'Run a roster agent in a real terminal session.',
  },
  script: {
    label: 'Script',
    icon: LuSquareTerminal,
    category: 'action',
    group: 'actions',
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
    group: 'control',
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
    group: 'control',
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
    group: 'control',
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
    group: 'control',
    description:
      'Check the upstream result — agent verdict, exit code, test counts or a JSON path.',
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
    group: 'triggers',
    description: 'Start the run — manual, on a schedule, or a forge PR event.',
  },
  /**
   * Phase 97 Theme G. `data` hue, beside `transform` — a `state` node's job
   * is durable per-run storage, not a routing decision, so it takes the
   * data-shaped tint rather than `logic`'s.
   */
  state: {
    label: 'State',
    icon: LuDatabase,
    category: 'data',
    group: 'data',
    description: "Write a value into this run's durable state — set, merge, or append.",
  },
  /**
   * Phase 97 Theme I. `storage` hue, beside `note` — canvas furniture that
   * groups nodes rather than a step with its own side effect, exactly like
   * `note`'s own reasoning. `LuFrame` — the actual glyph its own name
   * suggests, for the literal "frame" the Harness diagram draws.
   */
  frame: {
    label: 'Frame',
    icon: LuFrame,
    category: 'storage',
    group: 'harness',
    description: 'Group nodes under a shared contract, context and policy — the harness, drawn.',
  },
  /**
   * Phase 97 Theme I. `logic` hue, beside `gate` — a permission decision,
   * not an action with its own side effect. `LuShieldAlert`, not `gate`'s
   * `LuShieldCheck`: a policy is a boundary a node's declared actions are
   * checked against, not a human's own approve/reject call (which is what
   * `requireApprovalFor` routes through — an ordinary gate wait, just
   * triggered by this node rather than sitting in the graph as one).
   */
  policy: {
    label: 'Policy',
    icon: LuShieldAlert,
    category: 'logic',
    group: 'harness',
    description:
      'A permission gate — which actions downstream nodes may take, and which need approval.',
  },
  /*
   * The palette kinds (after Phase 97) — each group's "a few more". Hues
   * follow the rule the kinds above already set: a side effect is `action`,
   * a routing or guard decision is `logic`, shaping a value is `data`.
   */
  'ai-prompt': {
    label: 'Ask AI',
    icon: LuSparkles,
    category: 'action',
    group: 'ai',
    description: 'One headless prompt to a roster CLI or Ollama — clean text or JSON back, no terminal.',
  },
  'ai-extract': {
    label: 'AI extract',
    icon: LuScanText,
    category: 'action',
    group: 'ai',
    description: 'Pull named fields out of free text into a JSON object.',
  },
  assert: {
    label: 'Assert',
    icon: LuCheckCheck,
    category: 'logic',
    group: 'control',
    description: 'Fail the step unless a comparison holds — a guard, not a branch.',
  },
  fail: {
    label: 'Fail',
    icon: LuOctagonX,
    category: 'logic',
    group: 'control',
    description: 'End this branch with an error and a message of your own.',
  },
  command: {
    label: 'Command',
    icon: LuTerminal,
    category: 'action',
    group: 'actions',
    description: 'Run a shell command headlessly and capture stdout, stderr and the exit code.',
  },
  'read-file': {
    label: 'Read file',
    icon: LuFileText,
    category: 'action',
    group: 'actions',
    description: "Read a file's contents as text or parsed JSON.",
  },
  'git-status': {
    label: 'Git status',
    icon: LuGitCommitHorizontal,
    category: 'data',
    group: 'git',
    description: "A repository's branch, HEAD and staged/unstaged counts.",
  },
  'forge-comment': {
    label: 'Comment',
    icon: LuMessageSquare,
    category: 'action',
    group: 'git',
    description: 'Post a comment on a pull request or issue.',
  },
  'forge-issue': {
    label: 'Create issue',
    icon: LuCircleDot,
    category: 'action',
    group: 'git',
    description: "Open a new issue on the repository's forge.",
  },
  'set-fields': {
    label: 'Set fields',
    icon: LuVariable,
    category: 'data',
    group: 'data',
    description: 'Build an object from values you type — constants, composed text, JSON.',
  },
  'json-extract': {
    label: 'JSON extract',
    icon: LuBraces,
    category: 'data',
    group: 'data',
    description: 'Parse JSON text and read one path out of it.',
  },
  coalesce: {
    label: 'First value',
    icon: LuLayers,
    category: 'data',
    group: 'data',
    description: 'The first of several values that exists — for after a router or an any-join.',
  },
  notify: {
    label: 'Notify',
    icon: LuBell,
    category: 'action',
    group: 'output',
    description: 'Show a desktop notification.',
  },
  'write-file': {
    label: 'Write file',
    icon: LuFilePen,
    category: 'action',
    group: 'output',
    description: "Write or append text to a file — governed by a policy's write-files action.",
  },
  clipboard: {
    label: 'Copy to clipboard',
    icon: LuClipboardCopy,
    category: 'action',
    group: 'output',
    description: 'Put text on the system clipboard.',
  },
};

/** One line describing what a node actually does, for the palette, the node card and the bottom run panel. */
export function nodeSummary(node: WorkflowNode): string {
  switch (node.kind) {
    case 'http':
      return node.config.url.trim()
        ? `${node.config.method} ${node.config.url}`
        : `${node.config.method} (no URL)`;
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
          return node.config.agentId.trim()
            ? `Agent verdict · ${node.config.agentId}`
            : 'No agent selected';
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
    case 'state':
      return node.config.key.trim()
        ? `${node.config.op} ${node.config.key}`
        : `${node.config.op} (no key)`;
    case 'frame':
      // Membership (`frameId`) lives on the MEMBER node, not here, so this
      // can only describe the frame's own slots, not who's inside it.
      return node.config.contract.trim() || node.config.context.trim()
        ? 'Contract set'
        : 'Empty harness';
    case 'policy':
      return node.config.allow.length === 0 ? 'Allows nothing' : `Allows ${node.config.allow.length}`;
    case 'ai-prompt':
      if (!node.config.prompt.trim()) return 'No prompt';
      return `${node.config.format === 'json' ? 'JSON' : 'Text'} · ${node.config.ollamaModel || node.config.agentId || 'any headless CLI'}`;
    case 'ai-extract':
      return node.config.fields.length === 0
        ? 'No fields'
        : `Extract ${node.config.fields.map((field) => field.key).join(', ')}`;
    case 'assert':
      return node.config.op === 'empty'
        ? `Assert ${node.config.left || '…'} is empty`
        : `Assert ${node.config.left || '…'} ${node.config.op} ${node.config.right || '…'}`;
    case 'fail':
      return node.config.message.trim() || 'Stop with an error';
    case 'command':
      return node.config.command.trim() || 'No command';
    case 'read-file':
      return node.config.path.trim() || 'No path';
    case 'git-status':
      return node.config.repoId.trim() || 'No repository';
    case 'forge-comment': {
      const noun = node.config.target === 'pr' ? 'PR' : 'Issue';
      return node.config.number.trim() ? `${noun} #${node.config.number.trim().replace(/^#/, '')}` : `No ${noun} number`;
    }
    case 'forge-issue':
      return node.config.title.trim() || 'No title';
    case 'set-fields': {
      const count = Object.keys(node.config.fields).length;
      return count === 0 ? 'No fields' : `${count} field${count === 1 ? '' : 's'}`;
    }
    case 'json-extract':
      return node.config.path.trim() ? `Path ${node.config.path}` : 'Whole document';
    case 'coalesce':
      return `${node.config.candidates.length} candidate${node.config.candidates.length === 1 ? '' : 's'}`;
    case 'notify':
      return node.config.title.trim() || 'No title';
    case 'write-file':
      if (!node.config.path.trim()) return 'No path';
      return `${node.config.mode === 'append' ? 'Append to' : 'Write'} ${node.config.path}`;
    case 'clipboard':
      return node.config.text.trim() || 'Nothing to copy';
  }
}
