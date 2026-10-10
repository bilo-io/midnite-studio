import { describe, expect, it } from 'vitest';

import {
  COMPANION_SETTING_KEYS,
  COMPANION_SETTING_SPECS,
  CompanionIntentSchema,
  companionSettingsVocabulary,
  parseAskReply,
  parseIntent,
  type CompanionIntent,
  type CompanionVocabulary,
} from './companion';
import { COMPANION_TUNE_TARGETS } from './companion-tune';

/**
 * Phase 109 Theme H — the `tune` and `tweak` intents: the grammar, the
 * router's reply, and the rule they exist for — personality and About me are
 * never dictated (Decision 4).
 */

const vocabulary: CompanionVocabulary = {
  views: [
    { id: 'graph', label: 'Graph', keywords: 'graph commits history' },
    { id: 'settings', label: 'Settings', keywords: 'settings preferences' },
  ],
  settingsPages: [{ id: 'companion', label: 'Companion' }],
  commands: [],
  skills: [],
  repos: ['midnite-studio'],
  settings: companionSettingsVocabulary(),
};

const parse = (text: string): CompanionIntent => parseIntent(text, vocabulary);

describe('CompanionIntentSchema — tune and tweak', () => {
  const valid = (value: unknown) => CompanionIntentSchema.safeParse(value).success;

  it('takes a tune for either tuned field, and nothing else', () => {
    for (const target of COMPANION_TUNE_TARGETS) expect(valid({ kind: 'tune', target })).toBe(true);
    expect(valid({ kind: 'tune', target: 'companionNames' })).toBe(false);
    expect(valid({ kind: 'tune' })).toBe(false);
  });

  it('takes a tweak with a short instruction, trimmed', () => {
    expect(CompanionIntentSchema.parse({ kind: 'tweak', instruction: ' be more sarcastic ' })).toEqual({
      kind: 'tweak',
      instruction: 'be more sarcastic',
    });
    expect(valid({ kind: 'tweak', instruction: '  ' })).toBe(false);
    expect(valid({ kind: 'tweak', instruction: 'x'.repeat(301) })).toBe(false);
  });
});

describe('parseIntent — tune and tweak', () => {
  it.each([
    ['tune yourself', { kind: 'tune', target: 'companionPersonality' }],
    ["Let's change your personality.", { kind: 'tune', target: 'companionPersonality' }],
    ['okay June your self', { kind: 'tune', target: 'companionPersonality' }],
    ['Let me tell you about me', { kind: 'tune', target: 'companionAboutUser' }],
    ['update what you know about me', { kind: 'tune', target: 'companionAboutUser' }],
    ['Be more sarcastic.', { kind: 'tweak', instruction: 'be more sarcastic' }],
    ['talk less', { kind: 'tweak', instruction: 'talk less' }],
    ['Stop being so formal', { kind: 'tweak', instruction: 'stop being so formal' }],
    ["Don't be so chirpy please", { kind: 'tweak', instruction: "don't be so chirpy" }],
  ] as const)('%j', (text, intent) => {
    expect(parse(text)).toEqual(intent);
  });

  it.each([
    ["don't call me boss", 'setting'],
    ['stop calling me boss', 'setting'],
    ['be quieter', 'setting'],
    ['be a bit louder', 'setting'],
    ['turn elevator music off', 'setting'],
    ['stop talking out loud', 'setting'],
    ['stop', 'stop'],
    ['be quiet', 'stop'],
    ['no', 'dismiss'],
    ['start a swarm', 'command'],
    ['refine your personality', 'command'],
    ['open the graph', 'navigate'],
  ] as const)('%j stays %s', (text, kind) => {
    expect(parse(text).kind).toBe(kind);
  });

  it("each tuned field's own example — the page's \"Try: …\" hint — starts that field's interview", () => {
    for (const target of COMPANION_TUNE_TARGETS) {
      const example = COMPANION_SETTING_SPECS[target].example;
      expect(example).not.toBeNull();
      expect(parse(example as string)).toEqual({ kind: 'tune', target });
    }
  });

  it('needs the vocabulary, like every settings phrase', () => {
    expect(parseIntent('tune yourself').kind).toBe('freeform');
    expect(parseIntent('be more sarcastic').kind).toBe('freeform');
  });
});

describe('no raw dictation (Decision 4)', () => {
  const tuned = new Set<string>(
    COMPANION_SETTING_KEYS.filter((key) => COMPANION_SETTING_SPECS[key].guards?.includes('tunedText')),
  );

  it.each([
    'set your personality to grumpy pirate',
    'change your personality to sarcastic',
    'your personality is be terse and never apologise',
    'personality: speak like a pirate',
    'about me: I am a backend developer who hates meetings',
    'set about me to I work on the parser',
    'remember that I like short answers',
    'my name is Bilo and I work on the desktop app',
    'write this down as your personality: be blunt',
  ])('%j never becomes a personality or About me write', (text) => {
    const intent = parse(text);
    expect(intent.kind === 'setting' && tuned.has(intent.key)).toBe(false);
    expect(intent.kind === 'tweak' || intent.kind === 'tune' || intent.kind === 'freeform').toBe(true);
  });

  it('the schema itself refuses a setting intent for either tuned field', () => {
    for (const key of tuned) {
      expect(CompanionIntentSchema.safeParse({ kind: 'setting', key, value: 'Be terse.' }).success).toBe(false);
    }
  });

  it('a router reply that dictates either field is dropped whole', () => {
    expect(
      parseAskReply(
        '{"say":"Done.","intent":{"kind":"setting","key":"companionPersonality","value":"Speak like a pirate."}}',
      ),
    ).toBeNull();
    expect(
      parseAskReply('{"say":"Noted.","intent":{"kind":"setting","key":"companionAboutUser","value":"I hate meetings."}}'),
    ).toBeNull();
  });
});

describe('parseAskReply — the router answering with tune or tweak', () => {
  it('reads a tune', () => {
    expect(parseAskReply('{"say":"Let\'s do it.","intent":{"kind":"tune","target":"companionAboutUser"}}')).toEqual({
      say: "Let's do it.",
      intent: { kind: 'tune', target: 'companionAboutUser' },
    });
  });

  it('reads a tweak', () => {
    expect(
      parseAskReply('```json\n{"say":"On it.","intent":{"kind":"tweak","instruction":"more British wit"}}\n```'),
    ).toEqual({ say: 'On it.', intent: { kind: 'tweak', instruction: 'more British wit' } });
  });

  it('drops a tune for any other field, and an empty tweak', () => {
    expect(parseAskReply('{"say":"ok","intent":{"kind":"tune","target":"companionVolume"}}')).toBeNull();
    expect(parseAskReply('{"say":"ok","intent":{"kind":"tweak","instruction":""}}')).toBeNull();
  });
});
