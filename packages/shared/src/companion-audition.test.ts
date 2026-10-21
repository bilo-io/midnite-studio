import { describe, expect, it } from 'vitest';

import {
  COMPANION_LOCAL_VOICES,
  CompanionIntentSchema,
  parseIntent,
  type CompanionVocabulary,
} from './companion';
import {
  auditionBatches,
  auditionLocalVoices,
  auditionSampleLine,
  auditionSystemVoices,
  describeAuditionFilter,
  matchAuditionPhrase,
  parseAuditionReply,
} from './companion-audition';

/** Phase 109 Theme F — the audition's grammar, its voice selection, and what a reply means. */

const vocabulary: CompanionVocabulary = { views: [], settingsPages: [], commands: [], skills: [], repos: [] };

describe('matchAuditionPhrase', () => {
  it.each([
    ['try some voices', {}],
    ['Audition British voices.', { accent: 'british' }],
    ['let me hear female voices', { gender: 'female' }],
    ['can I hear some British female voices please', { accent: 'british', gender: 'female' }],
    ['play me some American male voices', { accent: 'american', gender: 'male' }],
    ['try a different voice', {}],
    ["let's hear other men's voices", { gender: 'male' }],
    ['voice audition', {}],
    ['okay, show me voices', {}],
  ])('"%s" is an audition', (text, filter) => {
    expect(matchAuditionPhrase(text)).toEqual(filter);
  });

  it.each([
    'try voice Bella',
    "try Bella's voice",
    'use voice Bella',
    'play some music',
    'try the build again',
    'hear me out',
  ])('"%s" is not', (text) => {
    expect(matchAuditionPhrase(text)).toBeNull();
  });

  it('parseIntent recognises it behind the vocabulary gate, and the schema accepts it', () => {
    const intent = parseIntent('audition British voices', vocabulary);
    expect(intent).toEqual({ kind: 'audition', accent: 'british' });
    expect(CompanionIntentSchema.safeParse(intent).success).toBe(true);
    expect(parseIntent('audition British voices').kind).toBe('freeform');
  });

  it('leaves the voice-change phrases alone', () => {
    expect(parseIntent('try voice Bella', vocabulary)).toMatchObject({ kind: 'setting', key: 'companionVoices.local' });
  });

  it('describes the filter the way a sentence says it', () => {
    expect(describeAuditionFilter({})).toBe('');
    expect(describeAuditionFilter({ accent: 'british', gender: 'female' })).toBe('British female');
  });
});

describe('auditionLocalVoices', () => {
  it('filters by accent and gender, best grade first, never the current voice', () => {
    const british = auditionLocalVoices(COMPANION_LOCAL_VOICES, { accent: 'british', gender: 'female' }, 'bf_emma');
    expect(british.map((voice) => voice.name)).toEqual(['Isabella', 'Alice', 'Lily']);
  });

  it('alternates female and male when no gender is asked for', () => {
    const all = auditionLocalVoices(COMPANION_LOCAL_VOICES, {}, 'af_heart');
    expect(all).toHaveLength(COMPANION_LOCAL_VOICES.length - 1);
    expect(all.slice(0, 4).map((voice) => voice.name)).toEqual(['Bella', 'Fenrir', 'Nicole', 'Michael']);
    expect(all.some((voice) => voice.value === 'af_heart')).toBe(false);
  });

  it('is deterministic', () => {
    expect(auditionLocalVoices(COMPANION_LOCAL_VOICES, { accent: 'american' }, null)).toEqual(
      auditionLocalVoices(COMPANION_LOCAL_VOICES, { accent: 'american' }, null),
    );
  });
});

describe('auditionSystemVoices', () => {
  const voices = [
    { uri: 'daniel', name: 'Daniel', lang: 'en-GB' },
    { uri: 'samantha', name: 'Samantha', lang: 'en-US' },
    { uri: 'samantha-2', name: 'Samantha', lang: 'en-US' },
    { uri: 'thomas', name: 'Thomas', lang: 'fr-FR' },
    { uri: 'kate', name: 'Kate', lang: 'en_GB' },
  ];

  it('keeps English voices of the accent, each name once, never the current one', () => {
    expect(auditionSystemVoices(voices, { accent: 'british' }, 'daniel')).toEqual([{ value: 'kate', name: 'Kate' }]);
    expect(auditionSystemVoices(voices, {}, null).map((voice) => voice.name)).toEqual(['Daniel', 'Samantha', 'Kate']);
  });

  it('falls back to every English voice when none has the accent, and ignores gender', () => {
    const us = [{ uri: 'samantha', name: 'Samantha', lang: 'en-US' }];
    expect(auditionSystemVoices(us, { accent: 'british', gender: 'male' }, null)).toEqual([
      { value: 'samantha', name: 'Samantha' },
    ]);
  });
});

describe('auditionBatches', () => {
  it('cuts the pool into threes and fours, as evenly as it divides', () => {
    const sizes = (count: number) => auditionBatches(Array.from({ length: count }, (_, index) => index)).map((b) => b.length);
    expect(sizes(27)).toEqual([4, 4, 4, 4, 4, 4, 3]);
    expect(sizes(9)).toEqual([3, 3, 3]);
    expect(sizes(4)).toEqual([4]);
    expect(sizes(2)).toEqual([2]);
    expect(sizes(0)).toEqual([]);
  });

  it('numbers each sample in a fixed line', () => {
    expect(auditionSampleLine(2, 'Bella')).toBe("Hi, I'm number two — Bella.");
  });
});

describe('parseAuditionReply', () => {
  it.each([
    ['number two', { kind: 'pick', number: 2 }],
    ['two', { kind: 'pick', number: 2 }],
    ['Too.', { kind: 'pick', number: 2 }],
    ['the third one', { kind: 'pick', number: 3 }],
    ["I'll take number 4", { kind: 'pick', number: 4 }],
    ['one', { kind: 'pick', number: 1 }],
    ['number five', { kind: 'pick', number: 5 }],
    ['that one', { kind: 'that' }],
    ["that's the one", { kind: 'that' }],
    ['next', { kind: 'next' }],
    ['some other ones', { kind: 'next' }],
    ['again', { kind: 'again' }],
    ['play them again', { kind: 'again' }],
    ['none', { kind: 'end' }],
    ['stop', { kind: 'end' }],
    ['none of them', { kind: 'end' }],
    ['keep the current one', { kind: 'end' }],
  ])('"%s"', (text, reply) => {
    expect(parseAuditionReply(text)).toEqual(reply);
  });

  it.each(['open the graph', 'what time is it', ''])('"%s" is not a reply', (text) => {
    expect(parseAuditionReply(text)).toBeNull();
  });
});
