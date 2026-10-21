import { AUDIO_LOCAL_MAX_DURATION_S, AUDIO_LOCAL_SEGMENT_S, type AudioPrompt } from '@midnite/studio-shared';

/** MusicGen's EnCodec runs at 50 frames per second, one decoder step per frame. */
export const MUSICGEN_FRAMES_PER_SECOND = 50;
/** Seconds of overlap between consecutive sections, blended with an equal-power crossfade. */
export const SECTION_CROSSFADE_S = 1.5;

export type Segment = { index: number; seconds: number; tokens: number };

/**
 * Split a requested duration into the fewest sections of at most one model
 * window each. Every join eats `SECTION_CROSSFADE_S` of overlap, so sections
 * are sized to leave the stitched track at the requested length.
 */
export function planSegments(durationS: number): Segment[] {
  const total = Math.max(5, Math.min(durationS, AUDIO_LOCAL_MAX_DURATION_S));
  const count = total <= AUDIO_LOCAL_SEGMENT_S ? 1 : Math.ceil((total - SECTION_CROSSFADE_S) / (AUDIO_LOCAL_SEGMENT_S - SECTION_CROSSFADE_S));
  const seconds = (total + (count - 1) * SECTION_CROSSFADE_S) / count;
  return Array.from({ length: count }, (_, index) => ({
    index,
    seconds,
    tokens: Math.round(seconds * MUSICGEN_FRAMES_PER_SECOND),
  }));
}

/**
 * The caption for one section. An explicit `musicPrompt` (hand-written or from
 * Ollama) wins; otherwise the style tags are joined, which is the format
 * MusicGen's training captions resemble. Sections cycle through
 * `prompt.sections` when present, so a long track can move through intro,
 * build and outro captions.
 */
export function captionFor(prompt: Pick<AudioPrompt, 'title' | 'style' | 'musicPrompt' | 'sections'>, segment: number): string {
  const sections = prompt.sections ?? [];
  const section = sections.length > 0 ? sections[segment % sections.length] : undefined;
  if (section) return section;
  if (prompt.musicPrompt) return prompt.musicPrompt;
  if (prompt.style.length > 0) return prompt.style.join(', ');
  return prompt.title.trim() || 'instrumental music';
}
