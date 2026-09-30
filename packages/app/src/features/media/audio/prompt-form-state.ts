import {
  AUDIO_MAX_VARIANTS,
  AUDIO_STYLE_TAG_MAX,
  AUDIO_STYLE_TAGS_MAX,
  AudioPromptSchema,
  type AudioPrompt,
  type AudioProviderId,
} from '@midnite/studio-shared';

/**
 * The Suno-style prompt form's state (Phase 99 Theme E), kept as a reducer so
 * the tag, lyric-section and validation rules are testable without a DOM.
 */
export type PromptFormState = AudioPrompt & { provider: AudioProviderId; tagDraft: string };

export type PromptFormAction =
  | { type: 'title'; value: string }
  | { type: 'tagDraft'; value: string }
  | { type: 'addTag'; value?: string }
  | { type: 'removeTag'; tag: string }
  | { type: 'lyrics'; value: string }
  | { type: 'instrumental'; value: boolean }
  | { type: 'duration'; value: number }
  | { type: 'count'; value: number }
  | { type: 'provider'; value: AudioProviderId }
  | { type: 'reset' };

export function initialPromptForm(defaults: {
  provider: AudioProviderId;
  durationS: number;
  count: number;
}): PromptFormState {
  return { ...AudioPromptSchema.parse({ durationS: defaults.durationS, count: defaults.count }), provider: defaults.provider, tagDraft: '' };
}

/** Split a draft on commas, trim, drop empties and duplicates (case-insensitive), cap the count. */
export function mergeTags(existing: readonly string[], draft: string): string[] {
  const out = [...existing];
  for (const raw of draft.split(',')) {
    const tag = raw.trim().slice(0, AUDIO_STYLE_TAG_MAX);
    if (!tag || out.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    if (out.length >= AUDIO_STYLE_TAGS_MAX) break;
    out.push(tag);
  }
  return out;
}

const clampInt = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));

export function promptFormReducer(state: PromptFormState, action: PromptFormAction): PromptFormState {
  switch (action.type) {
    case 'title':
      return { ...state, title: action.value };
    case 'tagDraft':
      // Typing a comma commits everything before it.
      if (action.value.includes(',')) {
        const cut = action.value.lastIndexOf(',');
        return { ...state, style: mergeTags(state.style, action.value.slice(0, cut)), tagDraft: action.value.slice(cut + 1) };
      }
      return { ...state, tagDraft: action.value };
    case 'addTag':
      return { ...state, style: mergeTags(state.style, action.value ?? state.tagDraft), tagDraft: '' };
    case 'removeTag':
      return { ...state, style: state.style.filter((t) => t !== action.tag) };
    case 'lyrics':
      return { ...state, lyrics: action.value };
    case 'instrumental':
      return { ...state, instrumental: action.value };
    case 'duration':
      return { ...state, durationS: action.value };
    case 'count':
      return { ...state, count: clampInt(action.value, 1, AUDIO_MAX_VARIANTS) };
    case 'provider':
      return { ...state, provider: action.value };
    case 'reset':
      return { ...state, title: '', style: [], lyrics: '', tagDraft: '' };
  }
}

/**
 * The prompt as it would be sent — a pending tag draft counts, and an
 * instrumental prompt carries no lyrics. `error` is the first schema issue.
 */
export function toPrompt(state: PromptFormState): { prompt: AudioPrompt } | { error: string } {
  const parsed = AudioPromptSchema.safeParse({
    title: state.title,
    style: mergeTags(state.style, state.tagDraft),
    lyrics: state.instrumental ? '' : state.lyrics,
    instrumental: state.instrumental,
    durationS: state.durationS,
    count: state.count,
  });
  if (parsed.success) return { prompt: parsed.data };
  const issue = parsed.error.issues[0]!;
  return { error: `${issue.path.join('.') || 'prompt'}: ${issue.message}` };
}

/**
 * Insert a `[Section]` marker at `cursor` on a line of its own, returning the
 * new text and where the caret should land (just after the marker's newline).
 */
export function insertLyricSection(lyrics: string, cursor: number, section: string): { text: string; caret: number } {
  const at = Math.max(0, Math.min(cursor, lyrics.length));
  const before = lyrics.slice(0, at);
  const after = lyrics.slice(at);
  const lead = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const marker = `${lead}[${section}]\n`;
  return { text: before + marker + after, caret: before.length + marker.length };
}
