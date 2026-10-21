import { useMemo } from 'react';

import type { KnowledgeHost, KnowledgeSettings, KnowledgeSourcePreviewProps } from '@midnite/studio-frame';

import { Popover } from '../components/popover';
import { FilePreview } from '../features/files/preview/file-preview';
import { useWindowFocused } from '../lib/use-window-focus';
import { useActiveWorktree } from '../services/use-status';
import { resolveSystemMotion, useAppearanceStore } from '../store/appearance-store';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';

/**
 * Studio's implementation of the frame's Knowledge host port (Phase 113 Theme M): the active worktree as
 * the corpus, `ui-store` for the persisted renderer / layout / detail ids and the two panel widths,
 * `appearance-store` for motion, and Studio's own `Popover` and `FilePreview` for the two pieces of
 * chrome the frame view cannot import.
 */

function readSettings(): KnowledgeSettings {
  const ui = useUiStore.getState();
  return {
    rendererVariant: ui.rendererVariant,
    layoutId: ui.layoutId,
    detailId: ui.knowledgeDetailId,
    filtersWidth: ui.layout.knowledgeFiltersWidth,
    detailWidth: ui.layout.knowledgeDetailWidth,
  };
}

function useSettings(): KnowledgeSettings {
  const rendererVariant = useUiStore((s) => s.rendererVariant);
  const layoutId = useUiStore((s) => s.layoutId);
  const detailId = useUiStore((s) => s.knowledgeDetailId);
  const filtersWidth = useUiStore((s) => s.layout.knowledgeFiltersWidth);
  const detailWidth = useUiStore((s) => s.layout.knowledgeDetailWidth);
  return useMemo(
    () => ({ rendererVariant, layoutId, detailId, filtersWidth, detailWidth }),
    [rendererVariant, layoutId, detailId, filtersWidth, detailWidth],
  );
}

function setSettings(patch: Partial<KnowledgeSettings>): void {
  const ui = useUiStore.getState();
  if (patch.rendererVariant !== undefined) ui.setRendererVariant(patch.rendererVariant);
  if (patch.layoutId !== undefined) ui.setLayoutId(patch.layoutId);
  if (patch.detailId !== undefined) ui.setKnowledgeDetailId(patch.detailId);
  if (patch.filtersWidth !== undefined) ui.setLayout('knowledgeFiltersWidth', patch.filtersWidth);
  if (patch.detailWidth !== undefined) ui.setLayout('knowledgeDetailWidth', patch.detailWidth);
}

/** Mirrors `useResolvedMotion()` without the hook machinery - the canvas reads it imperatively. */
function prefersReducedMotion(): boolean {
  const motion = useAppearanceStore.getState().motion;
  return motion === 'system' ? resolveSystemMotion() === 'reduced' : motion === 'reduced';
}

function SourcePreview({ repoId, worktreePath, sourceFile, targetLine }: KnowledgeSourcePreviewProps) {
  return (
    <FilePreview
      scope={{ scope: 'repo', repoId, ...(worktreePath ? { worktreePath } : {}) }}
      relPath={sourceFile}
      targetLine={targetLine ?? undefined}
    />
  );
}

export const STUDIO_KNOWLEDGE_HOST: KnowledgeHost = {
  useFocus: useWindowFocused,
  useCorpus: useActiveWorktree,
  useSettings,
  getSettings: readSettings,
  setSettings,
  prefersReducedMotion,
  panelBounds: {
    filtersWidth: { ...LAYOUT_BOUNDS.knowledgeFiltersWidth, initial: DEFAULT_LAYOUT.knowledgeFiltersWidth },
    detailWidth: { ...LAYOUT_BOUNDS.knowledgeDetailWidth, initial: DEFAULT_LAYOUT.knowledgeDetailWidth },
  },
  Popover,
  SourcePreview,
};
