import type {
  VideoProject,
  VideoRender,
  VideoRenderOptions,
  VideoRootResolution,
  VideoStudioStatus,
  VideoToolchain,
} from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { useUiStore } from '../../../store/ui-store';

const currentRepoId = (): string | null => useUiStore.getState().selectedRepoId ?? null;

/**
 * Video Studio (Phase 44) — global, not per-repo, so these keys carry no
 * `repoId`, exactly like `use-workflow.ts`/`use-council.ts`: nothing about a
 * global entity invalidates on a watcher event, a ref change, or any of the
 * other reasons `services/queries.ts`'s keys are shaped the way they are.
 */
const VIDEO_KEYS = {
  projects: ['video-projects'] as const,
  project: (id: string) => ['video-projects', id] as const,
  studio: (projectId: string) => ['video-studio', projectId] as const,
  renders: (projectId: string) => ['video-renders', projectId] as const,
  toolchain: ['video-toolchain'] as const,
  files: (projectId: string, area: VideoFileArea, recursive = false) =>
    ['video-files', projectId, area, recursive] as const,
  resolution: (repoId: string | null) => ['video-root-resolution', repoId ?? ''] as const,
};

export type VideoFileArea = 'assets' | 'input' | 'output' | 'notes';

/** Every key whose answer depends on which root is in effect. */
const ROOT_DEPENDENT_KEYS = [
  ['video-projects'],
  ['video-files'],
  ['video-file-content'],
  ['video-toolchain'],
  ['video-root'],
] as const;

/**
 * Phase 99 Theme D — resolve the Video tab's root for the active repo (in-repo
 * layout → `<repo>/.midnite/media/video` → the global root). Main adopts the
 * answer for every other video op, so a change of root invalidates them all.
 */
export function useVideoRootResolution(repoId: string | null) {
  const client = useQueryClient();
  const query = useQuery<VideoRootResolution>({
    queryKey: VIDEO_KEYS.resolution(repoId),
    queryFn: async () =>
      (await bridge()?.video.root.resolve({ repoId })) ?? { root: null, source: null, setupTarget: null },
  });
  const root = query.data?.root ?? null;
  const [seenRoot, setSeenRoot] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!query.isSuccess || seenRoot === root) return;
    if (seenRoot !== undefined) {
      for (const queryKey of ROOT_DEPENDENT_KEYS) void client.invalidateQueries({ queryKey });
    }
    setSeenRoot(root);
  }, [client, query.isSuccess, root, seenRoot]);
  return query;
}

/** Setup Video: scaffold `templates/media-video/` into the repo, then adopt it. */
export function useVideoSetup(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await bridge()?.video.setup({ repoId: repoId ?? '' })) ?? noBridge<VideoRootResolution>(),
    onSuccess: (result) => {
      reportFailure<VideoRootResolution>(result);
      if (result.ok) client.setQueryData(VIDEO_KEYS.resolution(repoId), result.value);
    },
  });
}

/**
 * The root every video op runs against, for building an absolute project
 * `cwd` (Theme F/G). Since Phase 99 Theme D that is the *resolved* root, not
 * just the global setting — read from the resolution the Video tab keeps.
 */
export function useVideoRoot() {
  return useQuery({
    queryKey: ['video-root'] as const,
    queryFn: async () => {
      const api = bridge();
      if (!api) return null;
      const resolved = await api.video.root.resolve({ repoId: currentRepoId() });
      return resolved.root;
    },
  });
}

export function useVideoProjects() {
  return useQuery({
    queryKey: VIDEO_KEYS.projects,
    queryFn: async () => (await bridge()?.video.project.list())?.projects ?? [],
  });
}

export function useVideoProject(id: string | null) {
  return useQuery<VideoProject | null>({
    queryKey: VIDEO_KEYS.project(id ?? ''),
    queryFn: async () => (await bridge()?.video.project.get({ id: id ?? '' }))?.project ?? null,
    enabled: id !== null,
  });
}

export function useCreateVideoProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; title: string }) =>
      (await bridge()?.video.project.create(input)) ?? noBridge(),
    onSuccess: (result) => {
      reportFailure(result);
      if (result.ok) void client.invalidateQueries({ queryKey: VIDEO_KEYS.projects });
    },
  });
}

export function useRemoveVideoProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await bridge()?.video.project.remove({ id })) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      if (result.ok) void client.invalidateQueries({ queryKey: VIDEO_KEYS.projects });
    },
  });
}

/** Every host subscribes independently — cheap, and avoids an app-root wiring dependency. */
function useVideoStudioEvents(): void {
  const client = useQueryClient();
  useEffect(() => {
    const api = bridge();
    if (!api) return undefined;
    return api.video.onStudioChanged(({ projectId, status }) => {
      client.setQueryData(VIDEO_KEYS.studio(projectId), status);
    });
  }, [client]);
}

export function useVideoStudioStatus(projectId: string | null) {
  useVideoStudioEvents();
  return useQuery<VideoStudioStatus>({
    queryKey: VIDEO_KEYS.studio(projectId ?? ''),
    queryFn: async () =>
      (await bridge()?.video.studio.status({ projectId: projectId ?? '' }))?.status ?? { state: 'stopped' },
    enabled: projectId !== null,
    initialData: { state: 'stopped' },
  });
}

export function useStartVideoStudio() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) =>
      (await bridge()?.video.studio.start({ projectId })) ?? noBridge(),
    onSuccess: (result, projectId) => {
      reportFailure(result);
      if (result.ok) client.setQueryData(VIDEO_KEYS.studio(projectId), result.value);
    },
  });
}

export function useStopVideoStudio() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) =>
      (await bridge()?.video.studio.stop({ projectId })) ?? noBridge<void>(),
    onSuccess: (result, projectId) => {
      reportFailure<void>(result);
      if (result.ok) client.setQueryData(VIDEO_KEYS.studio(projectId), { state: 'stopped' });
    },
  });
}

/** Every host subscribes independently, same shape as the studio events above. */
function useVideoRenderEvents(): void {
  const client = useQueryClient();
  useEffect(() => {
    const api = bridge();
    if (!api) return undefined;
    return api.video.onRenderProgress((event) => {
      client.setQueryData<VideoRender[] | undefined>(VIDEO_KEYS.renders(event.projectId), (renders) =>
        renders?.map((render) => (render.id === event.renderId ? { ...render, status: event.status } : render)),
      );
    });
  }, [client]);
}

export function useVideoRenders(projectId: string | null) {
  useVideoRenderEvents();
  return useQuery<VideoRender[]>({
    queryKey: VIDEO_KEYS.renders(projectId ?? ''),
    queryFn: async () => (await bridge()?.video.render.list({ projectId: projectId ?? '' }))?.renders ?? [],
    enabled: projectId !== null,
    initialData: [],
  });
}

/**
 * A render's live fraction, direct from the event stream rather than the
 * cache — `VideoRender` itself carries no `progress` field (Theme E's own
 * schema decision), so this is the one place that number is ever readable,
 * scoped to whichever render a consumer actually names.
 */
export function useVideoRenderProgress(renderId: string | null): number | undefined {
  const [progress, setProgress] = useState<number | undefined>(undefined);
  useEffect(() => {
    setProgress(undefined);
    if (renderId === null) return undefined;
    const api = bridge();
    if (!api) return undefined;
    return api.video.onRenderProgress((event) => {
      if (event.renderId === renderId && event.progress !== undefined) setProgress(event.progress);
    });
  }, [renderId]);
  return progress;
}

export function useStartVideoRender() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; compositionId: string; options?: VideoRenderOptions }) =>
      (await bridge()?.video.render.start(input)) ?? noBridge<VideoRender>(),
    onSuccess: (result, variables) => {
      reportFailure<VideoRender>(result);
      if (result.ok) void client.invalidateQueries({ queryKey: VIDEO_KEYS.renders(variables.projectId) });
    },
  });
}

export function useCancelVideoRender() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { renderId: string; projectId: string }) =>
      (await bridge()?.video.render.cancel({ renderId: input.renderId })) ?? noBridge<void>(),
    onSuccess: (result, variables) => {
      reportFailure<void>(result);
      if (result.ok) void client.invalidateQueries({ queryKey: VIDEO_KEYS.renders(variables.projectId) });
    },
  });
}

export function useVideoToolchain(projectId: string | null) {
  return useQuery<VideoToolchain>({
    queryKey: VIDEO_KEYS.toolchain,
    queryFn: async () =>
      (await bridge()?.video.toolchain({ projectId: projectId ?? '' }))?.toolchain ?? {
        node: { found: false, reason: 'Unavailable.' },
        npx: { found: false, reason: 'Unavailable.' },
        skills: {
          videoWriteScript: { found: false, reason: 'Unavailable.' },
          videoExecuteScript: { found: false, reason: 'Unavailable.' },
        },
      },
    enabled: projectId !== null,
  });
}

const NO_FILES: never[] = [];

/**
 * No `initialData`: the app's global `staleTime: Infinity` treats seeded
 * initial data as fresh forever, so the listing would never be fetched in the
 * real app (Phase 99 Theme D found this — jsdom's test client masked it).
 */
export function useVideoFiles(projectId: string | null, area: VideoFileArea, { recursive = false } = {}) {
  const query = useQuery({
    queryKey: VIDEO_KEYS.files(projectId ?? '', area, recursive),
    queryFn: async () =>
      (await bridge()?.video.files({ projectId: projectId ?? '', area, ...(recursive ? { recursive } : {}) }))
        ?.entries ?? [],
    enabled: projectId !== null,
  });
  return { ...query, data: query.data ?? NO_FILES };
}

/**
 * Reveal-in-Finder / play-in-default-app on a listed file (Theme E) — plain
 * fire-and-forget hand-offs, the same shape `use-file-actions.ts`'s own
 * `reveal()` already uses for the identical OS-shell action elsewhere in the
 * app. Not a mutation: nothing here changes any query's data.
 */
export function revealVideoFile(projectId: string, area: VideoFileArea, name: string): void {
  void bridge()?.video.revealFile({ projectId, area, name });
}

export function openVideoFile(projectId: string, area: VideoFileArea, name: string): void {
  void bridge()?.video.openFile({ projectId, area, name });
}

/** `BRIEF.md`/`EDITORIAL_SCRIPT.md` content, read-only (Theme F). */
export function useVideoProjectFile(projectId: string | null, relPath: string | null) {
  return useQuery<string | null>({
    queryKey: ['video-file-content', projectId ?? '', relPath ?? ''],
    queryFn: async () =>
      (await bridge()?.video.readFile({ projectId: projectId ?? '', relPath: relPath ?? '' }))?.content ?? null,
    enabled: projectId !== null && relPath !== null,
  });
}
