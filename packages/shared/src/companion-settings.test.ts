import { describe, expect, it } from 'vitest';

import {
  COMPANION_LOCAL_VOICES,
  COMPANION_SETTING_KEYS,
  COMPANION_SETTING_SPECS,
  COMPANION_SETTING_TIERS,
  CompanionProfileSchema,
  CompanionSettingsSchema,
  checkCompanionGuard,
  companionSettingReadBack,
  companionSettingTier,
  editDistance,
  matchVoice,
  parseCompanionSettingValue,
  type CompanionAccess,
  type CompanionSettingKey,
} from './companion';

/**
 * Phase 109 Theme A — the companion settings list: the slice schema, the spec
 * table, the guards and `matchVoice`. A file of its own for the reason
 * `companion-voice.test.ts` gives: later themes of this phase are built in
 * parallel PRs, and one shared test file is the cheapest merge conflict.
 */

describe('COMPANION_SETTING_SPECS', () => {
  it('has exactly one spec per settable key, keyed by its own key', () => {
    expect(Object.keys(COMPANION_SETTING_SPECS).sort()).toEqual([...COMPANION_SETTING_KEYS].sort());
    for (const key of COMPANION_SETTING_KEYS) {
      expect(COMPANION_SETTING_SPECS[key].key).toBe(key);
      expect(COMPANION_SETTING_SPECS[key].aliases.length).toBeGreaterThan(0);
      expect(COMPANION_SETTING_SPECS[key].tier).toBe(COMPANION_SETTING_TIERS[key]);
    }
  });

  it('covers every key of the slice schema except the profile list, with voices split per engine', () => {
    const sliceKeys = Object.keys(CompanionSettingsSchema.shape)
      .filter((key) => key !== 'companionProfiles')
      .flatMap((key) => (key === 'companionVoices' ? ['companionVoices.local', 'companionVoices.system'] : [key]));
    expect(sliceKeys.sort()).toEqual([...COMPANION_SETTING_KEYS].sort());
  });

  // Decision 2, "guarded" — the table as settled in the brainstorm.
  const EXPECTED_TIERS: Record<CompanionSettingKey, CompanionAccess> = {
    companionEnabled: 'never',
    companionSttEngine: 'never',
    companionSttProvider: 'never',
    companionHandsFree: 'never',
    companionSpeakAloud: 'confirm',
    companionNames: 'confirm',
    companionMicMode: 'confirm',
    voiceConversation: 'confirm',
    voiceConversationTrigger: 'confirm',
    companionPersonality: 'confirm',
    companionAboutUser: 'confirm',
    'companionVoices.local': 'direct',
    'companionVoices.system': 'direct',
    companionVolume: 'direct',
    companionHonorifics: 'direct',
    companionMusicOffer: 'direct',
    companionActiveProfile: 'direct',
  };

  it.each(Object.entries(EXPECTED_TIERS))('puts %s in the %s tier', (key, tier) => {
    expect(COMPANION_SETTING_SPECS[key as CompanionSettingKey].tier).toBe(tier);
  });

  it('confirms speech going off, but not coming back on', () => {
    expect(companionSettingTier('companionSpeakAloud', false)).toBe('confirm');
    expect(companionSettingTier('companionSpeakAloud', true)).toBe('direct');
    expect(companionSettingTier('companionNames', ['Nova'])).toBe('confirm');
    expect(companionSettingTier('companionEnabled', true)).toBe('never');
  });

  it('gives an example phrase to every key the companion can be asked to change, and none to never-tier keys', () => {
    for (const key of COMPANION_SETTING_KEYS) {
      const spec = COMPANION_SETTING_SPECS[key];
      if (spec.tier === 'never') expect(spec.example).toBeNull();
      else expect(spec.example).toMatch(/\S/);
    }
  });

  it('reads a change back as a sentence', () => {
    expect(companionSettingReadBack('companionVoices.local', 'af_bella')).toBe('This is Bella now.');
    expect(companionSettingReadBack('companionVoices.local', null)).toBe('This is Heart now.');
    expect(companionSettingReadBack('companionVolume', 0.55)).toBe('Volume 55 percent.');
    expect(companionSettingReadBack('companionNames', ['Nova', 'Companion'])).toBe(
      "I'll answer to Nova and Companion.",
    );
    expect(companionSettingReadBack('companionHonorifics', [])).toMatch(/stop calling you/);
    expect(companionSettingReadBack('companionMicMode', 'push')).toBe('The mic is push to talk now.');
  });
});

describe('CompanionSettingsSchema', () => {
  it('fills every key from its fresh-install default', () => {
    expect(CompanionSettingsSchema.parse({})).toEqual({
      companionEnabled: false,
      companionHandsFree: false,
      companionHonorifics: [],
      companionNames: ['Companion'],
      companionPersonality: '',
      companionAboutUser: '',
      companionVoices: { system: null, local: null },
      companionSpeakAloud: true,
      companionMusicOffer: true,
      companionVolume: 0.7,
      companionMicMode: 'push',
      companionSttEngine: 'server',
      companionSttProvider: null,
      voiceConversation: false,
      voiceConversationTrigger: 'always',
      companionProfiles: [],
      companionActiveProfile: null,
    });
  });

  it('clamps volume, trims free text and refuses an empty names list', () => {
    expect(CompanionSettingsSchema.parse({ companionVolume: 1.4 }).companionVolume).toBe(1);
    expect(CompanionSettingsSchema.parse({ companionVolume: -1 }).companionVolume).toBe(0);
    expect(CompanionSettingsSchema.parse({ companionPersonality: '  dry  ' }).companionPersonality).toBe('dry');
    expect(CompanionSettingsSchema.safeParse({ companionNames: [] }).success).toBe(false);
    expect(CompanionSettingsSchema.safeParse({ companionAboutUser: 'x'.repeat(4001) }).success).toBe(false);
  });

  it('maps a stored local voice the catalog no longer has to the default, rather than failing the slice', () => {
    expect(
      CompanionSettingsSchema.parse({ companionVoices: { system: null, local: 'af_retired' } }).companionVoices,
    ).toEqual({ system: null, local: null });
  });

  it('caps profiles at twenty', () => {
    const profile = {
      id: 'p1',
      name: 'Narrator',
      voices: { system: null, local: 'bm_george' },
      personality: '',
      honorifics: [],
      createdAt: '2026-10-10T09:00:00.000Z',
    };
    expect(CompanionProfileSchema.parse(profile)).toEqual(profile);
    const many = Array.from({ length: 21 }, (_, index) => ({ ...profile, id: `p${index}` }));
    expect(CompanionSettingsSchema.safeParse({ companionProfiles: many }).success).toBe(false);
  });
});

describe('parseCompanionSettingValue', () => {
  it('accepts a known voice and refuses an unknown one, strictly', () => {
    expect(parseCompanionSettingValue('companionVoices.local', 'af_bella')).toEqual({ ok: true, value: 'af_bella' });
    expect(parseCompanionSettingValue('companionVoices.local', null)).toEqual({ ok: true, value: null });
    expect(parseCompanionSettingValue('companionVoices.local', 'af_retired').ok).toBe(false);
  });

  it('refuses the wrong type and clamps a number', () => {
    expect(parseCompanionSettingValue('companionMusicOffer', 'yes').ok).toBe(false);
    expect(parseCompanionSettingValue('companionMicMode', 'hold').ok).toBe(false);
    expect(parseCompanionSettingValue('companionVolume', 3)).toEqual({ ok: true, value: 1 });
    expect(parseCompanionSettingValue('companionSttProvider', null)).toEqual({ ok: true, value: null });
  });
});

describe('checkCompanionGuard', () => {
  const names = COMPANION_SETTING_SPECS.companionNames;
  const speak = COMPANION_SETTING_SPECS.companionSpeakAloud;
  const personality = COMPANION_SETTING_SPECS.companionPersonality;

  it('lastName refuses to empty the names list, with a sentence to say', () => {
    const result = checkCompanionGuard(names, ['Nova'], [], { source: 'voice' });
    expect(result).toEqual({ ok: false, guard: 'lastName', reason: 'I need at least one name to answer to.' });
  });

  it('wakeWord reads a names change back before it applies', () => {
    expect(checkCompanionGuard(names, ['Companion'], ['Companion', 'Nova'], { source: 'voice' })).toEqual({
      ok: true,
      effect: 'readBackBeforeApply',
    });
    expect(checkCompanionGuard(names, ['Nova'], ['Nova'], { source: 'voice' })).toEqual({ ok: true });
  });

  it('muteLast reads back before speech goes off, and not when it comes back on', () => {
    expect(checkCompanionGuard(speak, true, false, { source: 'voice' })).toEqual({
      ok: true,
      effect: 'readBackBeforeApply',
    });
    expect(checkCompanionGuard(speak, false, true, { source: 'voice' })).toEqual({ ok: true });
  });

  it('tunedText refuses raw dictation from voice or an agent', () => {
    for (const source of ['voice', 'mcp'] as const) {
      const result = checkCompanionGuard(personality, '', 'Be sarcastic.', { source });
      expect(result.ok).toBe(false);
      expect(result.ok ? null : result.guard).toBe('tunedText');
    }
  });

  it('tunedText lets the page and a tuned change through', () => {
    expect(checkCompanionGuard(personality, '', 'Be sarcastic.', { source: 'page' })).toEqual({ ok: true });
    expect(checkCompanionGuard(personality, '', 'Be sarcastic.')).toEqual({ ok: true });
    expect(checkCompanionGuard(personality, '', 'Be sarcastic.', { source: 'voice', tuned: true })).toEqual({
      ok: true,
    });
  });

  it('passes a key with no guards untouched', () => {
    expect(checkCompanionGuard(COMPANION_SETTING_SPECS.companionVolume, 0.2, 0.9, { source: 'mcp' })).toEqual({
      ok: true,
    });
  });
});

describe('matchVoice', () => {
  const byId = (id: string) => COMPANION_LOCAL_VOICES.find((voice) => voice.id === id);

  it('gives every Kokoro voice its name and its accent-prefixed name', () => {
    expect(byId('bf_emma')?.spoken).toEqual(['Emma', 'British Emma']);
    expect(byId('af_heart')?.spoken).toEqual(['Heart', 'American Heart']);
  });

  it.each([
    ['Bella', 'af_bella'],
    ['use voice Bella.', 'af_bella'],
    ['bela', 'af_bella'],
    ['hart', 'af_heart'],
    ['Isabela', 'bf_isabella'],
    ['jesica', 'af_jessica'],
    ['nicol', 'af_nicole'],
    ['michel', 'am_michael'],
    ['British Emma', 'bf_emma'],
    ['british ema', 'bf_emma'],
    ['lilly', 'bf_lily'],
    ['George!', 'bm_george'],
    ['switch to fenrer please', 'am_fenrir'],
  ])('%j resolves to %s', (heard, id) => {
    const result = matchVoice(heard, COMPANION_LOCAL_VOICES);
    expect(result.kind).toBe('match');
    expect(result.kind === 'match' ? result.match.id : null).toBe(id);
  });

  it('asks "Bella or Isabella?" when whisper splits a name into a closer one', () => {
    const result = matchVoice('isa bella', COMPANION_LOCAL_VOICES);
    expect(result.kind).toBe('ambiguous');
    expect(result.kind === 'ambiguous' ? result.ambiguous.map((voice) => voice.id).sort() : null).toEqual([
      'af_bella',
      'bf_isabella',
    ]);
  });

  it('is ambiguous between two system voices sharing a display name across locales', () => {
    const system = [
      { uri: 'Daniel-en-GB', spoken: ['Daniel'] },
      { uri: 'Daniel-en-US', spoken: ['Daniel'] },
      { uri: 'Karen-en-AU', spoken: ['Karen'] },
    ];
    const result = matchVoice('daniel', system);
    expect(result.kind === 'ambiguous' ? result.ambiguous.map((voice) => voice.uri) : null).toEqual([
      'Daniel-en-GB',
      'Daniel-en-US',
    ]);
  });

  it.each(['', 'zebra', 'change your voice', 'say something', 'use the voice'])('%j matches nothing', (heard) => {
    expect(matchVoice(heard, COMPANION_LOCAL_VOICES)).toEqual({ kind: 'none' });
  });

  it('matches any voice shape by its spoken names — a system voice by display name', () => {
    const system = [
      { uri: 'com.apple.voice.Samantha', spoken: ['Samantha'] },
      { uri: 'com.apple.voice.Daniel', spoken: ['Daniel'] },
    ];
    const result = matchVoice('samanta', system);
    expect(result.kind === 'match' ? result.match.uri : null).toBe('com.apple.voice.Samantha');
  });
});

describe('editDistance', () => {
  it('counts insertions, deletions and substitutions', () => {
    expect(editDistance('bella', 'bella')).toBe(0);
    expect(editDistance('bela', 'bella')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
  });
});
