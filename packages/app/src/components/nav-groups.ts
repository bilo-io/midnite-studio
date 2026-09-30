import type { IconType } from 'react-icons';

import type { ViewId } from '../store/ui-store';
import { VIEW_ICON } from './nav-icons';

/**
 * The rail's destinations as data — the one source both the sidenav
 * (`app.tsx`) and Settings ▸ Sidebar read, so the groups, their order, each
 * item's label, glyph and one-line description cannot drift between the two.
 * `description` is required: a new rail item does not compile without one.
 */
export type RailNavItem = {
  view: ViewId;
  label: string;
  icon: IconType;
  description: string;
};

/** Top-level views above the sections; the rail draws no header for them. */
export const PINNED_NAV_ITEMS: RailNavItem[] = [
  {
    view: 'dashboard',
    label: 'Dashboard',
    icon: VIEW_ICON.dashboard,
    description: "The repository's front page: activity, checks and what needs attention",
  },
  {
    view: 'notes',
    label: 'Notes',
    icon: VIEW_ICON.notes,
    description: 'Markdown notes, kept per repository or globally',
  },
  {
    view: 'knowledge',
    label: 'Knowledge',
    icon: VIEW_ICON.knowledge,
    description: "Explore the repository's knowledge graph of code and concepts",
  },
  {
    view: 'sessions',
    label: 'Sessions',
    icon: VIEW_ICON.sessions,
    description: 'Every terminal and agent session, live and finished',
  },
];

export const WORKSPACE_NAV_ITEMS: RailNavItem[] = [
  {
    view: 'files',
    label: 'Explorer',
    icon: VIEW_ICON.files,
    description: 'Browse the checked-out tree and preview files',
  },
  {
    view: 'search',
    label: 'Search',
    icon: VIEW_ICON.search,
    description: 'Search commits by message, author or pickaxe',
  },
  {
    view: 'optimizer',
    label: 'Optimizer',
    icon: VIEW_ICON.optimizer,
    description: 'Scan memory, GPU and storage use and reclaim space',
  },
  {
    view: 'tests',
    label: 'Tests',
    icon: VIEW_ICON.tests,
    description: 'Discover test suites by package and run them',
  },
  {
    view: 'database',
    label: 'Database',
    icon: VIEW_ICON.database,
    description: 'Connections, schema tree and a query editor with results',
  },
  {
    view: 'apiClient',
    label: 'API Client',
    icon: VIEW_ICON.apiClient,
    description: 'Send requests from collections stored in the repository',
  },
];

export const GIT_NAV_ITEMS: RailNavItem[] = [
  {
    view: 'tasks',
    label: 'Tasks',
    icon: VIEW_ICON.tasks,
    description: 'Issues and projects from the forge, as a table or board',
  },
  {
    view: 'graph',
    label: 'Graph',
    icon: VIEW_ICON.graph,
    description: 'Commit graph, branches and worktrees',
  },
  {
    view: 'actions',
    label: 'Actions',
    icon: VIEW_ICON.actions,
    description: 'CI workflow runs and their logs',
  },
  {
    view: 'reviews',
    label: 'Reviews',
    icon: VIEW_ICON.reviews,
    description: 'Pull requests you opened, are asked to review, or all open',
  },
  {
    view: 'history',
    label: 'History',
    icon: VIEW_ICON.history,
    description: "The reflog and this app's own journal of git writes",
  },
];

export const AGENT_NAV_ITEMS: RailNavItem[] = [
  {
    view: 'councils',
    label: 'Councils',
    icon: VIEW_ICON.councils,
    description: 'Agent councils that debate a question',
  },
  {
    view: 'workflows',
    label: 'Workflows',
    icon: VIEW_ICON.workflows,
    description: 'Build and run node-based automations',
  },
  {
    view: 'media',
    label: 'Media',
    icon: VIEW_ICON.media,
    description: 'Docs, images, video and audio in one place',
  },
  {
    view: 'models',
    label: 'Models',
    icon: VIEW_ICON.models,
    description: 'Install, discover and run local and cloud models',
  },
];

export type RailGroupKey = 'workspace' | 'git' | 'agents';

/** The three headed sections, in rail order. Keys match `collapsedNavSections`. */
export const RAIL_GROUPS: readonly { key: RailGroupKey; title: string; items: RailNavItem[] }[] = [
  { key: 'workspace', title: 'Workspace', items: WORKSPACE_NAV_ITEMS },
  { key: 'git', title: 'Git', items: GIT_NAV_ITEMS },
  { key: 'agents', title: 'Agents', items: AGENT_NAV_ITEMS },
];
