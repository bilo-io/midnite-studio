import type {
  VideoProject,
  VideoRender,
  VideoStudioStatus,
  VideoToolchain,
} from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { bridge } from '../../services/bridge';
import { noBridge, reportFailure } from '../../services/bridge-result';

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
  files: (projectId: string, area: 'assets' | 'input' | 'output') =>
    ['video-files', projectId, area] as const,
};

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
    mutationFn: async (input: { projectId: string; compositionId: string }) =>
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
      },
    enabled: projectId !== null,
  });
}

export function useVideoFiles(projectId: string | null, area: 'assets' | 'input' | 'output') {
  return useQuery({
    queryKey: VIDEO_KEYS.files(projectId ?? '', area),
    queryFn: async () =>
      (await bridge()?.video.files({ projectId: projectId ?? '', area }))?.entries ?? [],
    enabled: projectId !== null,
    initialData: [],
  });
}
