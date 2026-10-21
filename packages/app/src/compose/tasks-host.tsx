import type { TasksHost, TasksIssueStatusPillProps, TasksTerminalPort } from '@midnite/studio-feature-tasks/renderer';
import { issueStatus, StatusPill } from '@midnite/studio-feature-forge/renderer';
import { PresentButton, useSlidesStore } from '@midnite/studio-feature-slides/renderer';

import { ForgeRefLink } from '../components/forge-ref-link';
import { Modal } from '../components/modal';
import { MultiSelectMenu } from '../components/multi-select-menu';
import { useToasts } from '../components/toast-host';
import { useDismissable } from '../components/use-dismissable';
import { UserAvatar } from '../components/user-avatar';
import { WandField } from '../components/wand-field';
import { ActivityBadgeStack } from '../features/activity/activity-badge';
import { ExternalLink } from '../features/markdown/external-link';
import { AutomateToggle } from '../features/tasks/board/automate-toggle';
import { CardComposer } from '../features/tasks/board/card-composer';
import { CardTerminal } from '../features/tasks/board/card-terminal';
import { useAutomate } from '../features/tasks/board/use-automate';
import { useCardPlay } from '../features/tasks/board/use-card-play';
import { closeSessionWithConfirm } from '../features/terminal/close-session';
import { revealSession } from '../features/terminal/reveal-session';
import { resolveSessionAttribution } from '../features/terminal/session-attribution';
import { startAgent } from '../features/terminal/start-agent';
import { submitCommand } from '../features/terminal/submit-command';
import { ActivityIndicator } from '../features/terminal/terminal-session-list';
import { useTerminalStore } from '../features/terminal/terminal-store';
import { useCascadeReveal } from '../lib/use-cascade-reveal';
import { bridge } from '../services/bridge';
import {
  useActiveForgeCapability,
  useAddProjectItem,
  useClearProjectItemField,
  useCommentIssue,
  useCreateIssue,
  useCreateProject,
  useDeleteIssue,
  useDeleteProject,
  useEditIssue,
  useEditProject,
  useForgeIssueComments,
  useForgeIssueDetail,
  useForgeIssues,
  useForgeProjectFields,
  useForgeProjectItems,
  useForgeProjects,
  useLinkIssues,
  usePlanBlueprint,
  useRemotes,
  useRepoSkills,
  useSetIssueState,
  useSetProjectItemField,
} from '../services/queries';
import { lookupRepoIdByForge } from '../services/repo-forge-registry';
import { useForgeSubscription } from '../services/use-forge-subscription';
import { useActiveWorktree } from '../services/use-status';
import { openIssueModal } from '../store/issue-modal-store';
import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the Tasks feature's host port (Phase 113 Theme O).
 *
 * Every member is what the Tasks view imported directly before it moved into
 * `packages/features/tasks`, so the view looks and behaves exactly as it did:
 * the ui slice is `useUiStore` itself (nothing it persists moved), the forge
 * reads are the same query hooks under the same keys, and the terminal group
 * is Studio's own terminal store, launcher and card controls — Play, the
 * composer, Auto-mate and drag-to-skill start agents exactly as Phase 92 and
 * Phase 50 left them.
 */

function IssueStatusPill({ issue }: TasksIssueStatusPillProps) {
  return <StatusPill status={issueStatus(issue)} />;
}

const STUDIO_TASKS_TERMINAL: TasksTerminalPort = {
  useTerminal: (selector) => useTerminalStore(selector),
  getTerminal: () => useTerminalStore.getState(),
  revealSession,
  closeSessionWithConfirm: (dialogs, session) =>
    closeSessionWithConfirm(dialogs as Parameters<typeof closeSessionWithConfirm>[0], session),
  startCardAgent: ({ projectId, itemId, ...input }) =>
    startAgent({
      ...input,
      surface: 'kanban',
      taskRef: { projectId, itemId },
      ...resolveSessionAttribution(projectId),
    }),
  ActivityIndicator,
  CardTerminal,
  CardComposer,
  useCardPlay,
  useAutomate,
  AutomateToggle,
};

export const STUDIO_TASKS_HOST: TasksHost = {
  useUi: (selector) => useUiStore(selector),
  getUi: () => useUiStore.getState(),
  data: {
    useRemotes,
    useForgeCapability: useActiveForgeCapability,
    useForgeSubscription,
    useForgeIssues,
    useForgeIssueDetail,
    useForgeIssueComments,
    useForgeProjects,
    useForgeProjectFields,
    useForgeProjectItems,
    useSetProjectItemField,
    useClearProjectItemField,
    useAddProjectItem,
    useCommentIssue,
    useSetIssueState,
    useCreateIssue,
    useEditIssue,
    useDeleteIssue,
    useCreateProject,
    useEditProject,
    useDeleteProject,
    useLinkIssues,
    useRepoSkills,
  },
  useActiveRepo: useActiveWorktree,
  UserAvatar,
  ExternalLink,
  ForgeRefLink,
  MultiSelectMenu,
  Modal,
  IssueStatusPill,
  ActivityBadgeStack,
  useDismissable: (options) => {
    useDismissable(options);
  },
  useCascadeReveal,
  useToasts,
  copyText: async (text) => {
    const result = await bridge()?.clipboard.writeText({ text });
    return result?.ok === true;
  },
  WandField,
  PresentButton,
  setActiveMarkdown: (source) => useSlidesStore.getState().setActiveMarkdown(source),
  openIssue: (target) => openIssueModal(target),
  lookupRepoIdByForge,
  runCommand: (command, title) => {
    submitCommand(command, title);
  },
  usePlanBlueprint,
  terminal: STUDIO_TASKS_TERMINAL,
};
