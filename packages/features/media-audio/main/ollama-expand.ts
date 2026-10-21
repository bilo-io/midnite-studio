import {
  AUDIO_LOCAL_SEGMENT_S,
  AUDIO_MUSIC_PROMPT_MAX,
  AUDIO_OLLAMA_PREFERRED,
  AUDIO_OLLAMA_RECOMMENDED,
  AUDIO_SECTIONS_MAX,
  failure,
  ok,
  type AudioExpandRequest,
  type AudioExpandResult,
  type GitOpResult,
} from '@midnite/studio-shared';

/**
 * Optional prompt expansion through a local Ollama model. Ollama cannot make
 * audio; what a 3B instruction model *can* do is turn "lofi study beat" into
 * the descriptive caption MusicGen was trained on (genre, instruments, mood,
 * tempo, production) and a short per-section arc for tracks longer than one
 * 30 s window. Everything here degrades to a plain failure the form shows
 * inline — generation never depends on it.
 */
export type ExpandDeps = {
  /** Installed model names; rejects when the daemon is down. */
  listModels: () => Promise<string[]>;
  chat: (model: string, messages: { role: 'system' | 'user'; content: string }[]) => Promise<string>;
};

const base = (name: string) => name.replace(/:latest$/, '');

/** The user's pick if installed, else the first preferred model that is, else none. */
export function pickOllamaModel(installed: readonly string[], chosen = ''): string | null {
  const has = (name: string) => installed.find((m) => base(m) === base(name));
  if (chosen) return has(chosen) ?? null;
  for (const name of AUDIO_OLLAMA_PREFERRED) {
    const found = has(name);
    if (found) return found;
  }
  return null;
}

export function sectionCount(durationS: number): number {
  return Math.max(1, Math.min(AUDIO_SECTIONS_MAX, 4, Math.ceil(durationS / AUDIO_LOCAL_SEGMENT_S)));
}

export function expansionMessages(req: AudioExpandRequest): { role: 'system' | 'user'; content: string }[] {
  const sections = sectionCount(req.durationS);
  const system = [
    'You write captions for MusicGen, a text-to-music model that only makes instrumental music.',
    'A good caption is one line of comma-separated descriptors: genre, instruments, mood, tempo in bpm, production style.',
    'Rules: English only, under 35 words, no artist names, no lyrics, no singing or vocals, no explanation.',
    `Reply with ONLY a JSON object: {"musicPrompt": string, "sections": string[]}.`,
    `"sections" has exactly ${sections} caption${sections === 1 ? '' : 's'}, one per ~${AUDIO_LOCAL_SEGMENT_S}s of the track, ` +
      'each keeping the same core style and tempo but following a natural arc (intro, build, peak, outro).',
  ].join('\n');
  const parts = [
    req.title && `Title: ${req.title}`,
    req.style.length > 0 && `Style tags: ${req.style.join(', ')}`,
    !req.instrumental && req.lyrics.trim() && `Lyrics (use only for mood and structure, the music has no vocals):\n${req.lyrics.slice(0, 1200)}`,
    `Length: ${req.durationS} seconds`,
  ].filter(Boolean);
  return [
    { role: 'system', content: system },
    { role: 'user', content: parts.join('\n') || 'An instrumental track.' },
  ];
}

const cap = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, AUDIO_MUSIC_PROMPT_MAX);

/** Pull `{musicPrompt, sections}` out of a model reply: tolerates <think> blocks, code fences and chatter. */
export function parseExpansion(reply: string): { musicPrompt: string; sections: string[] } | null {
  const text = reply.replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as { musicPrompt?: unknown; sections?: unknown };
    const musicPrompt = typeof raw.musicPrompt === 'string' ? cap(raw.musicPrompt) : '';
    const sections = Array.isArray(raw.sections)
      ? raw.sections.filter((s): s is string => typeof s === 'string').map(cap).filter(Boolean).slice(0, AUDIO_SECTIONS_MAX)
      : [];
    if (!musicPrompt) return null;
    return { musicPrompt, sections };
  } catch {
    return null;
  }
}

export async function expandPrompt(req: AudioExpandRequest, deps: ExpandDeps): Promise<GitOpResult<AudioExpandResult>> {
  let installed: string[];
  try {
    installed = await deps.listModels();
  } catch {
    return failure('Ollama is not running. Start it to enhance prompts, or write the caption yourself.');
  }
  const model = pickOllamaModel(installed, req.model);
  if (!model) {
    return failure(
      req.model
        ? `Ollama does not have "${req.model}" installed.`
        : `No small Ollama model is installed. Run: ollama pull ${AUDIO_OLLAMA_RECOMMENDED}`,
    );
  }
  try {
    const parsed = parseExpansion(await deps.chat(model, expansionMessages(req)));
    if (!parsed) return failure(`${model} did not return a usable caption. Try again, or pick another model.`);
    return ok({ ...parsed, model });
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}
