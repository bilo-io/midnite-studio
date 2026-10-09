import {
  AUDIO_DURATION_MAX_S,
  AUDIO_DURATION_MIN_S,
  AUDIO_PROJECT_FILE,
  AudioPromptSchema,
  audioSidecarPath,
  describeSong,
  failure,
  ok,
  parseAudioProjectFile,
  type AudioSession,
  type AudioSidecar,
  type GitOpResult,
  type MusicExportRequest,
  type MusicSendToGeneratorRequest,
  type MusicSendToGeneratorResult,
  type Song,
} from '@midnite/studio-shared';

import { audioSlug, audioTimeStamp } from '../audio/audio-service';
import { songToMidi } from './midi-io';

/**
 * Phase 101 Themes J and K, main's half. Export saves the song as `.mid` (encoded here), or the
 * renderer's offline WAV render as-is / transcoded to MP3 by ffmpeg. Send to Generator lands that
 * render in the Audio project as a variant — a sidecar that links back to the song and carries
 * {@link describeSong}'s text — and records one session so Generator lists it.
 */
type Scope = { repoId: string; tab: 'audio'; project: string };

export type MusicExportDeps<W = unknown> = {
  /** The native save dialog; `null` when cancelled. */
  pickSavePath: (window: W | undefined, req: { defaultName: string; ext: string; label: string; defaultDir?: string }) => Promise<string | null>;
  writeLocal: (absPath: string, data: Buffer) => Promise<void>;
  /** WAV bytes → MP3 at `dest` (ffmpeg, probed not bundled). */
  transcodeMp3: (req: { exportId: string; wav: Buffer; dest: string; bitrateKbps: number }) => Promise<GitOpResult<{ dest: string }>>;
  writeBytes: (req: Scope & { path: string; data: Buffer }) => Promise<GitOpResult<unknown>>;
  readText: (req: Scope & { path: string }) => Promise<GitOpResult<string>>;
  /** Writes the song when the project has none under that name; never overwrites one. */
  ensureSong: (repoId: string, project: string, name: string, song: Song) => Promise<GitOpResult>;
  now?: () => Date;
  mintId?: () => string;
};

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createMusicExporter<W = unknown>(deps: MusicExportDeps<W>) {
  const now = deps.now ?? (() => new Date());
  const mintId = deps.mintId ?? (() => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);

  async function exportSong(req: MusicExportRequest, window?: W): Promise<GitOpResult<{ dest: string }>> {
    const ext = req.format;
    const label = req.format === 'mid' ? 'MIDI' : req.format === 'wav' ? 'WAV' : 'MP3';
    if (req.format !== 'mid' && !req.wav) return failure('The render is missing.');
    let data: Buffer;
    try {
      data = req.format === 'mid' ? Buffer.from(songToMidi(req.song)) : Buffer.from(req.wav!);
    } catch (error) {
      return failure(`Could not encode the song: ${message(error)}`);
    }
    const dest = await deps.pickSavePath(window, { defaultName: `${req.name}.${ext}`, ext, label, defaultDir: req.defaultDir });
    if (!dest) return failure('cancelled');
    if (req.format === 'mp3') {
      return deps.transcodeMp3({ exportId: req.exportId, wav: data, dest, bitrateKbps: req.bitrateKbps ?? 192 });
    }
    try {
      await deps.writeLocal(dest, data);
      return ok({ dest });
    } catch (error) {
      return failure(message(error));
    }
  }

  async function sendToGenerator(req: MusicSendToGeneratorRequest): Promise<GitOpResult<MusicSendToGeneratorResult>> {
    const scope: Scope = { repoId: req.repoId, tab: 'audio', project: req.project };
    const description = describeSong(req.song);
    const createdAt = now();
    const sessionId = mintId();
    const file = `${audioSlug(req.name)}-reference-${audioTimeStamp(createdAt)}.wav`;

    const ensured = await deps.ensureSong(req.repoId, req.project, req.name, req.song);
    if (!ensured.ok) return failure(ensured.kind === 'error' ? ensured.message : 'Could not save the song.');
    const wrote = await deps.writeBytes({ ...scope, path: file, data: Buffer.from(req.wav) });
    if (!wrote.ok) return failure(wrote.kind === 'error' ? wrote.message : 'Could not write the reference.');

    const sidecar: AudioSidecar = {
      version: 1,
      file,
      sessionId,
      provider: 'import',
      title: `${req.name} (reference)`,
      durationS: req.durationS,
      createdAt: createdAt.toISOString(),
      fromSong: { project: req.project, name: req.name },
      description: description.text,
    };
    const wroteSidecar = await deps.writeBytes({
      ...scope,
      path: audioSidecarPath(file),
      data: Buffer.from(JSON.stringify(sidecar, null, 2) + '\n', 'utf8'),
    });
    if (!wroteSidecar.ok) return failure(wroteSidecar.kind === 'error' ? wroteSidecar.message : 'Could not write the sidecar.');

    const existing = await deps.readText({ ...scope, path: AUDIO_PROJECT_FILE });
    const history = parseAudioProjectFile(existing.ok ? existing.value : null);
    const session: AudioSession = {
      id: sessionId,
      kind: 'import',
      provider: 'import',
      prompt: AudioPromptSchema.parse({
        title: req.name,
        style: description.tags.slice(0, 12),
        instrumental: true,
        durationS: Math.min(AUDIO_DURATION_MAX_S, Math.max(AUDIO_DURATION_MIN_S, Math.round(req.durationS))),
        count: 1,
        musicPrompt: description.text,
      }),
      variants: [file],
      createdAt: createdAt.toISOString(),
    };
    const recorded = await deps.writeBytes({
      ...scope,
      path: AUDIO_PROJECT_FILE,
      data: Buffer.from(JSON.stringify({ version: 1 as const, sessions: [...history.sessions, session] }, null, 2) + '\n', 'utf8'),
    });
    if (!recorded.ok) return failure(recorded.kind === 'error' ? recorded.message : 'Could not record the session.');
    return ok({ file, sessionId, description: description.text, tags: description.tags });
  }

  return { exportSong, sendToGenerator };
}

export type MusicExporter = ReturnType<typeof createMusicExporter>;
