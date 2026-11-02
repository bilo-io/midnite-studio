import type { AnimationClip, AnimationImportResult, AnimationPatch, AnimationProgressEvent, GitOpResult } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { bridge, noBridge, reportFailure, useToastStore } from '@midnite/studio-frame';

import { collectDropped, fileToBase64, type DroppedFile } from './dropped-files';

/**
 * Media ▸ Animations data hooks (Phase 125). Everything runs in main — the pickers, the parsing, the library —
 * so these only ask for state, start writes and listen for the library's two events.
 */
export const ANIMATION_KEYS = { all: ['media-animation'] as const, clips: ['media-animation', 'clips'] as const };

export function useAnimationClips() {
  return useQuery<AnimationClip[]>({
    queryKey: ANIMATION_KEYS.clips,
    queryFn: async () => {
      const result = await bridge()?.media.animation.list();
      if (!result) return [];
      if (!result.ok) throw new Error('message' in result ? result.message : 'The animation library could not be read');
      return result.value.clips;
    },
  });
}

/** Refetches the list when main says it changed, and tracks a running import. Mounted once, by the tab. */
export function useAnimationEvents(): AnimationProgressEvent | null {
  const client = useQueryClient();
  const [progress, setProgress] = useState<AnimationProgressEvent | null>(null);
  useEffect(() => {
    const animation = bridge()?.media.animation;
    if (!animation) return;
    const offChanged = animation.onChanged(() => void client.invalidateQueries({ queryKey: ANIMATION_KEYS.all }));
    const offProgress = animation.onProgress((event) => setProgress(event.finished ? null : event));
    return () => {
      offChanged();
      offProgress();
    };
  }, [client]);
  return progress;
}

export function useAnimationMutations() {
  const client = useQueryClient();
  const [summary, setSummary] = useState<AnimationImportResult | null>(null);
  const refresh = () => void client.invalidateQueries({ queryKey: ANIMATION_KEYS.all });

  const settle = (result: GitOpResult<AnimationImportResult>) => {
    reportFailure(result);
    if (result.ok && !result.value.cancelled) setSummary(result.value);
    refresh();
  };

  const importFiles = useMutation({
    mutationFn: async () => (await bridge()?.media.animation.importFiles()) ?? noBridge<AnimationImportResult>(),
    onSuccess: settle,
  });
  const importFolder = useMutation({
    mutationFn: async () => (await bridge()?.media.animation.importFolder()) ?? noBridge<AnimationImportResult>(),
    onSuccess: settle,
  });
  /** Dropped files go one at a time, so one oversized file fails alone; their results are merged into one summary. */
  const importDropped = useMutation({
    mutationFn: async (dropped: DroppedFile[]): Promise<GitOpResult<AnimationImportResult>> => {
      const animation = bridge()?.media.animation;
      if (!animation) return noBridge<AnimationImportResult>();
      const total: AnimationImportResult = { added: [], duplicates: [], failed: [], warnings: [], cancelled: false };
      for (const { file, folder } of dropped) {
        const result = await animation.importBytes({ name: file.name, dataBase64: await fileToBase64(file), ...(folder ? { folder } : {}) });
        if (!result.ok) {
          total.failed.push({ name: file.name, reason: 'message' in result ? result.message : 'The file could not be imported' });
          continue;
        }
        total.added.push(...result.value.added);
        total.duplicates.push(...result.value.duplicates);
        total.failed.push(...result.value.failed);
        total.warnings.push(...result.value.warnings);
      }
      return { ok: true, value: total };
    },
    onSuccess: settle,
  });
  const update = useMutation({
    mutationFn: async (req: { id: string; patch: AnimationPatch }) => (await bridge()?.media.animation.update(req)) ?? noBridge<{ clip: AnimationClip }>(),
    onSuccess: (result) => {
      reportFailure(result);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await bridge()?.media.animation.remove({ id })) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      if (result.ok) useToastStore.getState().addToast({ message: 'Clip removed from the library.', status: 'success' });
      refresh();
    },
  });

  /** Resolves a drop to clip files and imports them; a drop with none says so. */
  const drop = async (transfer: Pick<DataTransfer, 'items' | 'files'>) => {
    const dropped = await collectDropped(transfer);
    if (dropped.length === 0) {
      setSummary({ added: [], duplicates: [], failed: [{ name: 'Drop', reason: 'No .fbx, .glb, .gltf or .bvh files in what was dropped' }], warnings: [], cancelled: false });
      return;
    }
    importDropped.mutate(dropped);
  };

  const importing = importFiles.isPending || importFolder.isPending || importDropped.isPending;
  return { importFiles, importFolder, importDropped, update, remove, drop, importing, summary, clearSummary: () => setSummary(null) };
}
