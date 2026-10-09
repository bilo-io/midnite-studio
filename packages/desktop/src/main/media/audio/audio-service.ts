import {
  AUDIO_PROJECT_FILE,
  AUDIO_PROVIDER_IDS,
  audioSidecarPath,
  failure,
  ok,
  parseAudioProjectFile,
  type AudioGenerateRequest,
  type AudioImportRequest,
  type AudioProgressEvent,
  type AudioProviderId,
  type AudioProviderStatus,
  type AudioSession,
  type AudioSidecar,
  type GitOpResult,
} from '@midnite/studio-shared';

import { AudioProviderError, type AudioProvider, type ProducedAudio } from './types';

/**
 * Orchestrates one audio run (Phase 99 Theme E): runs an `AudioProvider`,
 * writes each variant and its `<name>.json` sidecar into
 * `.midnite/media/audio/<project>/` through the media store, appends one
 * session to the project's `project.json`, and streams progress. Never throws
 * — every outcome is a `GitOpResult`.
 */
type Scope = { repoId: string; tab: 'audio'; project: string };

export type AudioServiceDeps = {
  providers: Record<AudioProviderId, AudioProvider>;
  writeBytes: (req: Scope & { path: string; data: Buffer }) => Promise<GitOpResult<unknown>>;
  readText: (req: Scope & { path: string }) => Promise<GitOpResult<string>>;
  readFile: (absPath: string) => Promise<Buffer>;
  emit: (event: AudioProgressEvent) => void;
  now?: () => Date;
  /** Session ids; injectable so tests are deterministic. */
  mintId?: () => string;
};

/** `"My Song (demo).wav"` → `my-song-demo`, capped so file names stay readable. */
export function audioSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'audio';
}

/** `20260930-141502` — sorts lexically in time order. */
export function audioTimeStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function createAudioService(deps: AudioServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const mintId = deps.mintId ?? (() => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  /** Runs in flight, so a renderer-side cancel can reach the provider's `AbortSignal`. */
  const active = new Map<string, AbortController>();

  function providerStatuses(): AudioProviderStatus[] {
    return AUDIO_PROVIDER_IDS.map((id) => ({ id, available: true, generates: deps.providers[id].generates }));
  }

  /** Run `provider` with `sources` (Import's picks) and record the result as one session. */
  async function run(
    req: AudioImportRequest,
    provider: AudioProviderId,
    sources: readonly string[],
  ): Promise<GitOpResult<{ sessionId: string; files: string[] }>> {
    const adapter = deps.providers[provider];
    const scope: Scope = { repoId: req.repoId, tab: 'audio', project: req.project };
    const createdAt = now();
    const sessionId = mintId();
    const stamp = audioTimeStamp(createdAt);
    const files: string[] = [];
    const total = adapter.generates ? req.prompt.count : sources.length;
    let stage: { stage: string; fraction: number } | null = null;
    const progress = (status: AudioProgressEvent['status'], error?: string) =>
      deps.emit({
        importId: req.importId,
        repoId: req.repoId,
        project: req.project,
        status,
        completed: files.length,
        total,
        files: [...files],
        ...(error ? { error } : {}),
        ...(stage ? stage : {}),
      });

    const land = async (audio: ProducedAudio, index: number): Promise<void> => {
      const base = audioSlug(audio.source ?? (req.prompt.title || req.prompt.style[0] || 'audio'));
      const file = `${base}-${stamp}${total > 1 ? `-${index + 1}` : ''}.${audio.ext}`;
      const wrote = await deps.writeBytes({ ...scope, path: file, data: audio.bytes });
      if (!wrote.ok) throw new AudioProviderError(wrote.kind === 'error' ? wrote.message : 'Could not write the audio.');
      const sidecar: AudioSidecar = {
        version: 1,
        file,
        sessionId,
        provider,
        title: req.prompt.title || audio.source?.replace(/\.[^.]+$/, '') || req.prompt.style.slice(0, 3).join(', ') || file,
        ...(audio.source ? { source: audio.source } : {}),
        createdAt: createdAt.toISOString(),
      };
      await deps.writeBytes({
        ...scope,
        path: audioSidecarPath(file),
        data: Buffer.from(JSON.stringify(sidecar, null, 2) + '\n', 'utf8'),
      });
      files.push(file);
      progress('running');
    };

    progress('running');
    let chain = Promise.resolve();
    let landed = 0;
    const controller = new AbortController();
    active.set(req.importId, controller);

    /** Append this run to `project.json` — also when it was cut short, so landed variants keep their session. */
    const recordSession = async () => {
      const existing = await deps.readText({ ...scope, path: AUDIO_PROJECT_FILE });
      const history = parseAudioProjectFile(existing.ok ? existing.value : null);
      const session: AudioSession = {
        id: sessionId,
        kind: adapter.generates ? 'create' : 'import',
        provider,
        prompt: req.prompt,
        variants: files,
        createdAt: createdAt.toISOString(),
      };
      const next = { version: 1 as const, sessions: [...history.sessions, session] };
      await deps.writeBytes({
        ...scope,
        path: AUDIO_PROJECT_FILE,
        data: Buffer.from(JSON.stringify(next, null, 2) + '\n', 'utf8'),
      });
    };

    try {
      await adapter.generate(req.prompt, {
        signal: controller.signal,
        sources,
        readFile: deps.readFile,
        onProgress: (p) => {
          stage = p;
          progress('running');
        },
        onAudio: (audio) => {
          const index = landed++;
          chain = chain.then(() => land(audio, index));
        },
      });
      await chain;
      await recordSession();
      progress('succeeded');
      return ok({ sessionId, files });
    } catch (error) {
      await chain.catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      if (files.length > 0) await recordSession().catch(() => undefined);
      progress(message === 'cancelled' ? 'cancelled' : 'failed', message === 'cancelled' ? undefined : message);
      return failure(message);
    } finally {
      active.delete(req.importId);
    }
  }

  /** Import: `sources` come from main's own open dialog, never from the renderer. */
  function importFiles(req: AudioImportRequest, sources: readonly string[]) {
    return run(req, 'import', sources);
  }

  /** Generate: the request names a generating provider; nothing is picked from disk. */
  async function generate(req: AudioGenerateRequest) {
    const adapter = deps.providers[req.provider];
    if (!adapter?.generates) return failure('That provider does not generate audio.');
    return run(req, req.provider, []);
  }

  function cancel(importId: string): GitOpResult {
    active.get(importId)?.abort();
    return ok(undefined);
  }

  return { importFiles, generate, cancel, providerStatuses };
}

export type AudioService = ReturnType<typeof createAudioService>;
