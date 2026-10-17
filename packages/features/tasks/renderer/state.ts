import { LuListTodo } from 'react-icons/lu';

import { EMPTY_PROJECT_ITEM_FILTER, type ProjectItemFilterState } from './filter';
import { DEFAULT_GRAPH_FACETS, type ProjectGraphFacets } from './graph/graph-filter';
import type { SortState } from './sort';

/**
 * The Tasks feature's state vocabulary and pure helpers (Phase 113 Theme O) —
 * what a composing app's own store, settings pages and launchers need without
 * pulling in a view. Studio's `ui-store` persists `ProjectViewState`,
 * `cardSkillByTask` and `columnSkillByProject` with these helpers, its
 * Settings ▸ Projects page reads the column-skill defaults, and its own
 * terminal-bound card controls (Play, the composer, Auto-mate) compose the
 * prompts with the same functions the feature does, so a card's launch text
 * cannot drift between the two.
 *
 * No React component is exported here: `ui-store` loads this on boot.
 */

/** The Tasks view's icon, wherever an app draws it (the rail, an empty state). */
export const TASKS_ICON = LuListTodo;

/**
 * One project board's view state (Phase 52 Theme D) — everything that
 * answers "how am I looking at this board" rather than "which board".
 */
export type ProjectViewState = {
  filter: ProjectItemFilterState;
  /** `null` means "let `resolveGroupField` pick" — no choice has been made. */
  groupFieldId: string | null;
  sort: SortState;
  collapsedColumns: readonly string[];
  /**
   * The dependency graph's own facets (Phase 75 Theme H) — kept on this same
   * project-keyed record rather than a repo-keyed one, since a facet
   * describing the board's own shape should follow the board across every
   * repo that reaches it, exactly like `filter` already does. Only ever read
   * while `projectsMode` is `'graph'`.
   *
   * **Optional, deliberately:** a `ProjectViewState` persisted before this
   * theme landed has no `graph` at all, and `projectViewByProject`'s own
   * persisted merge replaces one project's whole record rather than
   * re-spreading it field by field. A reader defaults this at the point of use
   * (`view.graph ?? DEFAULT_GRAPH_FACETS`) rather than trusting this object's
   * own presence.
   */
  graph?: ProjectGraphFacets;
};

export const DEFAULT_PROJECT_VIEW: ProjectViewState = {
  filter: EMPTY_PROJECT_ITEM_FILTER,
  groupFieldId: null,
  sort: null,
  collapsedColumns: [],
  graph: DEFAULT_GRAPH_FACETS,
};

export { EMPTY_PROJECT_ITEM_FILTER, type ProjectItemFilterState } from './filter';
export { DEFAULT_GRAPH_FACETS, type ProjectGraphFacets } from './graph/graph-filter';
export type { SortState } from './sort';
export { touchProjectView } from './project-view-lru';
export { touchCardSkill } from './board/card-skill-lru';
export { REPO_ISSUES_SOURCE_ID } from './repo-issues-source';
export { useBoardSelectionStore } from './board-selection-store';
export {
  columnSkillKey,
  composeCardPrompt,
  composeSkillLaunchPrompt,
  CONCURRENT_CARD_SESSION_SOFT_LIMIT,
  countLiveCardSessions,
  decideColumnSkillAction,
  DEFAULT_COLUMN_SKILLS,
  deriveColumns,
  resolveColumnSkill,
  resolveMostRecentAgentId,
  type BoardColumn,
} from './board/board-derive';
export { findTodoColumn, nextUnblockedCard } from './board/automate-derive';
export { defaultCardSkill } from './board/card-skill';
