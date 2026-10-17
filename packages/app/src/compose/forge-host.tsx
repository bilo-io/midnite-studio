import { pickForgeRemote } from '@midnite/studio-shared';
import { useCallback } from 'react';

import type { ForgeDiffKit, ForgeHost, ForgeLayoutKey } from '@midnite/studio-feature-forge/renderer';
import { useReviewsStore } from '@midnite/studio-feature-forge/renderer';
import { PresentButton, useSlidesStore } from '@midnite/studio-feature-slides/renderer';

import { Counts } from '../components/change-tree';
import { ForgeRefLink } from '../components/forge-ref-link';
import { MultiSelectMenu } from '../components/multi-select-menu';
import { Popover } from '../components/popover';
import { Tooltip } from '../components/tooltip';
import { TreeSection } from '../components/tree-section';
import { useDismiss } from '../components/use-dismiss';
import { UserAvatar } from '../components/user-avatar';
import { useSkillHandoff } from '../features/agent/use-skill-handoff';
import { matchPreviewDeploy } from '../features/browser/preview-deploy';
import { DiffToolbar } from '@midnite/studio-frame/diff';
import { DiffView } from '@midnite/studio-frame/diff';
import { imageDiffSources } from '@midnite/studio-frame/diff';
import { useTooNarrowForSplit } from '@midnite/studio-frame/diff';
import { ExternalLink } from '../features/markdown/external-link';
import { StatusMark } from '../features/status/status-mark';
import { useCascadeReveal } from '../lib/use-cascade-reveal';
import { openInMidnite, openLinkFromEvent } from '../services/open-in-midnite';
import { keys, useRemotes, useRepos } from '../services/queries';
import { useActiveWorktree, useTargetedGitOp } from '../services/use-status';
import { useBrowserStore } from '../store/browser-store';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';
import { useBaseBlobExists } from './forge/use-base-blob-exists';

/**
 * Studio's side of the forge feature's host port (Phase 113 Theme O).
 *
 * Every member is the component, hook or function Reviews and Actions imported
 * directly before they moved into the package, so both views look and behave
 * exactly as they did. Nothing they store moved: pane sizes stay in `ui-store`'s
 * `layout`, the project-board memory in `projectBoardByRepo`, the review-writes
 * switch in `forgeWritesEnabled`, and the selection in the feature's own stores.
 */

/** "Fetch to compare": the checkout's ordinary `fetch` op, with its journal and toasts. */
function useFetchBase(target: { repoId: string | null; worktreePath?: string }) {
  const op = useTargetedGitOp<Record<string, never>>(target, 'fetch', (api, _args, ctx) => api.ops.fetch(ctx));
  return { mutate: () => op.mutate({}), isPending: op.isPending };
}

const STUDIO_DIFF_KIT: ForgeDiffKit = {
  // The image sources are opaque to the feature: they come from `imageDiffSources`
  // below and go straight back into this same `DiffView`, so the cast is a round trip.
  DiffView: DiffView as unknown as ForgeDiffKit['DiffView'],
  DiffToolbar,
  StatusMark,
  ChangeCounts: Counts,
  useTooNarrowForSplit,
  imageDiffSources: imageDiffSources as ForgeDiffKit['imageDiffSources'],
  useBaseBlobExists,
  useFetchBase,
};

function usePaneSize(key: ForgeLayoutKey) {
  const size = useUiStore((s) => s.layout[key]);
  const setLayout = useUiStore((s) => s.setLayout);
  const setSize = useCallback((value: number) => setLayout(key, value), [setLayout, key]);
  return { size, setSize, initial: DEFAULT_LAYOUT[key], ...LAYOUT_BOUNDS[key] };
}

function useAskAgent() {
  const repos = useRepos();
  const handoff = useSkillHandoff();
  return ({ skillId, repoId, body, title }: { skillId: 'prReview' | 'prAudit' | 'prFeedback'; repoId: string; body: string; title: string }) => {
    const repo = repos.data?.find((r) => r.id === repoId);
    handoff({ skillId, repoId, ...(repo ? { repo } : {}), body, title });
  };
}

export const STUDIO_FORGE_HOST = {
  Tooltip,
  UserAvatar,
  Popover,
  MultiSelectMenu,
  TreeSection,
  ExternalLink,
  ForgeRefLink,
  diff: STUDIO_DIFF_KIT,
  useActiveRepo: useActiveWorktree,
  useForgeKind: (repoId) => {
    const remotes = useRemotes(repoId);
    return pickForgeRemote(remotes.data ?? [])?.forge?.kind ?? null;
  },
  useForgeWritesEnabled: () => useUiStore((s) => s.forgeWritesEnabled),
  usePaneSize,
  useProjectBoard: () => ({
    boardByRepo: useUiStore((s) => s.projectBoardByRepo),
    setProjectBoard: useUiStore((s) => s.setProjectBoard),
  }),
  useDismiss,
  useCascadeReveal,
  openLink: openLinkFromEvent,
  openInApp: (url, options) => openInMidnite(url, { ...options, target: 'in-app' }),
  openReview: (repoId, number) => {
    const ui = useUiStore.getState();
    ui.selectRepo(repoId);
    useReviewsStore.getState().selectPull(repoId, number);
    ui.setActiveView('reviews');
  },
  PresentButton,
  setActiveMarkdown: (source) => useSlidesStore.getState().setActiveMarkdown(source),
  useAskAgent,
  previewDeploys: {
    useHosts: () => useBrowserStore((s) => s.previewDeployHosts),
    match: matchPreviewDeploy,
  },
  suggestions: {
    fileKey: (scope, path) => [...keys.fs({ scope: 'repo', repoId: scope.repoId, worktreePath: scope.worktreePath }), 'file', path],
  },
} satisfies ForgeHost;
