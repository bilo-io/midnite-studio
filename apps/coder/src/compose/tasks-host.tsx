import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { LuX } from 'react-icons/lu';

import {
  issueStatus,
  StatusPill,
  useAddProjectItem,
  useClearProjectItemField,
  useCommentIssue,
  useCreateIssue,
  useCreateProject,
  useDeleteIssue,
  useDeleteProject,
  useEditIssue,
  useEditProject,
  useForgeCapabilities,
  useForgeIssueComments,
  useForgeIssueDetail,
  useForgeIssues,
  useForgeProjectFields,
  useForgeProjectItems,
  useForgeProjects,
  useForgeSubscription,
  useLinkIssues,
  useSetIssueState,
  useSetProjectItemField,
} from '@midnite/studio-feature-forge/renderer';
import type {
  TasksDismissableOptions,
  TasksHost,
  TasksIssueStatusPillProps,
  TasksModalProps,
  TasksToastApi,
} from '@midnite/studio-feature-tasks/renderer';
import { bridge, useToastStore } from '@midnite/studio-frame';
import { pickForgeRemote, type Remote } from '@midnite/studio-shared';

import { useCoderStore } from '../coder-store';
import { CODER_FORGE_HOST } from './coder-hosts';
import { coderTasksStore, useCoderTasksUi } from './tasks-store';

/**
 * Coder's side of the Tasks feature's host port (Phase 113 Theme O).
 *
 * The data is the forge feature's own hooks over Coder's forge channels — the same ones its Reviews
 * tab reads, answered by the forge feature's main half in Coder's main process, which reaches a
 * stored forge token only through the paired, granted runtime vault (`connectRuntimeVault`). Nothing
 * here asks for a credential: the renderer sees boards, issues and `hasToken`-style booleans, never a
 * stored value. Forge writes obey the same "Review actions" switch Reviews does.
 *
 * The chrome is the forge feature's standalone set (avatars, menus, links that open in the system
 * browser), a plain modal, an Escape/outside-click dismiss and the frame's toasts.
 *
 * **Left out, on purpose** — each a control that would start or reach something Coder does not have:
 * - `terminal`: Coder starts no terminal and has no agent roster, so a card shows no live session, no
 *   Play, no Stop, no composer and no Auto-mate, and a drop into a column with a mapped skill only
 *   moves the card. How a card's run reaches Agents is the agent hand-off, which is not built here.
 * - `openIssue`: Coder has no app-wide issue modal; an issue keeps its plain link.
 * - `runCommand`: no terminal to run `gh auth refresh` in; Reload only refetches, and the copy button
 *   beside the command stays.
 * - `usePlanBlueprint`, `WandField`, `useRepoSkills`: no headless agent and no skill directory read,
 *   so no Plan with AI, plain text fields, and the built-in skill list.
 * - `PresentButton`, `setActiveMarkdown`: Coder does not compose the slides feature.
 */

const useActiveRepo = (): { repoId: string | null } => ({ repoId: useCoderStore((s) => s.selectedRepoId) });

/** The key Studio and Coder's forge host read remotes under, so the cache is one entry per repository. */
const remotesKey = (repoId: string) => ['repos', repoId, 'remotes'] as const;

function useRemotes(repoId: string | null) {
  return useQuery<Remote[]>({
    queryKey: remotesKey(repoId ?? ''),
    queryFn: async () => (repoId ? ((await bridge()?.remotes.list({ repoId })) ?? []) : []),
    enabled: repoId !== null,
    staleTime: 60_000,
  });
}

function useForgeCapability(repoId: string | null) {
  const remotes = useRemotes(repoId);
  const kind = pickForgeRemote(remotes.data ?? [])?.forge?.kind ?? null;
  const capabilities = useForgeCapabilities(kind ?? 'unknown');
  return { kind, capability: capabilities.data };
}

function IssueStatusPill({ issue }: TasksIssueStatusPillProps) {
  return <StatusPill status={issueStatus(issue)} />;
}

const MODAL_WIDTH: Record<NonNullable<TasksModalProps['size']>, string> = {
  sm: 'max-w-[420px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[900px]',
  full: 'max-w-none h-full',
};

/** A centred dialog over a scrim: Escape or the close button closes it, focus starts inside it. */
function CoderModal({ open, onClose, title, size = 'md', testId, children }: TasksModalProps) {
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    surface.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={testId}
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg outline-none ${MODAL_WIDTH[size]}`}
      >
        {title ? (
          <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <LuX aria-hidden className="h-4 w-4" />
            </button>
          </header>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children as ReactNode}</div>
      </div>
    </div>
  );
}

/** Escape, or a press outside the surface (and outside its trigger), dismisses it. */
function useDismissable({ open, onDismiss, surfaceRef, trigger }: TasksDismissableOptions): void {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss.current();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (surfaceRef.current?.contains(target) || trigger?.current?.contains(target)) return;
      dismiss.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, surfaceRef, trigger]);
}

function useToasts(): TasksToastApi {
  const addToast = useToastStore((s) => s.addToast);
  const removeToast = useToastStore((s) => s.removeToast);
  return {
    show: ({ message, danger, action }) => {
      addToast({ message, status: danger ? 'error' : 'info', ...(action ? { action } : {}) });
      return useToastStore.getState().toasts.at(-1)?.id ?? '';
    },
    dismiss: removeToast,
  };
}

/** Coder draws no session glow: it starts none, so no card ever has a badge to stack. */
function NoBadges() {
  return null;
}

const NO_CASCADE = { active: false, styleFor: () => ({}) };

export const CODER_TASKS_HOST: TasksHost = {
  useUi: useCoderTasksUi,
  getUi: () => coderTasksStore.getState(),
  data: {
    useRemotes,
    useForgeCapability,
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
  },
  useActiveRepo,
  UserAvatar: CODER_FORGE_HOST.UserAvatar,
  ExternalLink: CODER_FORGE_HOST.ExternalLink,
  ForgeRefLink: CODER_FORGE_HOST.ForgeRefLink,
  MultiSelectMenu: CODER_FORGE_HOST.MultiSelectMenu,
  Modal: CoderModal,
  IssueStatusPill,
  ActivityBadgeStack: NoBadges,
  useDismissable,
  useCascadeReveal: () => NO_CASCADE,
  useToasts,
  // Coder's bridge carries no clipboard channel; the renderer's own clipboard writes plain text.
  copyText: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },
};
