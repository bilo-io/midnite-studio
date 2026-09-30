import type { AudioPrompt, AudioProviderId } from '@midnite/studio-shared';

/**
 * The `AudioProvider` seam (Phase 99 Theme E), mirroring Theme C's
 * `ImageProvider`: an adapter is only "request in, audio out". The audio
 * service owns the media-store writes, sidecars, `project.json` and progress,
 * so a generating adapter added later (ElevenLabs Music, local MusicGen, …)
 * plugs in here without touching any of that.
 */
export type AudioAdapterRequest = Pick<AudioPrompt, 'title' | 'style' | 'lyrics' | 'instrumental' | 'durationS' | 'count'>;

export type ProducedAudio = {
  bytes: Buffer;
  /** Lower-case extension without the dot — what the variant file is named with. */
  ext: string;
  /** Import only: the picked file's own name, recorded in the sidecar. */
  source?: string;
};

export type AudioAdapterDeps = {
  signal: AbortSignal;
  /** Import only: absolute paths the user picked in main's native dialog. */
  sources: readonly string[];
  readFile: (absPath: string) => Promise<Buffer>;
  /** Called as each variant is produced, so the service can land it before the next. */
  onAudio?: (audio: ProducedAudio) => void;
};

export interface AudioProvider {
  id: AudioProviderId;
  /** False when the adapter only brings files in (Import) — Create is not offered for it. */
  generates: boolean;
  generate: (req: AudioAdapterRequest, deps: AudioAdapterDeps) => Promise<ProducedAudio[]>;
}

/** A provider error the user can act on — the message is shown verbatim. */
export class AudioProviderError extends Error {}
