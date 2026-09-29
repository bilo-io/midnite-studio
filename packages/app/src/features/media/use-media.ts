import type {
  FfmpegStatus,
  GitOpResult,
  MediaExportFormat,
  MediaExportOptions,
  MediaExportProgressEvent,
  MediaExportSource,
  MediaFileEntry,
  MediaProject,
  MediaTab,
} from '@midnite/studio-shared';
import { MEDIA_EXPORT_FORMAT_INFO } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { bridge } from '../../services/bridge';
import { noBridge, reportFailure } from '../../services/bridge-result';
import { useUiStore } from '../../store/ui-store';

/**
 * Media page data hooks (Phase 99 Theme A) — the renderer half of the
 * repo-scoped media store. Themes B–E build their tabs on these rather than
 * calling `bridge().media` directly, so every tab shares one cache and one
 * `mediaChanged` invalidation.
 *
 * Keys start with `['media', repoId, tab]`, so a watcher ping for one tab
 * invalidates that tab's projects and files and nothing else.
 */
export const MEDIA_KEYS = {
  tab: (repoId: string, tab: MediaTab) => ['media', repoId, tab] as const,
  projects: (repoId: string, tab: MediaTab) => ['media', repoId, tab, 'projects'] as const,
  files: (repoId: string, tab: MediaTab, project: string) =>
    ['media', repoId, tab, 'files', project] as const,
  file: (repoId: string, tab: MediaTab, project: string, path: string) =>
    ['media', repoId, tab, 'file', project, path] as const,
  ffmpeg: ['media-ffmpeg'] as const,
};

const unwrap = <T>(result: GitOpResult<T> | undefined): T => {
  if (!result) throw new Error('Media is unavailable without the desktop bridge.');
  if (!result.ok) throw new Error(result.kind === 'error' ? result.message : 'Conflict');
  return (result as { ok: true; value: T }).value;
};

/** Subscribe once (per mounted Media view) to `mediaChanged` → invalidate that tab. */
export function useMediaChangedInvalidation(): void {
  const client = useQueryClient();
  useEffect(() => {
    const off = bridge()?.media.onChanged(({ repoId, tab }) => {
      void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, tab) });
    });
    return () => off?.();
  }, [client]);
}

export function useMediaProjects(repoId: string | null, tab: MediaTab) {
  return useQuery<MediaProject[]>({
    queryKey: MEDIA_KEYS.projects(repoId ?? '', tab),
    queryFn: async () => unwrap(await bridge()?.media.project.list({ repoId: repoId ?? '', tab })),
    enabled: repoId !== null,
  });
}

export function useMediaFiles(repoId: string | null, tab: MediaTab, project: string | null) {
  return useQuery<MediaFileEntry[]>({
    queryKey: MEDIA_KEYS.files(repoId ?? '', tab, project ?? ''),
    queryFn: async () =>
      unwrap(await bridge()?.media.file.list({ repoId: repoId ?? '', tab, project: project ?? '' })),
    enabled: repoId !== null && project !== null,
  });
}

export function useMediaFileText(repoId: string | null, tab: MediaTab, project: string | null, path: string | null) {
  return useQuery<string>({
    queryKey: MEDIA_KEYS.file(repoId ?? '', tab, project ?? '', path ?? ''),
    queryFn: async () =>
      unwrap(
        await bridge()?.media.file.read({
          repoId: repoId ?? '',
          tab,
          project: project ?? '',
          path: path ?? '',
        }),
      ),
    enabled: repoId !== null && project !== null && path !== null,
  });
}

/** create / rename / remove projects, and write / rename / remove files, for one tab. */
export function useMediaMutations(repoId: string | null, tab: MediaTab) {
  const client = useQueryClient();
  const invalidate = () => {
    if (repoId) void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, tab) });
  };
  const run = <R extends GitOpResult<unknown> | GitOpResult>(call: () => Promise<R> | undefined) =>
    (async () => {
      const result = (await call()) ?? noBridge();
      reportFailure(result as GitOpResult<unknown>);
      if (result.ok) invalidate();
      return result;
    })();
  const scope = { repoId: repoId ?? '', tab };

  return {
    createProject: useMutation({
      mutationFn: (project: string) => run(() => bridge()?.media.project.create({ ...scope, project })),
    }),
    renameProject: useMutation({
      mutationFn: ({ project, to }: { project: string; to: string }) =>
        run(() => bridge()?.media.project.rename({ ...scope, project, to })),
    }),
    removeProject: useMutation({
      mutationFn: (project: string) => run(() => bridge()?.media.project.remove({ ...scope, project })),
    }),
    writeFile: useMutation({
      mutationFn: (input: { project: string; path: string; content: string; encoding?: 'utf8' | 'base64' }) =>
        run(() => bridge()?.media.file.write({ ...scope, ...input })),
    }),
    renameFile: useMutation({
      mutationFn: (input: { project: string; path: string; to: string }) =>
        run(() => bridge()?.media.file.rename({ ...scope, ...input })),
    }),
    removeFile: useMutation({
      mutationFn: (input: { project: string; path: string }) =>
        run(() => bridge()?.media.file.remove({ ...scope, ...input })),
    }),
  };
}

export function revealMedia(repoId: string, tab: MediaTab, project: string, path?: string): void {
  void bridge()?.media.reveal({ repoId, tab, project, ...(path ? { path } : {}) });
}

/** ffmpeg presence, cached for the session; `refetch()` after an Install. */
export function useFfmpegStatus() {
  return useQuery<FfmpegStatus>({
    queryKey: MEDIA_KEYS.ffmpeg,
    queryFn: async () =>
      (await bridge()?.media.ffmpegStatus())?.ffmpeg ?? {
        found: false,
        reason: 'ffmpeg status is unavailable without the desktop bridge.',
      },
  });
}

/**
 * Why a format cannot export right now, or `undefined` when it can. The one
 * rule every tab's toolbar shares: nothing selected, or ffmpeg needed and
 * missing.
 */
export function exportDisabledReason(
  format: MediaExportFormat,
  hasSelection: boolean,
  ffmpeg: FfmpegStatus | undefined,
): string | undefined {
  if (!hasSelection) return 'Select something to export.';
  if (MEDIA_EXPORT_FORMAT_INFO[format].needsFfmpeg && ffmpeg?.found !== true) {
    return ffmpeg && !ffmpeg.found ? ffmpeg.reason : 'Checking for ffmpeg…';
  }
  return undefined;
}

/**
 * Run one ffmpeg export: opens the native save dialog in main (seeded from
 * Settings ▸ Media's export folder) and tracks progress. Formats that do not
 * need ffmpeg (Docs' md/html/pdf) are Theme B's own path, not this one.
 */
export function useMediaExport() {
  const [progress, setProgress] = useState<MediaExportProgressEvent | null>(null);
  const exportDir = useUiStore((s) => s.mediaExportDir);

  useEffect(() => {
    const off = bridge()?.media.onExportProgress((event) => {
      setProgress((current) => (current && current.exportId === event.exportId ? event : current));
    });
    return () => off?.();
  }, []);

  const start = useMutation({
    mutationFn: async (input: { source: MediaExportSource; format: MediaExportFormat; options?: MediaExportOptions }) => {
      const exportId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setProgress({ exportId, status: 'running' });
      const result =
        (await bridge()?.media.export({
          exportId,
          ...input,
          ...(exportDir ? { defaultDir: exportDir } : {}),
        })) ?? noBridge<{ dest: string }>();
      const dismissed = result.ok === false && result.kind === 'error' && result.message === 'cancelled';
      if (!dismissed) reportFailure(result);
      // A dismissed save dialog never reaches ffmpeg, so no terminal event arrives.
      setProgress((current) =>
        current?.exportId === exportId && current.status === 'running'
          ? { exportId, status: result.ok ? 'succeeded' : dismissed ? 'cancelled' : 'failed' }
          : current,
      );
      return result;
    },
  });

  const cancel = () => {
    if (progress?.status === 'running') void bridge()?.media.cancelExport({ exportId: progress.exportId });
  };

  return { start, progress, cancel };
}
