import { useMutation } from '@tanstack/react-query';

import type { RepoSkill } from '@midnite/studio-shared';

import { useTasksHost, type TasksData, type TasksHost } from './host';

/**
 * The forge reads and writes Tasks makes, resolved through the host (Phase 113
 * Theme O). The hooks themselves are the forge feature's — the composing app
 * hands them in — so these wrappers keep every call site as it was when it
 * imported them from the app's `services/queries`.
 */

type Args<K extends keyof TasksData> = Parameters<NonNullable<TasksData[K]>>;

export const useRemotes = (...args: Args<'useRemotes'>) => useTasksHost().data.useRemotes(...args);
/** The open repo's forge kind and capability — what the app's `useActiveForgeCapability` answers. */
export const useActiveForgeCapability = (...args: Args<'useForgeCapability'>) =>
  useTasksHost().data.useForgeCapability(...args);
export const useForgeSubscription = (...args: Args<'useForgeSubscription'>) =>
  useTasksHost().data.useForgeSubscription(...args);
export const useForgeIssues = (...args: Args<'useForgeIssues'>) => useTasksHost().data.useForgeIssues(...args);
export const useForgeIssueDetail = (...args: Args<'useForgeIssueDetail'>) =>
  useTasksHost().data.useForgeIssueDetail(...args);
export const useForgeIssueComments = (...args: Args<'useForgeIssueComments'>) =>
  useTasksHost().data.useForgeIssueComments(...args);
export const useForgeProjects = (...args: Args<'useForgeProjects'>) => useTasksHost().data.useForgeProjects(...args);
export const useForgeProjectFields = (...args: Args<'useForgeProjectFields'>) =>
  useTasksHost().data.useForgeProjectFields(...args);
export const useForgeProjectItems = (...args: Args<'useForgeProjectItems'>) =>
  useTasksHost().data.useForgeProjectItems(...args);
export const useSetProjectItemField = (...args: Args<'useSetProjectItemField'>) =>
  useTasksHost().data.useSetProjectItemField(...args);
export const useClearProjectItemField = (...args: Args<'useClearProjectItemField'>) =>
  useTasksHost().data.useClearProjectItemField(...args);
export const useAddProjectItem = () => useTasksHost().data.useAddProjectItem();
export const useCommentIssue = (...args: Args<'useCommentIssue'>) => useTasksHost().data.useCommentIssue(...args);
export const useSetIssueState = (...args: Args<'useSetIssueState'>) => useTasksHost().data.useSetIssueState(...args);
export const useCreateIssue = (...args: Args<'useCreateIssue'>) => useTasksHost().data.useCreateIssue(...args);
export const useEditIssue = (...args: Args<'useEditIssue'>) => useTasksHost().data.useEditIssue(...args);
export const useDeleteIssue = (...args: Args<'useDeleteIssue'>) => useTasksHost().data.useDeleteIssue(...args);
export const useCreateProject = (...args: Args<'useCreateProject'>) => useTasksHost().data.useCreateProject(...args);
export const useEditProject = (...args: Args<'useEditProject'>) => useTasksHost().data.useEditProject(...args);
export const useDeleteProject = (...args: Args<'useDeleteProject'>) => useTasksHost().data.useDeleteProject(...args);
export const useLinkIssues = () => useTasksHost().data.useLinkIssues();

const NO_REPO_SKILLS: { data: readonly RepoSkill[] | undefined } = { data: undefined };

function useNoRepoSkills(_repoId: string | null, _agentId: string): { data: readonly RepoSkill[] | undefined } {
  return NO_REPO_SKILLS;
}

/** The open repo's own agent skills — or none, where the app cannot list them. */
export function useRepoSkills(repoId: string | null, agentId: string): { data: readonly RepoSkill[] | undefined } {
  const useImpl = useTasksHost().data.useRepoSkills ?? useNoRepoSkills;
  return useImpl(repoId, agentId);
}

type PlanBlueprint = ReturnType<NonNullable<TasksHost['usePlanBlueprint']>>;

function useNoPlanBlueprint(): PlanBlueprint {
  // Never reached through the UI — `PlanWithAiBar` is not drawn without the host's
  // member — but a hook must answer something: a mutation that says so.
  return useMutation({
    mutationFn: async () => ({ ok: false as const, kind: 'error' as const, message: 'Plan with AI is not available in this app' }),
  }) as unknown as PlanBlueprint;
}

/** Plan with AI's headless draft. */
export function usePlanBlueprint(): PlanBlueprint {
  const useImpl = useTasksHost().usePlanBlueprint ?? useNoPlanBlueprint;
  return useImpl();
}
