import { z } from 'zod';

import type { CompanionSettingKey } from './companion';

/**
 * "Tune me" and quick tweaks — Phase 109 Theme H.
 *
 * The companion's personality and About me are free text up to 4000
 * characters each, and nobody should have to dictate that to whisper-tiny.
 * So they change by voice only two ways (Decision 4): a short **interview**
 * ("tune yourself", "let me tell you about me") whose answers an agent CLI
 * turns into the text, and a one-line **tweak** ("be more sarcastic") that an
 * agent CLI applies to the text already there. Either way the companion reads
 * back a summary and asks before anything is written.
 *
 * This file is the pure half, shared by both ends: the interview's questions,
 * the template the answers fill when there is no agent CLI (Decision 6), the
 * wire shapes of the `'persona'` ask (`desktop/src/main/companion/ask.ts`), and
 * the words that steer an interview ("skip", "start over", "cancel"). The
 * state machine that walks the questions lives in the renderer
 * (`app/features/companion/conversation.ts`).
 *
 * Only *type* imports from `./companion`: that file imports
 * {@link CompanionPersonaReplySchema} from here to validate an ask reply, and a
 * value import back would be a cycle.
 */

/** The two settings a `tune` or `tweak` writes — the only two behind the `tunedText` guard. */
export const COMPANION_TUNE_TARGETS = [
  'companionPersonality',
  'companionAboutUser',
] as const satisfies readonly CompanionSettingKey[];
export type CompanionTuneTarget = (typeof COMPANION_TUNE_TARGETS)[number];

/** The store's own cap on both fields (`CompanionPersonalitySchema`). */
export const COMPANION_PERSONA_TEXT_MAX = 4000;
/** What gets read aloud before the confirm (Decision 11): about fifteen seconds of speech. */
export const COMPANION_PERSONA_SUMMARY_MAX = 200;
/** One interview answer. Four of them plus their labels stay well under {@link COMPANION_PERSONA_TEXT_MAX}. */
export const COMPANION_TUNE_ANSWER_MAX = 500;
/** One tweak — "be more sarcastic" is a sentence, not a paragraph. */
export const COMPANION_TWEAK_INSTRUCTION_MAX = 300;

/** How each target is named out loud — "I've left my personality as it was." */
export const COMPANION_TUNE_TARGET_SPOKEN: Readonly<Record<CompanionTuneTarget, string>> = {
  companionPersonality: 'my personality',
  companionAboutUser: 'what I know about you',
};

export type CompanionTuneQuestion = {
  /** Stable id — the key an answer is stored under. */
  id: string;
  /** Asked aloud, and posted in the thread. */
  ask: string;
  /** What the answer is about, named in the `'persona'` prompt. */
  topic: string;
  /** The template's sentence for a cleaned answer (Decision 6). */
  sentence: (answer: string) => string;
  /**
   * Words people echo back from the question — "call me Bilo", "I work on
   * the app" — dropped before {@link CompanionTuneQuestion.sentence} so the
   * template doesn't read "Call me call me Bilo."
   */
  leadIn?: RegExp;
};

/**
 * The interview, per target — three or four fixed questions, asked in order.
 *
 * The personality questions cover tone, how much it talks, humour and what to
 * avoid; About me covers what to call you, what you work on, and how you like
 * updates. The template sentences are labelled ("Tone: dry.") rather than
 * woven into prose, because an answer can be any shape a person says and a
 * label reads correctly around all of them.
 */
export const COMPANION_TUNE_QUESTIONS: Readonly<Record<CompanionTuneTarget, readonly CompanionTuneQuestion[]>> = {
  companionPersonality: [
    {
      id: 'tone',
      ask: 'First, what tone should I take — warm, dry, formal, playful, or something else?',
      topic: 'the tone to take',
      sentence: (answer) => `Tone: ${answer}.`,
      leadIn: /^(?:(?:be|sound|take|use|go\s+for|i'?d\s+like|i\s+want|i\s+prefer|something)\s+)+(?:(?:a|an)\s+)?/i,
    },
    {
      id: 'length',
      ask: 'How much should I talk — just the essentials, or more detail?',
      topic: 'how much to say',
      sentence: (answer) => `How much to say: ${answer}.`,
      leadIn: /^(?:(?:talk|say|give\s+me|i'?d\s+like|i\s+want|i\s+prefer)\s+)+/i,
    },
    {
      id: 'humour',
      ask: 'How about humour — none, a little, or plenty?',
      topic: 'humour',
      sentence: (answer) => `Humour: ${answer}.`,
    },
    {
      id: 'avoid',
      ask: 'Last one: anything I should avoid?',
      topic: 'what to avoid',
      sentence: (answer) => `Avoid: ${answer}.`,
      leadIn: /^(?:(?:please\s+)?(?:avoid|don'?t|do\s+not|never|no)\s+)/i,
    },
  ],
  companionAboutUser: [
    {
      id: 'name',
      ask: 'First, what should I call you?',
      topic: 'what to call them',
      sentence: (answer) => `Call me ${answer}.`,
      leadIn: /^(?:(?:you\s+can\s+|just\s+)*call\s+me\s+|my\s+name\s+is\s+|my\s+name'?s\s+|i'?m\s+|it'?s\s+)/i,
    },
    {
      id: 'work',
      ask: 'What do you work on?',
      topic: 'what they work on',
      sentence: (answer) => `I work on ${answer}.`,
      leadIn: /^(?:i'?m\s+(?:mostly\s+|mainly\s+)?working\s+on\s+|i\s+(?:mostly\s+|mainly\s+)?work\s+on\s+)/i,
    },
    {
      id: 'updates',
      ask: 'And how do you like your updates — short and quick, or the full story?',
      topic: 'how they like updates',
      sentence: (answer) => `How I like updates: ${answer}.`,
      leadIn: /^(?:i\s+(?:like|prefer|want)\s+(?:them\s+)?)/i,
    },
  ],
};

/** An interview's answers so far, by question id. A skipped question is absent. */
export type CompanionTuneAnswers = Readonly<Record<string, string>>;

/** Hesitations a transcript keeps at the front of an answer. */
const FILLER_START = /^(?:(?:um+|uh+|er+|erm|hmm+|ah+|oh|well|so|okay|ok|right|yes|yeah|yep|sure|i\s+think|i\s+guess)\b[,\s]*)+/i;

/** Words that don't start a sentence once the answer sits mid-sentence ("I work on the app"). */
const LOWER_FIRST = new Set([
  'the', 'a', 'an', 'my', 'our', 'some', 'mostly', 'mainly', 'just', 'lots', 'short', 'long',
  'quick', 'brief', 'plenty', 'none', 'nothing', 'anything', 'everything', 'web', 'backend',
  'frontend', 'mobile', 'games', 'whatever',
]);

/** Cut to `max` at a word boundary, marked with an ellipsis — never mid-word. */
function capAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.—-]+$/, '')}…`;
}

/**
 * One answer as the template uses it: hesitations and the question's own
 * words off the front, trailing punctuation off the end, whitespace collapsed,
 * capped at {@link COMPANION_TUNE_ANSWER_MAX}. `''` when nothing is left.
 */
export function cleanTuneAnswer(question: Pick<CompanionTuneQuestion, 'leadIn'>, raw: string): string {
  let answer = raw.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  answer = answer.replace(FILLER_START, '');
  if (question.leadIn) answer = answer.replace(question.leadIn, '');
  answer = answer
    .replace(/^[\s,;:—-]+/, '')
    .replace(/[\s.!?,;:—-]+$/, '')
    .replace(/(?:[,\s]+(?:please|thanks|thank you))+$/i, '')
    .trim();
  if (answer === '') return '';
  const first = answer.split(' ')[0] as string;
  if (LOWER_FIRST.has(first.toLowerCase()) && first.slice(1) === first.slice(1).toLowerCase()) {
    answer = answer.charAt(0).toLowerCase() + answer.slice(1);
  }
  return capAtWord(answer, COMPANION_TUNE_ANSWER_MAX);
}

/**
 * The first sentence of `text`, capped at {@link COMPANION_PERSONA_SUMMARY_MAX}
 * — the template's summary (Decision 6).
 */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(trimmed);
  return capAtWord((match?.[0] ?? trimmed).trim(), COMPANION_PERSONA_SUMMARY_MAX);
}

/** What a `'persona'` ask produces, and what the template produces without one. */
export const CompanionPersonaReplySchema = z.object({
  text: z.string().trim().min(1).max(COMPANION_PERSONA_TEXT_MAX),
  summary: z.string().trim().min(1).max(COMPANION_PERSONA_SUMMARY_MAX),
});
export type CompanionPersonaReply = z.infer<typeof CompanionPersonaReplySchema>;

/**
 * The template fallback (Decision 6): the answers, cleaned, one labelled
 * sentence each in the interview's own order, and the first of those as the
 * summary. Deterministic — the same answers always make the same text — so
 * what the companion reads back is what it would write.
 *
 * `text` is `''` when every question was skipped; the caller says so rather
 * than writing an empty field over one that had something in it.
 */
export function buildPersonaFromAnswers(
  target: CompanionTuneTarget,
  answers: CompanionTuneAnswers,
): { text: string; summary: string } {
  const sentences: string[] = [];
  for (const question of COMPANION_TUNE_QUESTIONS[target]) {
    const raw = answers[question.id];
    if (raw === undefined) continue;
    const answer = cleanTuneAnswer(question, raw);
    if (answer !== '') sentences.push(question.sentence(answer));
  }
  const text = sentences.join(' ');
  return { text, summary: text === '' ? '' : firstSentence(text) };
}

/**
 * An interview's answers as the `'persona'` prompt takes them: in question
 * order, each cleaned like the template's ({@link cleanTuneAnswer}), and an
 * answer that cleans to nothing dropped — so the prompt and the template
 * always agree on what was actually said.
 */
export function tuneAnswersForPrompt(
  target: CompanionTuneTarget,
  answers: CompanionTuneAnswers,
): { topic: string; answer: string }[] {
  const out: { topic: string; answer: string }[] = [];
  for (const question of COMPANION_TUNE_QUESTIONS[target]) {
    const raw = answers[question.id];
    if (raw === undefined) continue;
    const answer = cleanTuneAnswer(question, raw);
    if (answer !== '') out.push({ topic: question.topic, answer });
  }
  return out;
}

/** One answered question, as the `'persona'` prompt sees it. */
export const CompanionTuneAnswerSchema = z.object({
  topic: z.string().min(1).max(80),
  answer: z.string().trim().min(1).max(COMPANION_TUNE_ANSWER_MAX),
});

/**
 * What the renderer sends with a `'persona'` ask (`CompanionAskRequest.persona`).
 *
 * - `interview`: the answers, in order, to write `target` from — `current` is
 *   what it says today, which the CLI may keep what still fits from.
 * - `tweak`: one instruction to apply to `current`, which is the whole point.
 */
export const CompanionPersonaRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('interview'),
    target: z.enum(COMPANION_TUNE_TARGETS),
    answers: z.array(CompanionTuneAnswerSchema).min(1).max(8),
    current: z.string().max(COMPANION_PERSONA_TEXT_MAX),
  }),
  z.object({
    mode: z.literal('tweak'),
    target: z.enum(COMPANION_TUNE_TARGETS),
    instruction: z.string().trim().min(1).max(COMPANION_TWEAK_INSTRUCTION_MAX),
    current: z.string().max(COMPANION_PERSONA_TEXT_MAX),
  }),
]);
export type CompanionPersonaRequest = z.infer<typeof CompanionPersonaRequestSchema>;

/** How a reply during an interview steers it. `answer` is anything else — the answer itself. */
export type CompanionTuneReplyKind = 'cancel' | 'startOver' | 'skip' | 'yes' | 'no' | 'answer';

/**
 * Whole-utterance words, after politeness is taken off both ends — so
 * "cancel" steers the interview, while "don't cancel my meetings" is an
 * answer. "Stop" is a cancel here: mid-interview it can only mean "stop
 * asking".
 */
const TUNE_REPLY_WORDS: Readonly<Record<Exclude<CompanionTuneReplyKind, 'answer'>, readonly string[]>> = {
  cancel: [
    'cancel', 'cancel that', 'cancel it', 'cancel this', 'cancel the interview', 'never mind', 'nevermind',
    'forget it', 'forget about it', 'stop', 'stop it', 'stop asking', 'stop the interview', 'stop tuning',
    'enough', 'quit', 'exit', 'abort', "let's stop", 'leave it', 'leave it as it is', 'drop it',
  ],
  startOver: [
    'start over', 'start again', 'start from the top', 'start from the beginning', 'restart', 'from the top',
    'begin again', 'go back to the start', 'go back to the beginning', "let's start over", "let's start again",
    'start it over', 'redo', 'do it again',
  ],
  skip: [
    'skip', 'skip it', 'skip that', 'skip this', 'skip this one', 'skip that one', 'pass', 'next',
    'next question', 'no idea', "i don't know", 'i dunno', 'dunno', 'no preference', "doesn't matter",
    "it doesn't matter", 'whatever', 'nothing', 'none', 'not really', 'nothing really', 'no comment',
  ],
  yes: [
    'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'go on', 'go ahead', 'do it', 'please', 'yes please',
    'read it', 'read it all', 'read it out', 'all of it', "let's hear it", 'go for it', 'absolutely', 'confirm',
  ],
  no: [
    'no', 'nope', 'nah', 'no thanks', 'no thank you', 'not now', "that's fine", "that's ok", "that's okay",
    "it's fine", 'just the summary', "i'm good", "don't bother", 'no need',
  ],
};

/** Steer-word normalisation: case, curly quotes, trailing punctuation and politeness at either end. */
function steerCore(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:um+|uh+|er+|erm|hmm+|oh|well|so|ok|okay|alright|right|hey|actually)\s+)+(?=\S)/, '')
    .replace(/(?:\s+(?:please|thanks|thank you|then|now))+$/, '')
    .trim();
}

/** Which way a reply steers an interview — {@link CompanionTuneReplyKind}. */
export function classifyTuneReply(text: string): CompanionTuneReplyKind {
  const core = steerCore(text);
  if (core === '') return 'skip';
  for (const kind of ['cancel', 'startOver', 'skip', 'yes', 'no'] as const) {
    if (TUNE_REPLY_WORDS[kind].includes(core)) return kind;
  }
  // "Yeah, go on." "Nope, that's fine." — a yes or no word leading another of the same.
  const yes = /^(?:yes|yeah|yep|yup|sure)\s+(.+)$/.exec(core);
  if (yes && TUNE_REPLY_WORDS.yes.includes(yes[1] as string)) return 'yes';
  const no = /^(?:no|nope|nah)\s+(.+)$/.exec(core);
  if (no && TUNE_REPLY_WORDS.no.includes(no[1] as string)) return 'no';
  return 'answer';
}

// --- the spoken grammar -------------------------------------------------------

/**
 * A line with the asking taken off both ends — "okay, could you tune yourself
 * please" is "tune yourself". Lower-cased: nothing these phrases capture is
 * stored as said except a tweak, which is an instruction to a CLI, not a name.
 */
function tuneCore(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s*,\s*/g, ' ')
    .replace(/[.!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /^(?:(?:please|ok|okay|hey|so|and|right|alright|now|can\s+you|could\s+you|would\s+you|will\s+you|i\s+want\s+you\s+to|i'?d\s+like\s+you\s+to|i\s+need\s+you\s+to|try\s+to)\s+)+/,
      '',
    )
    .replace(/(?:\s+(?:please|thanks|thank\s+you|for\s+me|from\s+now\s+on))+$/, '')
    .trim();
}

/** "tune yourself", and whisper's "june your self". */
const TUNE_VERB = String.raw`(?:change|tune|june|toon|adjust|update|redo|rewrite|set\s+up|work\s+on|edit|tweak|customi[sz]e|personali[sz]e)`;

const TUNE_PERSONALITY: readonly RegExp[] = [
  new RegExp(
    String.raw`^(?:let'?s\s+|let\s+us\s+|i\s+want\s+to\s+|i'?d\s+like\s+to\s+|can\s+we\s+|could\s+we\s+|help\s+me\s+)?${TUNE_VERB}\s+(?:your|the\s+companion'?s|the)\s+personalit(?:y|ies)(?:\s+(?:settings|notes))?$`,
  ),
  /^(?:let'?s\s+)?(?:tune|june|toon|adjust|customi[sz]e)\s+(?:your\s*self|you)(?:\s+up)?$/,
  /^(?:a\s+)?personality\s+interview$/,
  /^(?:interview|quiz)\s+me\s+about\s+your\s+personality$/,
  /^(?:give\s+yourself|get|have)\s+a\s+new\s+personality$/,
  /^(?:change|work\s+on)\s+how\s+you\s+(?:talk|sound|behave|come\s+across)$/,
];

const TUNE_ABOUT_ME: readonly RegExp[] = [
  /^(?:let\s+me|i\s+want\s+to|i'?d\s+like\s+to|can\s+i)\s+tell\s+you\s+(?:(?:a\s+bit|a\s+little|more|something|some\s+things)\s+)?(?:about\s+(?:me|myself)|who\s+i\s+am)$/,
  /^(?:change|update|set\s+up|edit|redo|tune|fix|rewrite)\s+(?:my\s+|the\s+)?about[\s-]+me(?:\s+(?:section|notes|settings))?$/,
  /^(?:change|update|redo)\s+what\s+you\s+know\s+about\s+me$/,
  /^get\s+to\s+know\s+me(?:\s+(?:better|a\s+bit|a\s+little))?$/,
  /^learn\s+(?:about\s+me|who\s+i\s+am)$/,
  /^interview\s+me$/,
];

/**
 * "Tune yourself", "let's change your personality", "let me tell you about
 * me" — the target an interview should write, or `null`. Anchored to the
 * whole line, so a sentence that only mentions a personality goes on to the
 * router instead.
 */
export function matchTunePhrase(text: string): CompanionTuneTarget | null {
  const core = tuneCore(text);
  if (TUNE_PERSONALITY.some((pattern) => pattern.test(core))) return 'companionPersonality';
  if (TUNE_ABOUT_ME.some((pattern) => pattern.test(core))) return 'companionAboutUser';
  return null;
}

/** One to three words after "more"/"less" — "sarcastic", "to the point". */
const QUALITY = String.raw`[a-z'-]+(?:\s+[a-z'-]+){0,2}`;
const DEGREE = String.raw`(?:(?:a\s+(?:bit|little|tad|lot)|much|way|slightly|even|lots)\s+)?`;

const TWEAK: readonly RegExp[] = [
  // "be less loud" is the volume's, left for the router to read as one.
  new RegExp(
    String.raw`^(?:be|sound|act|make\s+yourself)\s+${DEGREE}(?:more|less)\s+(?!(?:loud|quiet|soft)$)${QUALITY}$`,
  ),
  // "be funnier", "be nicer" — but "be louder/quieter/softer" is the volume, not a personality.
  new RegExp(String.raw`^be\s+${DEGREE}(?!(?:louder|quieter|softer)$)[a-z]+(?:ier|er)$`),
  // Not "talk more about the release" — only a manner may follow.
  new RegExp(
    String.raw`^(?:talk|speak|say)\s+${DEGREE}(?:less|more)(?:\s+(?:slowly|plainly|simply|casually|formally|often|politely))?$`,
  ),
  /^(?:stop|quit)\s+being\s+(?:so\s+)?[a-z'-]+(?:\s+[a-z'-]+){0,2}$/,
  /^(?:don'?t|do\s+not)\s+be\s+(?:so\s+)?[a-z'-]+(?:\s+[a-z'-]+){0,2}$/,
  /^(?:stop|quit)\s+(?:joking|swearing|apologi[sz]ing|rambling|waffling|lecturing|hedging|using\s+(?:jargon|emojis?|slang|big\s+words))(?:\s+(?:so\s+much|around|all\s+the\s+time))?$/,
  /^(?:no|fewer|less|more)\s+(?:jokes|jargon|emojis?|small\s+talk|puns|waffle|waffling|chit[\s-]?chat|sarcasm|enthusiasm)$/,
  /^(?:tone\s+it\s+down|lighten\s+up|cheer\s+up|calm\s+down|get\s+to\s+the\s+point|keep\s+it\s+(?:short|brief|simple|snappy)|be\s+(?:brief|concise|blunt|direct|terse|nice|kind|gentle|honest|casual|formal|polite)|be\s+yourself)$/,
];

/**
 * "Be more sarcastic", "talk less", "stop being so formal" — the instruction
 * to send the `'persona'` mode, as said, or `null`. Personality only: what
 * the companion calls you ("don't call me boss") is the `setting` grammar's,
 * which runs first and keeps it.
 */
export function matchTweakPhrase(text: string): string | null {
  const core = tuneCore(text);
  if (core === '' || core.length > COMPANION_TWEAK_INSTRUCTION_MAX) return null;
  return TWEAK.some((pattern) => pattern.test(core)) ? core : null;
}
