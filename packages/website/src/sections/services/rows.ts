import type { ComponentType } from 'react';

import { ChecksArt, KanbanArt, WindowArt } from './illustrations';

export type ServiceRow = {
  /** Suffixes the row's heading id. */
  id: 'automate-kanban' | 'track-ci' | 'integrated';
  eyebrow: string;
  title: string;
  /** Two or three sentences. The outcome first, the mechanism second. */
  body: string;
  /** The mechanism, itemised — what makes the paragraph above true. */
  how: readonly string[];
  Art: ComponentType;
};

/**
 * The three rows, outcome first.
 *
 * Each one names something you can do and then says how, because "how" is the
 * only part a reader cannot verify from a screenshot — and because the how is
 * where this app is actually unusual. A drag that is a GitHub mutation rather
 * than optimistic local state, a suggested change that lands in the working
 * tree rather than on a server branch, five surfaces sharing one window: those
 * are the claims, and each is a phase in `.midnite/tasks/` — 41/50/75 for the
 * board, 17/20/48/54 for the forge, 27/32/61/66/71 for the window.
 *
 * No metrics. Nothing that is not built.
 */
export const SERVICE_ROWS: readonly ServiceRow[] = [
  {
    id: 'automate-kanban',
    eyebrow: 'Automate the board',
    title: 'A Kanban board that runs the work',
    body:
      'Point the app at a GitHub Project and you get a board whose columns are the project’s own Status field and whose cards are its items. A card can launch an agent against its own task and keep that run’s terminal inside the card, so the work and the record of the work are the same object. Dragging a card between columns is the field write itself — not local state that reconciles later and disagrees with GitHub in the meantime.',
    how: [
      'Columns are the project’s Status single-select; cards are its items.',
      'A card launches an agent against its own task, with the run’s terminal inside it.',
      'A drag is the project field mutation, so the board and GitHub cannot drift.',
      'Blocked-by edges are drawn as a graph, so what is waiting on what is visible.',
    ],
    Art: KanbanArt,
  },
  {
    id: 'track-ci',
    eyebrow: 'Keep the forge in view',
    title: 'Track CI, and finish a review where you are',
    body:
      'The forge half of the window reads the same repository the graph does: open pull requests, their check runs, the files they touch, and every review thread in place. You can read a syntax-highlighted diff and reply to a thread without leaving the app. When a reviewer leaves a suggested change, applying it writes the block into your working tree — where it is an ordinary edit you stage, review and commit like any other.',
    how: [
      'Pull request detail: check runs, files and a syntax-highlighted diff.',
      'Review threads read and replied to in place, beside the lines they are about.',
      'A suggested change applies to your working tree, not to a branch on the server.',
      'Issues and workflow runs sit on the same rail, against the same repository.',
    ],
    Art: ChecksArt,
  },
  {
    id: 'integrated',
    eyebrow: 'One window',
    title: 'A development environment that is actually integrated',
    body:
      'The graph, your login shell, a docked browser, an HTTP client and a database explorer are rows on one rail, not five applications with five update prompts. They share a window, a theme and a keyboard map, and they all point at the repository you already have open. The API client reads and writes Postman collections from disk, and the explorer runs a query and puts the rows in a grid — so the tab you would have opened for either of them stays closed.',
    how: [
      'The commit graph, with repositories and their linked worktrees in one tree.',
      'Your real login shell, in a broker process that outlives the window.',
      'The browser, docked beside the graph or taking the whole frame.',
      'An HTTP client whose collections are Postman v2.1 files on disk.',
      'A database explorer with a query tab and a results grid.',
    ],
    Art: WindowArt,
  },
];
