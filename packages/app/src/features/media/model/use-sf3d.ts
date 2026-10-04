import type { GitOpResult, ModelImageAttachment, Sf3dGenerateResult, Sf3dGenerateStage, Sf3dInstallProgress, Sf3dStatus } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { MEDIA_KEYS } from '../use-media';

/**
 * Media ▸ Models ▸ SF3D data hooks (Phase 103 Theme J): the install status, the live install
 * progress and a running generation's stage, all from `media.model.sf3d` and its one event stream.
 * Nothing here downloads on mount — the status read is a stat of `<userData>/sf3d`, and the install
 * starts only from the consent dialog's own button.
 */
export const SF3D_KEYS = { status: ['media-model-sf3d-status'] as const };

export type Sf3dRunning = { generationId: string; project: string; stage: Sf3dGenerateStage; fraction?: number };

const cancelled = (result: GitOpResult<unknown> | GitOpResult) => !result.ok && result.kind === 'error' && result.message === 'cancelled';

export function useSf3d(repoId: string | null) {
  const client = useQueryClient();
  const [progress, setProgress] = useState<Sf3dInstallProgress | null>(null);
  const [running, setRunning] = useState<Sf3dRunning | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const status = useQuery<Sf3dStatus | undefined>({
    queryKey: SF3D_KEYS.status,
    queryFn: async () => {
      const result = await bridge()?.media.model.sf3d.status();
      return result?.ok ? result.value : undefined;
    },
    staleTime: 10_000,
  });

  useEffect(() => {
    const off = bridge()?.media.model.sf3d.onProgress((event) => {
      if (event.kind === 'install') {
        setProgress(event.progress);
        if (event.progress.phase === 'ready' || event.progress.phase === 'failed' || event.progress.phase === 'cancelled') {
          void client.invalidateQueries({ queryKey: SF3D_KEYS.status });
        }
        return;
      }
      if (event.repoId !== repoId) return;
      if (event.status === 'running') {
        setRunning((current) => ({
          generationId: event.generationId,
          project: event.project,
          stage: event.stage ?? current?.stage ?? 'preparing',
          ...(event.fraction !== undefined ? { fraction: event.fraction } : {}),
        }));
      } else {
        setRunning(null);
        if (event.status === 'succeeded') void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(event.repoId, 'model') });
      }
    });
    return () => off?.();
  }, [client, repoId]);

  const refresh = () => void client.invalidateQueries({ queryKey: SF3D_KEYS.status });
  const settle = (result: GitOpResult<unknown> | GitOpResult) => {
    if (!result.ok && !cancelled(result)) {
      setLastError(result.kind === 'error' ? result.message : 'SF3D failed.');
      reportFailure(result);
    }
    refresh();
    return result;
  };

  const consentAndInstall = useMutation({
    mutationFn: async (input: { licenceSha256: string }) => {
      setLastError(null);
      const sf3d = bridge()?.media.model.sf3d;
      if (!sf3d) return noBridge<Sf3dStatus>();
      const consented = await sf3d.consent({ licenceSha256: input.licenceSha256, revenueAcknowledged: true });
      if (!consented.ok) return settle(consented);
      refresh();
      setProgress({ phase: 'manifest', receivedBytes: consented.value.bytesOnDisk, totalBytes: consented.value.totalBytes, fraction: 0 });
      return settle(await sf3d.install());
    },
  });

  /** Resume an install the user already consented to (partials are kept on cancel). */
  const install = useMutation({
    mutationFn: async () => {
      setLastError(null);
      return settle((await bridge()?.media.model.sf3d.install()) ?? noBridge<Sf3dStatus>());
    },
  });

  const cancelInstall = () => void bridge()?.media.model.sf3d.cancelInstall();

  const uninstall = useMutation({
    mutationFn: async () => {
      setProgress(null);
      return settle((await bridge()?.media.model.sf3d.uninstall()) ?? noBridge<Sf3dStatus>());
    },
  });

  const generate = useMutation({
    mutationFn: async (input: { project: string; image: ModelImageAttachment; textureSize?: 512 | 1024 | 2048 }) => {
      if (!repoId) return noBridge<Sf3dGenerateResult>();
      const generationId = `sf3d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setLastError(null);
      setRunning({ generationId, project: input.project, stage: 'preparing' });
      const result = (await bridge()?.media.model.sf3d.generate({ ...input, generationId, repoId })) ?? noBridge<Sf3dGenerateResult>();
      setRunning(null);
      if (!result.ok && !cancelled(result)) {
        setLastError(result.kind === 'error' ? result.message : 'SF3D failed.');
        reportFailure(result);
      }
      void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, 'model') });
      return result;
    },
  });

  const cancelGenerate = () => {
    if (running) void bridge()?.media.model.sf3d.cancelGenerate({ generationId: running.generationId });
  };

  const installing = consentAndInstall.isPending || install.isPending || status.data?.state === 'installing';
  return { status, progress, installing, running, lastError, consentAndInstall, install, cancelInstall, uninstall, generate, cancelGenerate };
}

/** `1_730_000_000` → `1.73 GB`. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}
