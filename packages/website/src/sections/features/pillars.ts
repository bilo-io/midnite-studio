import {
  LuBot,
  LuGitBranch,
  LuGithub,
  LuGitMerge,
  LuGlobe,
  LuHistory,
  LuLayoutDashboard,
  LuPanelsTopLeft,
  LuScanEye,
  LuTerminal,
  LuWaypoints,
} from 'react-icons/lu';

import type { GlowVariant } from '../../components';
import type { Glyph } from '../glyph';

export type PillarBullet = {
  Icon: Glyph;
  /** Two or three words. It is a label, not a sentence. */
  title: string;
  body: string;
};

export type Pillar = {
  /** Suffixes the card's DOM id, and is what the segment control switches on. */
  id: 'git' | 'agentic' | 'browser';
  name: string;
  Icon: Glyph;
  lede: string;
  /** Each pillar wears a different graph lane, so three cards read as three. */
  glow: GlowVariant;
  /** The lane colour again, for the icon. Kept beside `glow` so they cannot drift. */
  tint: string;
  bullets: readonly PillarBullet[];
};

/**
 * The three pillars, and every claim they make.
 *
 * Content lives here rather than in JSX so the section component is layout and
 * nothing else — which is what makes the same list render as three columns on a
 * wide screen and as one switchable panel on a narrow one without the copy
 * existing twice.
 *
 * **Every sentence below describes something that is built**, sourced from
 * `README.md` and the phase records in `.midnite/tasks/` — the graph and its
 * interactions (phases 5, 7, 8), the forge half (17, 20, 48, 54), the terminal
 * and its broker (9, 15, 30), session history (67), the Kanban board (41, 50,
 * 75) and the embedded browser (27, 32, 71). There are no numbers on this page
 * for a reason: a benchmark nobody can reproduce is worth less than a sentence
 * that turns out to be true when the app opens.
 *
 * **Three bullets a pillar, and that is a cap rather than a coincidence.** The
 * Agentic pillar had a fourth — Loops, the mission-control panel — and it is
 * gone: not because the feature is, but because a card with four claims beside
 * two cards with three reads as the important one, and Loops is the least
 * legible of the four to somebody who has never opened the app. The invariant
 * is asserted in `features.test.tsx`, so a fifth claim has to be an argument
 * rather than an append.
 */
export const PILLARS: readonly Pillar[] = [
  {
    id: 'git',
    name: 'Git',
    Icon: LuGitBranch,
    lede:
      'The whole client, driven by the real git CLI — so your credential helpers, SSH agent and commit signing work with no configuration of ours.',
    glow: 'lane-1',
    tint: 'text-lane-1',
    bullets: [
      {
        Icon: LuGitMerge,
        title: 'Full client',
        body:
          'Stage, commit, branch, tag, merge, rebase, cherry-pick, stash and reset, with every repository and its linked worktrees nested in one sidebar. Anything that can orphan commits asks first, and says how many.',
      },
      {
        Icon: LuWaypoints,
        title: 'Interactive graph',
        body:
          'Coloured branch lanes, laid out off the render thread and drawn one SVG per row. Right-click a commit to branch or reset, double-click a badge to check it out, drag a branch onto another to merge or rebase.',
      },
      {
        Icon: LuGithub,
        title: 'GitHub integration',
        body:
          'Pull requests, checks, review threads and issues in the same window: read the diff with syntax highlighting, reply to a thread, and apply a suggested change straight to your working tree.',
      },
    ],
  },
  {
    id: 'agentic',
    name: 'Agentic',
    Icon: LuBot,
    lede:
      'Agents run where the repository already is — in your own shell, in the worktree you picked, against the task they were given.',
    glow: 'lane-2',
    tint: 'text-lane-2',
    bullets: [
      {
        Icon: LuTerminal,
        title: 'Terminal',
        body:
          'Your real login shell in the selected worktree, on Ctrl+` on every platform. The pty lives in a broker process outside the window, so a session survives a reload, a window close and a relaunch.',
      },
      {
        Icon: LuHistory,
        title: 'Task integration',
        body:
          'A named session per piece of work, beside the agent roster that started it. Closing one is recorded rather than erased, so the transcript is still there when you come looking for it.',
      },
      {
        Icon: LuLayoutDashboard,
        title: 'Kanban',
        body:
          'A GitHub Project as a board whose cards can launch an agent against their own task, and whose columns are the project’s own Status field.',
      },
    ],
  },
  {
    id: 'browser',
    name: 'Browser',
    Icon: LuGlobe,
    lede:
      'A real browser with tabs, docked beside the thing you are building rather than in another application.',
    glow: 'lane-4',
    tint: 'text-lane-4',
    bullets: [
      {
        Icon: LuHistory,
        title: 'Session restoration',
        body:
          'It keeps a persistent session partition of its own, with every permission denied by default — so a login to your staging environment is still a login after a relaunch, and no page gets your camera.',
      },
      {
        Icon: LuPanelsTopLeft,
        title: 'Side-by-side docking',
        body:
          'Dock it beside the graph or give it the whole window, and drag the split as narrow as 320px. Links from anywhere in the app — a pull request, a check, a preview deploy — open in a tab here.',
      },
      {
        Icon: LuScanEye,
        title: 'Lighter on a shared process',
        body:
          'It is a view inside the window you already have open, not a second application to launch — and when something in the app covers it, the view stops rendering instead of painting underneath.',
      },
    ],
  },
];
