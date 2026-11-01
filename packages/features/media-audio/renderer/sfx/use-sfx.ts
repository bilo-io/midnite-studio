import {
  isAudioPath,
  MEDIA_ROOT_DIR,
  mstudioFileUrl,
  parseSfxSidecar,
  type GitOpResult,
  type SfxGenerateResult,
  type SfxGenerateStage,
  type SfxInstallProgress,
  type SfxOptions,
  type SfxSidecar,
  type SfxStatus,
} from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { bridge, noBridge, reportFailure, useMediaKit } from '@midnite/studio-frame';

/**
 * Media ▸ SFX data hooks: the Stable Audio Open Small install status, the live install progress, a running
 * generation's stage, and the project's takes. Nothing here downloads on mount — the status read is a stat of
 * `<userData>/sfx`, and the install starts only from the consent dialog's own button (SF3D's rule).
 */
export const SFX_KEYS = { status: ['media-sfx-status'] as const };

export type SfxRunning = { generationId: string; project: string; stage: SfxGenerateStage; fraction?: number; variation?: number; variations?: number };

/** One `.wav` in an SFX project, with its sidecar when it has one (a file dropped in from Finder has none). */
export type SfxTakeView = { key: string; project: string; path: string; url: string; sidecar: SfxSidecar | null; mtimeMs: number };

const cancelled = (result: GitOpResult<unknown> | GitOpResult) => !result.ok && result.kind === 'error' && result.message === 'cancelled';

export function useSfx(repoId: string | null) {
  const client = useQueryClient();
  const { keys } = useMediaKit();
  const [progress, setProgress] = useState<SfxInstallProgress | null>(null);
  const [running, setRunning] = useState<SfxRunning | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  /** The generation this panel started, if any — events for any other id only mark the engine busy. */
  const ownId = useRef<string | null>(null);
  /** Runs this panel did not start that are still going — another repo or window, or an agent. */
  const [others, setOthers] = useState<ReadonlySet<string>>(() => new Set());

  const status = useQuery<SfxStatus | undefined>({
    queryKey: SFX_KEYS.status,
    queryFn: async () => {
      const result = await bridge()?.media.sfx.status();
      return result?.ok ? result.value : undefined;
    },
    staleTime: 10_000,
  });

  useEffect(() => {
    const off = bridge()?.media.sfx.onProgress((event) => {
      if (event.kind === 'install') {
        setProgress(event.progress);
        if (event.progress.phase === 'ready' || event.progress.phase === 'failed' || event.progress.phase === 'cancelled') {
          void client.invalidateQueries({ queryKey: SFX_KEYS.status });
        }
        return;
      }
      if (event.generationId === ownId.current) {
        // Only this panel's own run drives `running`; the mutation clears it when the call returns.
        if (event.status === 'running') {
          setRunning((current) => ({
            generationId: event.generationId,
            project: event.project,
            stage: event.stage ?? current?.stage ?? 'loading',
            ...(event.fraction !== undefined ? { fraction: event.fraction } : {}),
            ...(event.variation !== undefined ? { variation: event.variation } : {}),
            ...(event.variations !== undefined ? { variations: event.variations } : {}),
          }));
        }
      } else {
        // Someone else's run — another repo, window or an agent: the engine is busy until it ends.
        setOthers((current) => {
          if ((event.status === 'running') === current.has(event.generationId)) return current;
          const next = new Set(current);
          if (event.status === 'running') next.add(event.generationId);
          else next.delete(event.generationId);
          return next;
        });
      }
      // A take written elsewhere (an agent, another window) shows up as well as one made here.
      if (event.repoId === repoId && (event.status === 'succeeded' || (event.files?.length ?? 0) > 0)) {
        void client.invalidateQueries({ queryKey: keys.tab(event.repoId, 'sfx') });
      }
    });
    return () => off?.();
  }, [client, keys, repoId]);

  const refresh = () => void client.invalidateQueries({ queryKey: SFX_KEYS.status });
  const settle = (result: GitOpResult<unknown> | GitOpResult) => {
    if (!result.ok && !cancelled(result)) {
      setLastError(result.kind === 'error' ? result.message : 'Stable Audio Open Small failed.');
      reportFailure(result);
    }
    refresh();
    return result;
  };

  const consentAndInstall = useMutation({
    mutationFn: async (input: { licenceSha256: string }) => {
      setLastError(null);
      const sfx = bridge()?.media.sfx;
      if (!sfx) return noBridge<SfxStatus>();
      const consented = await sfx.consent({ licenceSha256: input.licenceSha256, revenueAcknowledged: true });
      if (!consented.ok) return settle(consented);
      refresh();
      setProgress({ phase: 'manifest', receivedBytes: consented.value.bytesOnDisk, totalBytes: consented.value.totalBytes, fraction: 0 });
      return settle(await sfx.install());
    },
  });

  /** Resume an install the user already consented to (partials are kept on cancel). */
  const install = useMutation({
    mutationFn: async () => {
      setLastError(null);
      return settle((await bridge()?.media.sfx.install()) ?? noBridge<SfxStatus>());
    },
  });

  const cancelInstall = () => void bridge()?.media.sfx.cancelInstall();

  const uninstall = useMutation({
    mutationFn: async () => {
      setProgress(null);
      return settle((await bridge()?.media.sfx.uninstall()) ?? noBridge<SfxStatus>());
    },
  });

  const generate = useMutation({
    mutationFn: async (input: { project: string; prompt: string; name?: string; options?: SfxOptions }) => {
      if (!repoId) return noBridge<SfxGenerateResult>();
      const generationId = `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setLastError(null);
      ownId.current = generationId;
      setRunning({ generationId, project: input.project, stage: 'loading' });
      const result = (await bridge()?.media.sfx.generate({ ...input, generationId, repoId })) ?? noBridge<SfxGenerateResult>();
      if (ownId.current === generationId) {
        ownId.current = null;
        setRunning(null);
      }
      if (!result.ok && !cancelled(result)) {
        setLastError(result.kind === 'error' ? result.message : 'Stable Audio Open Small failed.');
        reportFailure(result);
      }
      void client.invalidateQueries({ queryKey: keys.tab(repoId, 'sfx') });
      void client.invalidateQueries({ queryKey: keys.projects(repoId, 'sfx') });
      return result;
    },
  });

  const cancelGenerate = () => {
    if (running) void bridge()?.media.sfx.cancelGenerate({ generationId: running.generationId });
  };

  const installing = consentAndInstall.isPending || install.isPending || status.data?.state === 'installing';
  /** True while a generation this panel did not start is running — the broker would queue a new take behind it. */
  const busy = others.size > 0;
  return { status, progress, installing, running, busy, lastError, consentAndInstall, install, cancelInstall, uninstall, generate, cancelGenerate };
}

const takeUrl = (repoId: string, project: string, path: string) => mstudioFileUrl('repo', repoId, `${MEDIA_ROOT_DIR}/sfx/${project}/${path}`);

/** `<stem>.wav` → `<stem>.json`. */
export const sfxSidecarPath = (path: string) => path.replace(/\.[^./]+$/, '.json');

/** The project's takes, newest first, each with its sidecar. */
export function useSfxTakes(repoId: string, project: string | null) {
  const { keys, useMediaFiles } = useMediaKit();
  const files = useMediaFiles(repoId, 'sfx', project);
  const listing = files.data;
  const stamp = (listing ?? []).map((f) => `${f.path}:${f.mtimeMs}`).join('|');

  const query = useQuery({
    queryKey: [...keys.tab(repoId, 'sfx'), 'takes', project ?? '', stamp],
    enabled: project !== null && listing !== undefined,
    queryFn: async (): Promise<SfxTakeView[]> => {
      const proj = project!;
      const present = new Set((listing ?? []).map((f) => f.path));
      const audio = (listing ?? []).filter((f) => isAudioPath(f.path));
      const takes = await Promise.all(
        audio.map(async (file): Promise<SfxTakeView> => {
          const sidecarPath = sfxSidecarPath(file.path);
          let sidecar: SfxSidecar | null = null;
          if (present.has(sidecarPath)) {
            const read = await bridge()?.media.file.read({ repoId, tab: 'sfx', project: proj, path: sidecarPath });
            sidecar = read?.ok ? parseSfxSidecar(read.value) : null;
          }
          return { key: `${proj}/${file.path}`, project: proj, path: file.path, url: takeUrl(repoId, proj, file.path), sidecar, mtimeMs: file.mtimeMs };
        }),
      );
      return takes.sort((a, b) => (b.sidecar?.createdAt ?? '').localeCompare(a.sidecar?.createdAt ?? '') || b.mtimeMs - a.mtimeMs);
    },
  });
  return { ...query, isPending: files.isPending || query.isPending };
}
