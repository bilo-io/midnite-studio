import { createPersistedStore, DEFAULT_AGENT_SKILLS } from '@midnite/studio-frame';
import type { TasksUiState } from '@midnite/studio-feature-tasks/renderer';
import {
  DEFAULT_PROJECT_VIEW,
  touchCardSkill,
  touchProjectView,
  type ProjectViewState,
} from '@midnite/studio-feature-tasks/renderer/state';
import { useStore } from 'zustand';

import { coderStore } from '../coder-store';

/**
 * What Coder's Tasks tab remembers (Phase 113 Theme O) — the slice of Studio's `ui-store` the Tasks
 * feature reads, kept in this window's localStorage under `midnite-coder.tasks`: which board each
 * repository shows, the table/board/graph mode, each board's filter, grouping, sort and collapsed
 * columns (bounded by the feature's own LRU, as Studio's is), the dependency field's name, and each
 * card's skill.
 *
 * Two values are not Tasks' own and are read from where Coder already keeps them, never copied:
 * the review-actions switch (`coderStore.writesEnabled`, the same one Reviews obeys — forge writes
 * stay off until the user turns them on) and the board memory Reviews' "Add to project" writes
 * (`midnite-coder.forge.projectBoardByRepo`), so the two tabs agree on a repository's board as
 * Studio's do.
 *
 * The agent skills are the built-in defaults: Coder has no Settings ▸ Agent page to point them
 * elsewhere, and no agent of its own (`primaryAgent` only names whose skill directory a card's
 * suggestions would read, and Coder lists none).
 */

type Persisted = Pick<
  TasksUiState,
  'projectsMode' | 'projectViewByProject' | 'blockedByFieldName' | 'cardSkillByTask' | 'columnSkillByProject'
>;

const BOARD_KEY = 'midnite-coder.forge.projectBoardByRepo';

function readBoards(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(BOARD_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeBoards(boards: Record<string, string>): void {
  try {
    window.localStorage.setItem(BOARD_KEY, JSON.stringify(boards));
  } catch {
    // Private window or blocked storage: the choice lasts for this session.
  }
}

export const coderTasksStore = createPersistedStore<TasksUiState, Persisted>({
  key: 'midnite-coder.tasks',
  defaults: {
    projectsMode: {},
    projectViewByProject: {},
    blockedByFieldName: 'Blocked by',
    cardSkillByTask: {},
    columnSkillByProject: {},
  },
  pick: ({ projectsMode, projectViewByProject, blockedByFieldName, cardSkillByTask, columnSkillByProject }) => ({
    projectsMode,
    projectViewByProject,
    blockedByFieldName,
    cardSkillByTask,
    columnSkillByProject,
  }),
  state: (set, initial) => ({
    ...initial,
    forgeWritesEnabled: coderStore.getState().writesEnabled,
    projectBoardByRepo: readBoards(),
    setProjectBoard: (repoId, projectId) =>
      set((state) => {
        const projectBoardByRepo = { ...state.projectBoardByRepo, [repoId]: projectId };
        writeBoards(projectBoardByRepo);
        return { projectBoardByRepo };
      }),
    setProjectsMode: (repoId, mode) => set((state) => ({ projectsMode: { ...state.projectsMode, [repoId]: mode } })),
    setProjectView: (projectId: string, patch: Partial<ProjectViewState>) =>
      set((state) => {
        const current = state.projectViewByProject[projectId] ?? DEFAULT_PROJECT_VIEW;
        return { projectViewByProject: touchProjectView(state.projectViewByProject, projectId, { ...current, ...patch }) };
      }),
    primaryAgent: 'claude',
    agentSkills: DEFAULT_AGENT_SKILLS,
    setCardSkill: (taskKey, skill) =>
      set((state) => {
        const skillId = skill?.trim() === '' ? undefined : skill;
        if (skillId === undefined) {
          const { [taskKey]: _dropped, ...rest } = state.cardSkillByTask;
          return { cardSkillByTask: rest };
        }
        return { cardSkillByTask: touchCardSkill(state.cardSkillByTask, taskKey, skillId) };
      }),
  }),
});

// The review-actions switch is Coder's (the header's "Review actions" box); Tasks reads it, never writes it.
coderStore.subscribe((state, previous) => {
  if (state.writesEnabled !== previous.writesEnabled) coderTasksStore.setState({ forgeWritesEnabled: state.writesEnabled });
});

export function useCoderTasksUi<T>(selector: (state: TasksUiState) => T): T {
  return useStore(coderTasksStore, selector);
}
