import { describe, expect, it } from 'vitest';

import {
  COMPANION_INTENT_SETTING_KEYS,
  COMPANION_PAGE_ONLY_SETTING_KEYS,
  COMPANION_SETTING_KEYS,
  COMPANION_SETTING_SPECS,
  COMPANION_SETTING_TIERS,
  CompanionIntentSchema,
  companionSettingReadBack,
  companionSettingReadBacks,
  companionSettingsVocabulary,
  describeCompanionSettingValue,
  parseAskReply,
  parseIntent,
  type CompanionVocabulary,
} from './companion';

/**
 * Phase 109 Theme C — the `setting` intent, its grammar, its schema and the
 * router's half — and Theme E's `undoSetting`.
 */

const vocabulary: CompanionVocabulary = {
  views: [
    { id: 'graph', label: 'Commit Graph', keywords: 'git history commits branches log' },
    { id: 'browser', label: 'Browser', keywords: 'browser web page url site' },
    { id: 'tasks', label: 'Tasks', keywords: 'tasks issues bugs tracker board' },
  ],
  settingsPages: [
    { id: 'companion', label: 'Companion' },
    { id: 'gitSafety', label: 'Git Safety' },
  ],
  commands: [
    { id: 'sync.push', label: 'Push', group: 'sync', access: 'confirm' },
    { id: 'sync.fetch', label: 'Fetch', group: 'sync', access: 'direct' },
    { id: 'terminal.toggle', label: 'Toggle Terminal', group: 'terminal', access: 'direct' },
  ],
  skills: [{ id: 'execAdhoc', label: 'Adhoc Task', hint: 'Build a one-off task.' }],
  repos: ['bilo-mono', 'graph'],
};

const parse = (text: string) => parseIntent(text, vocabulary);

describe('the keys a setting intent may name', () => {
  it('is exactly the non-never tier', () => {
    const nonNever = COMPANION_SETTING_KEYS.filter((key) => COMPANION_SETTING_TIERS[key] !== 'never');
    expect([...COMPANION_INTENT_SETTING_KEYS].sort()).toEqual([...nonNever].sort());
  });

  it('leaves the never tier to pageOnlySetting', () => {
    const never = COMPANION_SETTING_KEYS.filter((key) => COMPANION_SETTING_TIERS[key] === 'never');
    expect([...COMPANION_PAGE_ONLY_SETTING_KEYS].sort()).toEqual([...never].sort());
  });
});

describe('parseIntent — settings phrases (Theme C)', () => {
  it.each([
    // voice
    ['use voice Bella', { kind: 'setting', key: 'companionVoices.local', value: 'Bella', op: 'match' }],
    ['switch to Bella', { kind: 'setting', key: 'companionVoices.local', value: 'Bella', op: 'match' }],
    ['change your voice to Emma', { kind: 'setting', key: 'companionVoices.local', value: 'Emma', op: 'match' }],
    ["use Bella's voice", { kind: 'setting', key: 'companionVoices.local', value: 'Bella', op: 'match' }],
    ['use the British Emma voice', { kind: 'setting', key: 'companionVoices.local', value: 'British Emma', op: 'match' }],
    ['use the default voice', { kind: 'setting', key: 'companionVoices.local', value: null }],
    ['use the system voice Samantha', { kind: 'setting', key: 'companionVoices.system', value: 'Samantha', op: 'match' }],
    ['use voice Samantha', { kind: 'setting', key: 'companionVoices.system', value: 'Samantha', op: 'match' }],
    // volume
    ['volume 50', { kind: 'setting', key: 'companionVolume', value: 0.5 }],
    ['set the volume to 30 percent', { kind: 'setting', key: 'companionVolume', value: 0.3 }],
    ['volume max', { kind: 'setting', key: 'companionVolume', value: 1 }],
    ['louder', { kind: 'setting', key: 'companionVolume', value: 0.1, op: 'step' }],
    ['a bit quieter', { kind: 'setting', key: 'companionVolume', value: -0.1, op: 'step' }],
    ['turn the volume up', { kind: 'setting', key: 'companionVolume', value: 0.1, op: 'step' }],
    ['turn it down', { kind: 'setting', key: 'companionVolume', value: -0.1, op: 'step' }],
    // what it calls you
    ['call me boss', { kind: 'setting', key: 'companionHonorifics', value: 'boss', op: 'add' }],
    ['call me Ada Lovelace', { kind: 'setting', key: 'companionHonorifics', value: 'Ada Lovelace', op: 'add' }],
    ['stop calling me boss', { kind: 'setting', key: 'companionHonorifics', value: 'boss', op: 'remove' }],
    ["don't call me sir", { kind: 'setting', key: 'companionHonorifics', value: 'sir', op: 'remove' }],
    // names
    ["I'll call you Nova", { kind: 'setting', key: 'companionNames', value: 'Nova', op: 'add' }],
    ['answer to Nova', { kind: 'setting', key: 'companionNames', value: 'Nova', op: 'add' }],
    ['your name is Jarvis', { kind: 'setting', key: 'companionNames', value: 'Jarvis', op: 'add' }],
    ['stop answering to Nova', { kind: 'setting', key: 'companionNames', value: 'Nova', op: 'remove' }],
    // speak aloud
    ['stop talking out loud', { kind: 'setting', key: 'companionSpeakAloud', value: false }],
    ['mute yourself', { kind: 'setting', key: 'companionSpeakAloud', value: false }],
    ['speak out loud', { kind: 'setting', key: 'companionSpeakAloud', value: true }],
    ['start talking again', { kind: 'setting', key: 'companionSpeakAloud', value: true }],
    // elevator music
    ['turn elevator music off', { kind: 'setting', key: 'companionMusicOffer', value: false }],
    ['turn on the elevator music', { kind: 'setting', key: 'companionMusicOffer', value: true }],
    ['stop offering music', { kind: 'setting', key: 'companionMusicOffer', value: false }],
    // mic mode
    ['push to talk', { kind: 'setting', key: 'companionMicMode', value: 'push' }],
    ['toggle the mic', { kind: 'setting', key: 'companionMicMode', value: 'toggle' }],
    ['use tap to toggle', { kind: 'setting', key: 'companionMicMode', value: 'toggle' }],
    // conversation mode
    ['conversation mode on', { kind: 'setting', key: 'voiceConversation', value: true }],
    ['turn off conversation mode', { kind: 'setting', key: 'voiceConversation', value: false }],
    ['exit conversation mode', { kind: 'setting', key: 'voiceConversation', value: false }],
    ['only listen for your name', { kind: 'setting', key: 'voiceConversationTrigger', value: 'wake' }],
    ['listen to everything', { kind: 'setting', key: 'voiceConversationTrigger', value: 'always' }],
  ])('%j → %j', (text, intent) => {
    expect(parse(text)).toEqual(intent);
  });

  // What whisper-tiny actually writes: lower case, a trailing full stop, a
  // stray comma, a curly apostrophe, numbers spelled out, a name off by a letter.
  it.each([
    ['use voice bela.', { kind: 'setting', key: 'companionVoices.local', value: 'bela', op: 'match' }],
    ['Use voice Hart.', { kind: 'setting', key: 'companionVoices.local', value: 'Hart', op: 'match' }],
    ['switch to isa bella', { kind: 'setting', key: 'companionVoices.local', value: 'isa bella', op: 'match' }],
    ['Okay, call me boss.', { kind: 'setting', key: 'companionHonorifics', value: 'boss', op: 'add' }],
    ['call me boss from now on', { kind: 'setting', key: 'companionHonorifics', value: 'boss', op: 'add' }],
    ['ill call you nova', { kind: 'setting', key: 'companionNames', value: 'nova', op: 'add' }],
    ['I’ll call you, Nova.', { kind: 'setting', key: 'companionNames', value: 'Nova', op: 'add' }],
    ['Volume fifty.', { kind: 'setting', key: 'companionVolume', value: 0.5 }],
    ['volume seventy five percent', { kind: 'setting', key: 'companionVolume', value: 0.75 }],
    ['volume a hundred', { kind: 'setting', key: 'companionVolume', value: 1 }],
    ['Conversation mode, on.', { kind: 'setting', key: 'voiceConversation', value: true }],
    ['Push-to-talk.', { kind: 'setting', key: 'companionMicMode', value: 'push' }],
    ['please speak out loud again', { kind: 'setting', key: 'companionSpeakAloud', value: true }],
    ['Louder please.', { kind: 'setting', key: 'companionVolume', value: 0.1, op: 'step' }],
  ])('whisper-style %j → %j', (text, intent) => {
    expect(parse(text)).toEqual(intent);
  });

  it.each([
    ['turn yourself off', 'companionEnabled'],
    ['disable yourself', 'companionEnabled'],
    ['switch to web speech', 'companionSttEngine'],
    ['use the browser speech recognition', 'companionSttEngine'],
    ['use deepgram', 'companionSttProvider'],
    ['switch to OpenAI whisper', 'companionSttProvider'],
    ['turn on hands-free', 'companionHandsFree'],
    ['hands free on', 'companionHandsFree'],
  ])('a never-tier request %j is pageOnlySetting(%s), never a setting', (text, key) => {
    expect(parse(text)).toEqual({ kind: 'pageOnlySetting', key });
  });

  it.each(['undo that', 'Undo that.', 'put it back', 'change it back', 'okay, undo it', 'revert that'])(
    '%j is undoSetting',
    (text) => {
      expect(parse(text)).toEqual({ kind: 'undoSetting' });
    },
  );

  it('recognises none of it without a vocabulary — the pre-Phase-81 grammar is untouched', () => {
    expect(parseIntent('use voice Bella')).toEqual({ kind: 'freeform', text: 'use voice Bella' });
    expect(parseIntent('undo that')).toEqual({ kind: 'freeform', text: 'undo that' });
    expect(parseIntent('turn elevator music off')).toEqual({ kind: 'music', on: false });
  });
});

describe('parseIntent — the collision set (Theme C)', () => {
  it.each([
    // the existing control words keep their meaning
    ['stop', { kind: 'stop' }],
    ['be quiet', { kind: 'stop' }],
    ['no music', { kind: 'music', on: false }],
    ['stop the music', { kind: 'music', on: false }],
    ['put some music on', { kind: 'music', on: true }],
    // skills keep precedence
    ['start a swarm', { kind: 'command', id: 'execSwarm' }],
    // navigation and repo switching are not shadowed
    ['switch to the graph', { kind: 'switchRepo', name: 'graph' }],
    ['switch to bilo-mono', { kind: 'switchRepo', name: 'bilo-mono' }],
    ['take me to the browser', { kind: 'navigate', view: 'browser' }],
    ['open settings, companion', { kind: 'navigate', view: 'settings', page: 'companion' }],
    ['switch to jabberwocky', { kind: 'switchRepo', name: 'jabberwocky' }],
    // "push" alone is still the palette's push
    ['push', { kind: 'run', id: 'sync.push' }],
    ['toggle the terminal', { kind: 'run', id: 'terminal.toggle' }],
  ])('%j stays %j', (text, intent) => {
    expect(parse(text)).toEqual(intent);
  });

  it.each([
    'call me back',
    'call me when the build is done',
    'answer to the question',
    'call me later',
    'use a british voice',
    'try some voices',
  ])('%j is not a setting — the router gets it', (text) => {
    const intent = parse(text);
    expect(intent.kind).not.toBe('setting');
    expect(intent.kind).not.toBe('pageOnlySetting');
  });
});

describe('CompanionIntentSchema — the setting arm', () => {
  const valid = (value: unknown) => CompanionIntentSchema.safeParse(value).success;

  it('accepts a value its key takes', () => {
    expect(valid({ kind: 'setting', key: 'companionVolume', value: 0.4 })).toBe(true);
    expect(valid({ kind: 'setting', key: 'companionVoices.local', value: 'af_bella' })).toBe(true);
    expect(valid({ kind: 'setting', key: 'companionVoices.local', value: null })).toBe(true);
    expect(valid({ kind: 'setting', key: 'companionMicMode', value: 'toggle' })).toBe(true);
    expect(valid({ kind: 'setting', key: 'companionNames', value: 'Nova', op: 'add' })).toBe(true);
    expect(valid({ kind: 'setting', key: 'companionVolume', value: -0.1, op: 'step' })).toBe(true);
    expect(valid({ kind: 'setting', key: 'companionVoices.system', value: 'Samantha', op: 'match' })).toBe(true);
  });

  it('refuses an out-of-range number rather than clamping it', () => {
    expect(valid({ kind: 'setting', key: 'companionVolume', value: 7 })).toBe(false);
    expect(valid({ kind: 'setting', key: 'companionVolume', value: -0.2 })).toBe(false);
  });

  it('refuses a value of the wrong kind, and an op the key does not take', () => {
    expect(valid({ kind: 'setting', key: 'companionMicMode', value: 'loud' })).toBe(false);
    expect(valid({ kind: 'setting', key: 'companionVoices.local', value: 'af_nobody' })).toBe(false);
    expect(valid({ kind: 'setting', key: 'companionSpeakAloud', value: 'yes', op: 'add' })).toBe(false);
    expect(valid({ kind: 'setting', key: 'companionVolume', value: 'Bella', op: 'match' })).toBe(false);
    expect(valid({ kind: 'setting', key: 'companionVolume', value: 0, op: 'step' })).toBe(false);
    expect(valid({ kind: 'setting', key: 'companionNames', value: '', op: 'add' })).toBe(false);
  });

  it('cannot express a never-tier key at all', () => {
    for (const key of COMPANION_PAGE_ONLY_SETTING_KEYS) {
      expect(valid({ kind: 'setting', key, value: false })).toBe(false);
    }
  });
});

describe('parseAskReply — setting replies (Theme C router fixtures)', () => {
  it('reads a valid setting reply', () => {
    expect(
      parseAskReply('{"say":"Switching to Bella.","intent":{"kind":"setting","key":"companionVoices.local","value":"af_bella"}}'),
    ).toEqual({ say: 'Switching to Bella.', intent: { kind: 'setting', key: 'companionVoices.local', value: 'af_bella' } });
  });

  it('reads an undoSetting reply', () => {
    expect(parseAskReply('{"say":"Putting it back.","intent":{"kind":"undoSetting"}}')).toEqual({
      say: 'Putting it back.',
      intent: { kind: 'undoSetting' },
    });
  });

  it('drops an unknown key', () => {
    expect(parseAskReply('{"say":"ok","intent":{"kind":"setting","key":"companionColour","value":"red"}}')).toBeNull();
  });

  it('drops an out-of-range value', () => {
    expect(parseAskReply('{"say":"ok","intent":{"kind":"setting","key":"companionVolume","value":70}}')).toBeNull();
  });

  it('drops a never-tier key', () => {
    expect(parseAskReply('{"say":"ok","intent":{"kind":"setting","key":"companionEnabled","value":false}}')).toBeNull();
    expect(parseAskReply('{"say":"ok","intent":{"kind":"setting","key":"companionSttEngine","value":"webSpeech"}}')).toBeNull();
  });
});

describe('companionSettingsVocabulary', () => {
  const rows = companionSettingsVocabulary();
  const keys = rows.map((row) => row.key);

  it('lists no never-tier key, and leaves profiles and the free text to their own themes', () => {
    for (const key of [...COMPANION_PAGE_ONLY_SETTING_KEYS, 'companionPersonality', 'companionAboutUser', 'companionActiveProfile']) {
      expect(keys).not.toContain(key);
    }
    expect(keys).toEqual(
      expect.arrayContaining(['companionVoices.local', 'companionVolume', 'companionNames', 'companionSpeakAloud']),
    );
  });

  it("carries each key's tier and describes its values", () => {
    const names = rows.find((row) => row.key === 'companionNames');
    expect(names?.tier).toBe('confirm');
    expect(names?.values).toContain('"op":"add"');
    const voice = rows.find((row) => row.key === 'companionVoices.local');
    expect(voice?.tier).toBe('direct');
    expect(voice?.values).toContain('af_bella (Bella)');
  });

  it("every row's example is a phrase the grammar itself turns into a setting for that key", () => {
    for (const row of rows) {
      const intent = parse(row.example);
      expect(intent.kind, row.example).toBe('setting');
      expect(intent.kind === 'setting' ? intent.key : null, row.example).toBe(row.key);
    }
  });
});

describe('read-backs (Theme E)', () => {
  it("lead with the spec's own sentence and offer distinct variants", () => {
    for (const key of COMPANION_SETTING_KEYS) {
      const spec = COMPANION_SETTING_SPECS[key];
      const sample: unknown =
        spec.value.kind === 'bool'
          ? true
          : spec.value.kind === 'number'
            ? 0.5
            : spec.value.kind === 'list'
              ? ['Nova']
              : spec.value.kind === 'enum'
                ? spec.value.values[0]
                : null;
      const pool = companionSettingReadBacks(key, sample);
      expect(pool[0]).toBe(companionSettingReadBack(key, sample));
      expect(new Set(pool).size).toBe(pool.length);
    }
  });

  it('varies the voice, volume and honorific read-backs', () => {
    expect(companionSettingReadBacks('companionVoices.local', 'af_bella').length).toBeGreaterThan(2);
    expect(companionSettingReadBacks('companionVolume', 0.5)).toContain('Set to 50 percent.');
    expect(companionSettingReadBacks('companionHonorifics', ['sir', 'boss'])).toContain('Sure thing, boss.');
  });

  it('describes a value in a few words', () => {
    expect(describeCompanionSettingValue('companionVoices.local', 'af_bella')).toBe('Bella');
    expect(describeCompanionSettingValue('companionVoices.local', null)).toBe('Heart');
    expect(describeCompanionSettingValue('companionVolume', 0.3)).toBe('30%');
    expect(describeCompanionSettingValue('companionMicMode', 'push')).toBe('push to talk');
    expect(describeCompanionSettingValue('companionSpeakAloud', false)).toBe('off');
    expect(describeCompanionSettingValue('companionHonorifics', [])).toBe('nothing');
  });
});
