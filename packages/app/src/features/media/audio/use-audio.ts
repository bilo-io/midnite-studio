import {
  AUDIO_PROJECT_FILE,
  audioSidecarPath,
  DEFAULT_AUDIO_PROVIDER,
  isAudioPath,
  MEDIA_ROOT_DIR,
  mstudioFileUrl,
  parseAudioProjectFile,
  parseAudioSidecar,
  type AudioImportRequest,
  type AudioProgressEvent,
  type AudioProviderId,
  type AudioProviderStatus,
  type AudioSession,
  type AudioSidecar,
} from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { MEDIA_KEYS, useMediaFiles } from '../use-media';
import { computeWaveform, type Waveform } from './waveform';

/**
 * Media ▸ Audio data hooks (Phase 99 Theme E). Import runs in main (native
 * dialog + the `import` adapter); this file reads the project's session
 * history and sidecars, and computes waveform peaks once per variant, caching
 * them back into the sidecar.
 */

/**
 * Settings ▸ Media ▸ Audio defaults. Its own small persisted store — like
 * Images' — so the parallel B–E themes never race on ui-store migrations.
 */
type AudioPrefs = {
  provider: AudioProviderId;
  durationS: number;
  count: number;
  mp3BitrateKbps: number;
  set: (patch: Partial<Omit<AudioPrefs, 'set'>>) => void;
};

export const useAudioPrefs = create<AudioPrefs>()(
  persist(
    (set) => ({
      provider: DEFAULT_AUDIO_PROVIDER,
      durationS: 120,
      count: 2,
      mp3BitrateKbps: 192,
      set: (patch) => set(patch),
    }),
    { name: 'mstudio.media.audio-prefs', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

export function useAudioProviders() {
  return useQuery<AudioProviderStatus[]>({
    queryKey: ['media-audio-providers'],
    queryFn: async () => (await bridge()?.media.audio.providers())?.providers ?? [],
    staleTime: Infinity,
  });
}

/** One variant as the session list and player see it. */
export type AudioVariant = {
  key: string;
  project: string;
  path: string;
  url: string;
  sidecar: AudioSidecar | null;
};

export type AudioSessionView = {
  id: string;
  kind: AudioSession['kind'] | 'unsorted';
  session: AudioSession | null;
  variants: AudioVariant[];
};

const mediaUrl = (repoId: string, project: string, path: string) =>
  mstudioFileUrl('repo', repoId, `${MEDIA_ROOT_DIR}/audio/${project}/${path}`);

async function readText(repoId: string, project: string, path: string): Promise<string | null> {
  const result = await bridge()?.media.file.read({ repoId, tab: 'audio', project, path });
  return result?.ok ? result.value : null;
}

/**
 * The project's sessions, newest first, each with its variants' sidecars —
 * plus an "Unsorted" group for audio files no session names (dropped in from
 * Finder, or a session whose `project.json` entry was lost).
 */
export function useAudioSessions(repoId: string, project: string | null) {
  const files = useMediaFiles(repoId, 'audio', project);
  const listing = files.data;
  const hasHistory = listing?.some((f) => f.path === AUDIO_PROJECT_FILE) ?? false;
  const sidecarPaths = useMemo(
    () => new Set((listing ?? []).filter((f) => f.path.endsWith('.json')).map((f) => f.path)),
    [listing],
  );
  const stamp = (listing ?? []).map((f) => `${f.path}:${f.mtimeMs}`).join('|');

  const query = useQuery({
    queryKey: [...MEDIA_KEYS.tab(repoId, 'audio'), 'sessions', project ?? '', stamp],
    enabled: project !== null && listing !== undefined,
    queryFn: async (): Promise<AudioSessionView[]> => {
      const proj = project!;
      const history = parseAudioProjectFile(hasHistory ? await readText(repoId, proj, AUDIO_PROJECT_FILE) : null);
      const audioFiles = (listing ?? []).filter((f) => isAudioPath(f.path)).map((f) => f.path);
      const present = new Set(audioFiles);
      const sidecars = new Map<string, AudioSidecar | null>();
      await Promise.all(
        audioFiles.map(async (path) => {
          const sidecar = audioSidecarPath(path);
          sidecars.set(path, sidecarPaths.has(sidecar) ? parseAudioSidecar((await readText(repoId, proj, sidecar)) ?? '') : null);
        }),
      );
      const variant = (path: string): AudioVariant => ({
        key: `${proj}/${path}`,
        project: proj,
        path,
        url: mediaUrl(repoId, proj, path),
        sidecar: sidecars.get(path) ?? null,
      });
      const claimed = new Set<string>();
      const views: AudioSessionView[] = [...history.sessions].reverse().map((session) => {
        const variants = session.variants.filter((p) => present.has(p));
        variants.forEach((p) => claimed.add(p));
        return { id: session.id, kind: session.kind, session, variants: variants.map(variant) };
      });
      const orphans = audioFiles.filter((p) => !claimed.has(p));
      if (orphans.length > 0) views.push({ id: 'unsorted', kind: 'unsorted', session: null, variants: orphans.map(variant) });
      return views.filter((v) => v.variants.length > 0 || v.session !== null);
    },
  });
  return { ...query, isPending: files.isPending || query.isPending };
}

/**
 * Peaks for one variant: the sidecar's cached copy, else decode once and write
 * them back into the sidecar (only when it has one — an unsorted file just
 * computes per session).
 */
export function useWaveform(repoId: string, variant: AudioVariant): Waveform | null {
  const cached = variant.sidecar?.peaks;
  const query = useQuery({
    queryKey: ['media-audio-waveform', variant.url],
    enabled: !cached,
    staleTime: Infinity,
    queryFn: async () => {
      const waveform = await computeWaveform(variant.url);
      if (waveform && variant.sidecar) {
        const next: AudioSidecar = { ...variant.sidecar, peaks: waveform.peaks, durationS: waveform.durationS };
        await bridge()?.media.file.write({
          repoId,
          tab: 'audio',
          project: variant.project,
          path: audioSidecarPath(variant.path),
          content: JSON.stringify(next, null, 2) + '\n',
          encoding: 'utf8',
        });
      }
      return waveform;
    },
  });
  if (cached) return { peaks: cached, durationS: variant.sidecar?.durationS ?? 0 };
  return query.data ?? null;
}

export type PendingImport = { importId: string; project: string; total: number; completed: number };

/** Start an Import (main opens the dialog) and track its progress for one repo. */
export function useAudioImport(repoId: string) {
  const client = useQueryClient();
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const off = bridge()?.media.audio.onProgress((event: AudioProgressEvent) => {
      if (event.repoId !== repoId) return;
      setPending((current) =>
        current && current.importId === event.importId && event.status === 'running'
          ? { ...current, total: event.total, completed: event.completed }
          : current,
      );
    });
    return () => off?.();
  }, [repoId]);

  const start = useMutation({
    mutationFn: async (input: Omit<AudioImportRequest, 'importId' | 'repoId'>) => {
      const importId = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setLastError(null);
      setPending({ importId, project: input.project, total: 0, completed: 0 });
      const result =
        (await bridge()?.media.audio.import({ ...input, importId, repoId })) ??
        noBridge<{ sessionId: string; files: string[] }>();
      setPending(null);
      const cancelled = !result.ok && result.kind === 'error' && result.message === 'cancelled';
      if (!result.ok && !cancelled) {
        setLastError(result.kind === 'error' ? result.message : 'Import failed.');
        reportFailure(result);
      }
      void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, 'audio') });
      return result;
    },
  });

  return { start, pending, lastError };
}
