/**
 * The voice audition (Phase 109 Theme F) — the pure half.
 *
 * "Try some British voices" plays three or four numbered samples, and the
 * user picks one by number. Everything here is a pure function over plain
 * data: the phrase that starts an audition, which voices it plays and in what
 * order, and what a reply in the middle of one means. The renderer
 * (`app/features/companion/audition.ts`) owns the state and the playback.
 *
 * Deliberately free of imports from `companion.ts`: that file imports this
 * one for the intent arm's enums and the phrase matcher, and the voice lists
 * come in as arguments, so there is no cycle to manage.
 */

export const COMPANION_AUDITION_ACCENTS = ['american', 'british'] as const;
export type CompanionAuditionAccent = (typeof COMPANION_AUDITION_ACCENTS)[number];

export const COMPANION_AUDITION_GENDERS = ['female', 'male'] as const;
export type CompanionAuditionGender = (typeof COMPANION_AUDITION_GENDERS)[number];

/** What "British female voices" narrows to. Both optional — "try some voices" is every voice. */
export type CompanionAuditionFilter = {
  accent?: CompanionAuditionAccent | undefined;
  gender?: CompanionAuditionGender | undefined;
};

/** The most samples one batch plays — the doc's "3–4", and about as many as anyone holds in their head. */
export const COMPANION_AUDITION_BATCH_MAX = 4;

/** How long an audition waits for a reply after its last line. */
export const COMPANION_AUDITION_MEMORY_MS = 2 * 60 * 1000;

// --- the phrase that starts one ---------------------------------------------

const ACCENT_WORDS: Readonly<Record<string, CompanionAuditionAccent>> = {
  british: 'british',
  english: 'british',
  uk: 'british',
  'u.k.': 'british',
  brit: 'british',
  american: 'american',
  us: 'american',
  'u.s.': 'american',
  usa: 'american',
};

const GENDER_WORDS: Readonly<Record<string, CompanionAuditionGender>> = {
  female: 'female',
  feminine: 'female',
  woman: 'female',
  "woman's": 'female',
  women: 'female',
  "women's": 'female',
  girl: 'female',
  lady: 'female',
  ladies: 'female',
  male: 'male',
  masculine: 'male',
  man: 'male',
  "man's": 'male',
  men: 'male',
  "men's": 'male',
  guy: 'male',
  guys: 'male',
};

/** Words that may sit between the verb and "voices" without saying anything about which ones. */
const FILLER_WORDS = new Set([
  'some', 'a', 'an', 'few', 'couple', 'of', 'other', 'different', 'more', 'new', 'your', 'the', 'all',
  'another', 'and', 'or', 'any',
]);

/**
 * The descriptors between the verb and "voices", or `null` when one of the
 * words is not a descriptor at all — "try Bella's voice" is a voice change,
 * not an audition, and "let me hear some voices" is.
 */
function readDescriptors(middle: string): CompanionAuditionFilter | null {
  const filter: CompanionAuditionFilter = {};
  for (const word of middle.split(/\s+/).filter((token) => token !== '')) {
    const accent = ACCENT_WORDS[word];
    const gender = GENDER_WORDS[word];
    if (accent !== undefined) filter.accent = accent;
    else if (gender !== undefined) filter.gender = gender;
    else if (!FILLER_WORDS.has(word)) return null;
  }
  return filter;
}

/** Politeness off both ends and the punctuation whisper adds, lower-cased, curly apostrophes straightened. */
function core(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[,;:!?]+/g, ' ')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:please|ok|okay|hey|so|and|right|alright|now|um|uh|er|hmm|well|oh|yeah)\b\s*)+/, '')
    .replace(/(?:\s+(?:please|thanks|thank you|now))+$/, '')
    .trim();
}

const AUDITION_VERB =
  /^(?:(?:can|could)\s+(?:i|you)\s+|i(?:'d|\s+would)\s+like\s+to\s+|i\s+want\s+to\s+|let\s+me\s+|let's\s+)?(?:hear|try(?:\s+out)?|audition|sample|play(?:\s+me)?|show\s+me|give\s+me)\s+(.*?)\s*\bvoices?(?:\s+samples?)?$/;

/**
 * "Try some voices", "audition British voices", "let me hear female voices",
 * "try a different voice" — the filter they ask for, or `null` when the line
 * is not an audition request.
 *
 * Anchored to the whole line, like every Phase 109 settings phrase, and it
 * needs the word "voice" or "voices" at the end — "try Bella" and "use voice
 * Bella" stay voice changes, and "play some music" stays music.
 */
export function matchAuditionPhrase(text: string): CompanionAuditionFilter | null {
  const line = core(text);
  if (line === '') return null;
  if (/^(?:start\s+|do\s+|run\s+)?(?:a\s+)?voice\s+audition$/.test(line) || /^audition$/.test(line)) return {};
  const match = AUDITION_VERB.exec(line);
  if (!match) return null;
  const middle = (match[1] ?? '').trim();
  // "try voice Bella" never reaches here (it does not end in "voice"), but
  // "try the voice" with nothing to say which would be a strange audition.
  return readDescriptors(middle);
}

/** "British female", "American", "" — the filter as it reads in a sentence. */
export function describeAuditionFilter(filter: CompanionAuditionFilter): string {
  const accent = filter.accent === undefined ? '' : filter.accent === 'british' ? 'British' : 'American';
  const gender = filter.gender ?? '';
  return [accent, gender].filter((part) => part !== '').join(' ');
}

// --- which voices it plays ---------------------------------------------------

/** The Kokoro catalog's own shape, structurally — `COMPANION_LOCAL_VOICES` passes as is. */
export type CompanionAuditionLocalVoice = {
  id: string;
  name: string;
  language: 'en-us' | 'en-gb';
  gender: 'Female' | 'Male';
  grade: string;
};

/** One sample to play: the value a pick writes, and the name the sample says. */
export type CompanionAuditionVoice = { value: string; name: string };

/** Kokoro's grades, best first; anything unlisted sorts last. */
const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F+', 'F', 'F-'];

function gradeRank(grade: string): number {
  const index = GRADE_ORDER.indexOf(grade);
  return index === -1 ? GRADE_ORDER.length : index;
}

/** Best grade first; equal grades keep their catalog order (`Array.prototype.sort` is stable). */
function byGrade<T extends { grade: string }>(voices: readonly T[]): T[] {
  return [...voices].sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade));
}

/** `[a1, b1, a2, b2, …]`, then whatever the longer list has left. */
function interleave<T>(first: readonly T[], second: readonly T[]): T[] {
  const out: T[] = [];
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    if (index < first.length) out.push(first[index] as T);
    if (index < second.length) out.push(second[index] as T);
  }
  return out;
}

/**
 * Every local voice the audition can play, in the order it plays them.
 *
 * Deterministic: best grade first, and — when no gender was asked for —
 * female and male alternating, so the first batch of "try some voices" is not
 * four women because the catalog's best-graded voices happen to be. The
 * current voice is never in the list: an audition is for hearing something
 * else.
 */
export function auditionLocalVoices(
  voices: readonly CompanionAuditionLocalVoice[],
  filter: CompanionAuditionFilter,
  current: string | null,
): CompanionAuditionVoice[] {
  const language = filter.accent === undefined ? null : filter.accent === 'british' ? 'en-gb' : 'en-us';
  const candidates = voices.filter(
    (voice) =>
      voice.id !== current &&
      (language === null || voice.language === language) &&
      (filter.gender === undefined || voice.gender.toLowerCase() === filter.gender),
  );
  const ordered =
    filter.gender === undefined
      ? interleave(
          byGrade(candidates.filter((voice) => voice.gender === 'Female')),
          byGrade(candidates.filter((voice) => voice.gender === 'Male')),
        )
      : byGrade(candidates);
  return ordered.map((voice) => ({ value: voice.id, name: voice.name }));
}

/** A `speechSynthesis` voice, as the renderer's settings port lists it. */
export type CompanionAuditionSystemVoice = { uri: string; name: string; lang?: string | undefined };

/**
 * The system voices the fallback plays: English ones, of the asked-for accent
 * when there are any, never the current one, each name once, in the
 * platform's own order.
 *
 * Gender is not a filter here: `speechSynthesis` does not say. The caller
 * tells the user so rather than guessing from a name.
 */
export function auditionSystemVoices(
  voices: readonly CompanionAuditionSystemVoice[],
  filter: CompanionAuditionFilter,
  current: string | null,
): CompanionAuditionVoice[] {
  const lang = (voice: CompanionAuditionSystemVoice) => (voice.lang ?? '').toLowerCase().replace('_', '-');
  const others = voices.filter((voice) => voice.uri !== current);
  const english = others.filter((voice) => lang(voice).startsWith('en'));
  const accented =
    filter.accent === undefined
      ? english
      : english.filter((voice) => lang(voice) === (filter.accent === 'british' ? 'en-gb' : 'en-us'));
  const pool = accented.length > 0 ? accented : english.length > 0 ? english : others;
  const seen = new Set<string>();
  const out: CompanionAuditionVoice[] = [];
  for (const voice of pool) {
    if (seen.has(voice.name)) continue;
    seen.add(voice.name);
    out.push({ value: voice.uri, name: voice.name });
  }
  return out;
}

/**
 * The pool cut into batches of three or four, as evenly as it divides — 27
 * voices play as six fours and a three, never as six fours and a lonely one.
 * A pool of one or two is one batch of what there is.
 */
export function auditionBatches<T>(pool: readonly T[]): T[][] {
  if (pool.length === 0) return [];
  const count = Math.ceil(pool.length / COMPANION_AUDITION_BATCH_MAX);
  const base = Math.floor(pool.length / count);
  const extra = pool.length % count;
  const batches: T[][] = [];
  let start = 0;
  for (let index = 0; index < count; index += 1) {
    const size = base + (index < extra ? 1 : 0);
    batches.push(pool.slice(start, start + size));
    start += size;
  }
  return batches;
}

const NUMBER_NAMES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** "Hi, I'm number two — Bella." The fixed line every sample speaks, so the number is heard in the voice it names. */
export function auditionSampleLine(number: number, name: string): string {
  return `Hi, I'm number ${NUMBER_NAMES[number] ?? String(number)} — ${name}.`;
}

/** "one", "two" — a count as the companion says it. */
export function auditionNumberWord(number: number): string {
  return NUMBER_NAMES[number] ?? String(number);
}

// --- what a reply means ------------------------------------------------------

export type CompanionAuditionReply =
  /** "Number two", "two", "the second one" — 1-based, possibly past the end of the batch. */
  | { kind: 'pick'; number: number }
  /** "That one" — whichever sample played last. */
  | { kind: 'that' }
  | { kind: 'next' }
  | { kind: 'again' }
  /** "None", "stop" — keep the voice there is. */
  | { kind: 'end' };

/**
 * Number words as whisper writes them, homophones included: in the middle of
 * an audition "to" and "too" are two, "for" is four, "won" is one.
 */
const REPLY_NUMBERS: Readonly<Record<string, number>> = {
  one: 1, won: 1, '1': 1, first: 1,
  two: 2, to: 2, too: 2, '2': 2, second: 2,
  three: 3, tree: 3, free: 3, '3': 3, third: 3,
  four: 4, for: 4, fore: 4, '4': 4, fourth: 4,
  five: 5, '5': 5, fifth: 5,
  six: 6, '6': 6, sixth: 6,
  seven: 7, '7': 7, seventh: 7,
  eight: 8, '8': 8, eighth: 8,
  nine: 9, '9': 9, ninth: 9,
};

const END =
  /^(?:none|none of (?:them|those|these)|neither|stop|stop (?:the |this )?audition|cancel|never ?mind|forget it|no|nope|no thanks|nah|done|enough|that's enough|exit|quit|end|keep (?:the |my )?(?:current|old|same|own)? ?(?:one|voice)|i'll keep (?:mine|my (?:own )?(?:voice|current one)))$/;
const NEXT =
  /^(?:next|next (?:batch|ones?|few|set|voices)|more|more (?:voices|options)|(?:some )?(?:other|different) (?:ones|voices)|play more|(?:show|give) me more|keep going|go on|another (?:batch|set|few))$/;
const AGAIN =
  /^(?:again|(?:play|say) (?:them|those|that|it|these) again|(?:play|say) again|repeat|repeat (?:that|them|those)|one more time|once more)$/;
const THAT =
  /^(?:(?:i'll take |i like |i want |pick |use |choose |go with |let's go with |give me )?(?:that|this)(?: one| voice)?|that's (?:the one|it|good|nice|the voice)|(?:the )?last one)$/;
const PICK =
  /^(?:(?:i'll take|i(?:'d)? like|i want|pick|choose|use|go with|let's go with|let's do|give me|take|make it|i choose)\s+)?(?:the\s+)?(?:(?:voice|number|no\.?)\s*|#\s*)?([a-z0-9]+)(?:\s+one)?$/;

/**
 * A line said during an audition, as a reply to it — or `null` when it is not
 * one, and the caller decides whether it is some other request.
 */
export function parseAuditionReply(text: string): CompanionAuditionReply | null {
  const line = core(text);
  if (line === '') return null;
  if (END.test(line)) return { kind: 'end' };
  if (NEXT.test(line)) return { kind: 'next' };
  if (AGAIN.test(line)) return { kind: 'again' };
  if (THAT.test(line)) return { kind: 'that' };
  const pick = PICK.exec(line);
  const number = pick ? REPLY_NUMBERS[pick[1] as string] : undefined;
  return number === undefined ? null : { kind: 'pick', number };
}
