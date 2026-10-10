import { describe, expect, it } from 'vitest';

import { COMPANION_SETTING_SPECS, parseAskReply, type CompanionSettingKey } from './companion';
import {
  COMPANION_PERSONA_SUMMARY_MAX,
  COMPANION_PERSONA_TEXT_MAX,
  COMPANION_TUNE_ANSWER_MAX,
  COMPANION_TUNE_QUESTIONS,
  COMPANION_TUNE_TARGETS,
  CompanionPersonaReplySchema,
  CompanionPersonaRequestSchema,
  buildPersonaFromAnswers,
  classifyTuneReply,
  cleanTuneAnswer,
  firstSentence,
  matchTunePhrase,
  matchTweakPhrase,
  tuneAnswersForPrompt,
  type CompanionTuneQuestion,
  type CompanionTuneReplyKind,
} from './companion-tune';

describe('the tune targets', () => {
  it('are exactly the settings behind the tunedText guard', () => {
    const guarded = (Object.keys(COMPANION_SETTING_SPECS) as CompanionSettingKey[]).filter((key) =>
      COMPANION_SETTING_SPECS[key].guards?.includes('tunedText'),
    );
    expect([...COMPANION_TUNE_TARGETS].sort()).toEqual(guarded.sort());
  });
});

describe('COMPANION_TUNE_QUESTIONS', () => {
  it('asks about tone, length, humour and what to avoid for the personality', () => {
    expect(COMPANION_TUNE_QUESTIONS.companionPersonality.map((q) => q.id)).toEqual([
      'tone',
      'length',
      'humour',
      'avoid',
    ]);
  });

  it('asks what to call you, what you work on and how you like updates for About me', () => {
    expect(COMPANION_TUNE_QUESTIONS.companionAboutUser.map((q) => q.id)).toEqual(['name', 'work', 'updates']);
  });

  it('has three or four spoken questions per target, each a question with unique ids', () => {
    for (const target of COMPANION_TUNE_TARGETS) {
      const questions = COMPANION_TUNE_QUESTIONS[target];
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions.length).toBeLessThanOrEqual(4);
      expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
      for (const question of questions) {
        expect(question.ask.trim().endsWith('?')).toBe(true);
        expect(question.topic.length).toBeGreaterThan(0);
        expect(question.topic.length).toBeLessThanOrEqual(80);
      }
    }
  });
});

describe('cleanTuneAnswer', () => {
  const question = (id: string): CompanionTuneQuestion => {
    const found = [...COMPANION_TUNE_QUESTIONS.companionPersonality, ...COMPANION_TUNE_QUESTIONS.companionAboutUser].find(
      (entry) => entry.id === id,
    );
    if (!found) throw new Error(`no question ${id}`);
    return found;
  };
  const [tone, length, avoid] = [question('tone'), question('length'), question('avoid')];
  const [name, work, updates] = [question('name'), question('work'), question('updates')];

  it.each([
    [tone, 'Um, warm and a bit dry.', 'warm and a bit dry'],
    [tone, 'Be playful!', 'playful'],
    [tone, "I'd like a dry tone", 'dry tone'],
    [tone, 'Something friendly', 'friendly'],
    [tone, 'A bit sarcastic', 'a bit sarcastic'],
    [length, 'Just the essentials.', 'just the essentials'],
    [avoid, 'No jargon, please', 'jargon'],
    [avoid, "Don't apologise so much.", 'apologise so much'],
    [avoid, 'Yes, emojis.', 'emojis'],
    [name, 'Call me Bilo.', 'Bilo'],
    [name, 'You can just call me Boss', 'Boss'],
    [name, "I'm Sam", 'Sam'],
    [name, 'My name is Ada Lovelace.', 'Ada Lovelace'],
    [work, 'I work on The midnite desktop app.', 'the midnite desktop app'],
    [work, "I'm mostly working on Midnite Studio", 'Midnite Studio'],
    [updates, 'I like them short.', 'short'],
    [updates, 'Uh   short   and   quick ', 'short and quick'],
  ] as const)('%#: %s', (question, raw, expected) => {
    expect(cleanTuneAnswer(question, raw)).toBe(expected);
  });

  it('is empty when nothing but filler was said', () => {
    expect(cleanTuneAnswer(tone, 'Um, uh...')).toBe('');
  });

  it('caps a long answer at a word boundary, with an ellipsis', () => {
    const cleaned = cleanTuneAnswer(work, 'word '.repeat(400));
    expect(cleaned.length).toBeLessThanOrEqual(COMPANION_TUNE_ANSWER_MAX);
    expect(cleaned.endsWith('word…')).toBe(true);
  });

  it('turns curly apostrophes straight before matching a lead-in', () => {
    expect(cleanTuneAnswer(name, 'I’m Sam')).toBe('Sam');
  });
});

describe('firstSentence', () => {
  it('stops at the first sentence end', () => {
    expect(firstSentence('Tone: dry. Humour: plenty.')).toBe('Tone: dry.');
  });

  it('takes all of it when there is no sentence end', () => {
    expect(firstSentence('  Tone: dry ')).toBe('Tone: dry');
  });

  it('caps at the summary limit', () => {
    const summary = firstSentence(`${'long '.repeat(80)}end.`);
    expect(summary.length).toBeLessThanOrEqual(COMPANION_PERSONA_SUMMARY_MAX);
    expect(summary.endsWith('…')).toBe(true);
  });
});

describe('buildPersonaFromAnswers — the no-CLI template (Decision 6)', () => {
  it('fills the personality template in question order, summarised by its first sentence', () => {
    const persona = buildPersonaFromAnswers('companionPersonality', {
      avoid: 'No jargon.',
      tone: 'Um, warm and a bit dry.',
      length: 'Just the essentials',
      humour: 'A little',
    });
    expect(persona).toEqual({
      text: 'Tone: warm and a bit dry. How much to say: just the essentials. Humour: a little. Avoid: jargon.',
      summary: 'Tone: warm and a bit dry.',
    });
  });

  it('fills the About me template in the first person', () => {
    expect(
      buildPersonaFromAnswers('companionAboutUser', {
        name: 'Call me Bilo',
        work: 'I work on the midnite desktop app',
        updates: 'Short and to the point.',
      }),
    ).toEqual({
      text: 'Call me Bilo. I work on the midnite desktop app. How I like updates: short and to the point.',
      summary: 'Call me Bilo.',
    });
  });

  it('leaves a skipped question out, and takes its summary from the first answered one', () => {
    const persona = buildPersonaFromAnswers('companionPersonality', { humour: 'plenty' });
    expect(persona).toEqual({ text: 'Humour: plenty.', summary: 'Humour: plenty.' });
  });

  it('is empty when every question was skipped, or answered with filler only', () => {
    expect(buildPersonaFromAnswers('companionPersonality', {})).toEqual({ text: '', summary: '' });
    expect(buildPersonaFromAnswers('companionAboutUser', { name: 'um' })).toEqual({ text: '', summary: '' });
  });

  it('ignores answers to questions that do not exist', () => {
    expect(buildPersonaFromAnswers('companionAboutUser', { tone: 'dry' })).toEqual({ text: '', summary: '' });
  });

  it('is deterministic', () => {
    const answers = { tone: 'dry', avoid: 'emojis' };
    expect(buildPersonaFromAnswers('companionPersonality', answers)).toEqual(
      buildPersonaFromAnswers('companionPersonality', answers),
    );
  });

  it('always fits the persona reply schema, even with every answer at its cap', () => {
    for (const target of COMPANION_TUNE_TARGETS) {
      const answers = Object.fromEntries(
        COMPANION_TUNE_QUESTIONS[target].map((q) => [q.id, 'x'.repeat(COMPANION_TUNE_ANSWER_MAX * 2)]),
      );
      const persona = buildPersonaFromAnswers(target, answers);
      expect(persona.text.length).toBeLessThanOrEqual(COMPANION_PERSONA_TEXT_MAX);
      expect(CompanionPersonaReplySchema.safeParse(persona).success).toBe(true);
    }
  });
});

describe('tuneAnswersForPrompt', () => {
  it('pairs each cleaned answer with its topic, in question order, dropping skipped and filler-only ones', () => {
    expect(
      tuneAnswersForPrompt('companionPersonality', { avoid: 'No jargon.', humour: 'um', tone: 'Be warm' }),
    ).toEqual([
      { topic: 'the tone to take', answer: 'warm' },
      { topic: 'what to avoid', answer: 'jargon' },
    ]);
  });

  it('agrees with the template on what was said', () => {
    const answers = { name: 'Call me Bilo', updates: 'uh' };
    expect(tuneAnswersForPrompt('companionAboutUser', answers)).toHaveLength(1);
    expect(buildPersonaFromAnswers('companionAboutUser', answers).text).toBe('Call me Bilo.');
  });
});

describe('classifyTuneReply', () => {
  it.each<[string, CompanionTuneReplyKind]>([
    ['cancel', 'cancel'],
    ['Cancel.', 'cancel'],
    ['okay, never mind', 'cancel'],
    ['Stop', 'cancel'],
    ['forget it, thanks', 'cancel'],
    ['start over', 'startOver'],
    ["Let's start again.", 'startOver'],
    ['from the top please', 'startOver'],
    ['skip', 'skip'],
    ['Skip that one.', 'skip'],
    ['next question', 'skip'],
    ["I don't know", 'skip'],
    ['I don’t know', 'skip'],
    ['nothing really', 'skip'],
    ['', 'skip'],
    ['yes', 'yes'],
    ['Yeah, go on.', 'yes'],
    ["Nope, that's fine.", 'no'],
    ['Sure.', 'yes'],
    ['read it all', 'yes'],
    ['no', 'no'],
    ['Nah.', 'no'],
    ['just the summary', 'no'],
    ['warm and a bit dry', 'answer'],
    ["don't cancel my meetings", 'answer'],
    ['skip the small talk', 'answer'],
    ['stop being so formal', 'answer'],
  ])('%j → %s', (text, kind) => {
    expect(classifyTuneReply(text)).toBe(kind);
  });
});

describe('CompanionPersonaRequestSchema', () => {
  it('takes an interview with at least one answer', () => {
    expect(
      CompanionPersonaRequestSchema.safeParse({
        mode: 'interview',
        target: 'companionPersonality',
        answers: [{ topic: 'the tone to take', answer: 'dry' }],
        current: '',
      }).success,
    ).toBe(true);
    expect(
      CompanionPersonaRequestSchema.safeParse({
        mode: 'interview',
        target: 'companionPersonality',
        answers: [],
        current: '',
      }).success,
    ).toBe(false);
  });

  it('takes a tweak with an instruction, and trims it', () => {
    const parsed = CompanionPersonaRequestSchema.parse({
      mode: 'tweak',
      target: 'companionPersonality',
      instruction: '  be more sarcastic ',
      current: 'Tone: dry.',
    });
    expect(parsed).toMatchObject({ instruction: 'be more sarcastic' });
    expect(
      CompanionPersonaRequestSchema.safeParse({
        mode: 'tweak',
        target: 'companionPersonality',
        instruction: '   ',
        current: '',
      }).success,
    ).toBe(false);
  });

  it('refuses any target but the two tuned fields', () => {
    expect(
      CompanionPersonaRequestSchema.safeParse({
        mode: 'tweak',
        target: 'companionNames',
        instruction: 'answer to Nova',
        current: '',
      }).success,
    ).toBe(false);
  });
});

describe("parseAskReply — 'persona' replies", () => {
  const text = 'Keep answers short and dry. Skip the jargon.';
  const summary = 'Short, dry answers, no jargon.';

  it('reads a bare {text, summary} pair, speaking the summary', () => {
    expect(parseAskReply(JSON.stringify({ text, summary }), 'persona')).toEqual({
      say: summary,
      persona: { text, summary },
    });
  });

  it('reads one wrapped as {persona: …}, fenced, with prose around it', () => {
    const stdout = `Here you go:\n\`\`\`json\n${JSON.stringify({ say: 'x', persona: { text, summary } })}\n\`\`\`\nDone.`;
    expect(parseAskReply(stdout, 'persona')).toEqual({ say: summary, persona: { text, summary } });
  });

  it('trims both fields', () => {
    expect(parseAskReply(JSON.stringify({ text: `  ${text}\n`, summary: ` ${summary} ` }), 'persona')?.persona).toEqual({
      text,
      summary,
    });
  });

  it.each([
    ['text over 4000 characters', { text: 'x'.repeat(COMPANION_PERSONA_TEXT_MAX + 1), summary }],
    ['a summary over 200 characters', { text, summary: 'x'.repeat(COMPANION_PERSONA_SUMMARY_MAX + 1) }],
    ['no summary', { text }],
    ['an empty text', { text: '   ', summary }],
    ['the router shape', { say: 'Okay.', intent: { kind: 'help' } }],
  ])('drops %s', (_label, value) => {
    expect(parseAskReply(JSON.stringify(value), 'persona')).toBeNull();
  });

  it('drops garbage', () => {
    expect(parseAskReply('I would describe you as dry.', 'persona')).toBeNull();
  });

  it("never lets a router reply carry persona text — it is stripped, not trusted", () => {
    const reply = parseAskReply(JSON.stringify({ say: 'Done.', persona: { text, summary } }));
    expect(reply).toEqual({ say: 'Done.' });
    expect(parseAskReply(JSON.stringify({ say: 'Done.', persona: { text, summary } }), 'summarise')).toEqual({
      say: 'Done.',
    });
  });

  it("does not read a persona pair as a router reply — there is no `say`", () => {
    expect(parseAskReply(JSON.stringify({ text, summary }))).toBeNull();
  });
});

describe('matchTunePhrase', () => {
  it.each([
    "Let's change your personality.",
    'tune yourself',
    'Tune your self.',
    'June yourself',
    'okay, could you tune yourself please',
    'I want to change your personality',
    'can we work on your personality',
    'update the companion\'s personality',
    'set up your personality',
    'Customise yourself',
    'personality interview',
    'give yourself a new personality',
    'change how you talk',
  ])('%j → personality', (text) => {
    expect(matchTunePhrase(text)).toBe('companionPersonality');
  });

  it.each([
    'Let me tell you about me.',
    'let me tell you about myself',
    "I'd like to tell you a bit about myself",
    'let me tell you who I am',
    'update my about me',
    'Change the About-me section.',
    'update what you know about me',
    'get to know me better',
    'interview me',
  ])('%j → About me', (text) => {
    expect(matchTunePhrase(text)).toBe('companionAboutUser');
  });

  it.each([
    'your personality is great',
    'what is your personality',
    'tell me about yourself',
    'tune the build',
    'refine your personality',
    'let me tell you about the bug in the parser',
    'my personality is sunny',
  ])('%j → nothing', (text) => {
    expect(matchTunePhrase(text)).toBeNull();
  });
});

describe('matchTweakPhrase', () => {
  it.each([
    ['Be more sarcastic.', 'be more sarcastic'],
    ['be a bit less formal please', 'be a bit less formal'],
    ['Be way more to the point', 'be way more to the point'],
    ['sound less robotic', 'sound less robotic'],
    ['be funnier', 'be funnier'],
    ['Talk less.', 'talk less'],
    ['say a lot less', 'say a lot less'],
    ['speak more plainly', 'speak more plainly'],
    ['Stop being so formal', 'stop being so formal'],
    ["don't be so chirpy", "don't be so chirpy"],
    ['Don’t be so chirpy', "don't be so chirpy"],
    ['stop apologising so much', 'stop apologising so much'],
    ['no jargon', 'no jargon'],
    ['fewer jokes', 'fewer jokes'],
    ['tone it down', 'tone it down'],
    ['keep it short', 'keep it short'],
    ['could you be more concise', 'be more concise'],
  ])('%j → %j', (text, instruction) => {
    expect(matchTweakPhrase(text)).toBe(instruction);
  });

  it.each([
    "don't call me boss",
    'stop calling me boss',
    'call me boss',
    'be quieter',
    'be a bit louder',
    'be less loud',
    'be quiet',
    'stop',
    'stop talking out loud',
    'talk more about the release',
    'be more careful with the push to main tonight',
    'push',
    'more detail',
    'start a swarm',
    'no music',
  ])('%j → nothing — another intent, or the router, keeps it', (text) => {
    expect(matchTweakPhrase(text)).toBeNull();
  });

  it('never matches what an interview starts with', () => {
    for (const text of ['tune yourself', 'let me tell you about me', "let's change your personality"]) {
      expect(matchTweakPhrase(text)).toBeNull();
    }
  });
});
