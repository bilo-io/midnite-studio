import { describe, expect, it } from 'vitest';

import {
  COMPANION_PROFILES_MAX,
  CompanionIntentSchema,
  CompanionProfileSchema,
  CompanionSettingsSchema,
  parseAskReply,
  parseIntent,
  type CompanionProfile,
  type CompanionVocabulary,
} from './companion';
import {
  CompanionProfileListOutputSchema,
  CompanionProfileOpOutputSchema,
  describeCompanionProfiles,
  describeCompanionSettings,
} from './companion-mcp';
import {
  companionProfileFields,
  companionProfileNameProblem,
  findCompanionProfile,
  isCompanionProfileModified,
  joinCompanionProfileNames,
  type CompanionProfileSource,
} from './companion-profiles';

/**
 * Phase 109 Theme G — persona profiles: the schema, the pure helpers the
 * page, the voice and the MCP tools share, the `profile` intent's grammar, and
 * the router fixtures.
 */

const narrator: CompanionProfile = {
  id: 'p-narrator',
  name: 'Narrator',
  voices: { local: 'bm_george', system: null },
  personality: 'Measured, warm, a little theatrical.',
  honorifics: ['friend'],
  createdAt: '2026-10-10T09:00:00.000Z',
};

const pirate: CompanionProfile = {
  id: 'p-pirate',
  name: 'Pirate Captain',
  voices: { local: 'am_adam', system: 'com.apple.voice.Fred' },
  personality: 'Arr.',
  honorifics: ['matey'],
  createdAt: '2026-10-10T09:05:00.000Z',
};

const asStore = (profile: CompanionProfile): CompanionProfileSource => ({
  companionVoices: { ...profile.voices },
  companionPersonality: profile.personality,
  companionHonorifics: [...profile.honorifics],
});

describe('CompanionProfileSchema', () => {
  it('parses a whole profile', () => {
    expect(CompanionProfileSchema.parse(narrator)).toEqual(narrator);
  });

  it('has no names field — a switch can never change the wake word (Decision 5)', () => {
    expect(Object.keys(CompanionProfileSchema.shape)).not.toContain('names');
    const parsed = CompanionProfileSchema.parse({ ...narrator, names: ['Nova'] });
    expect(parsed).not.toHaveProperty('names');
  });

  it.each([
    ['an empty name', { ...narrator, name: '   ' }],
    ['a 65-character name', { ...narrator, name: 'x'.repeat(65) }],
    ['a non-ISO date', { ...narrator, createdAt: 'yesterday' }],
    ['an empty honorific', { ...narrator, honorifics: [''] }],
  ])('refuses %s', (_label, value) => {
    expect(CompanionProfileSchema.safeParse(value).success).toBe(false);
  });

  it('maps a stale local voice id to the default rather than failing the profile', () => {
    expect(CompanionProfileSchema.parse({ ...narrator, voices: { local: 'xx_gone', system: null } }).voices.local).toBeNull();
  });

  it('caps the store at COMPANION_PROFILES_MAX', () => {
    const many = Array.from({ length: COMPANION_PROFILES_MAX + 1 }, (_, index) => ({ ...narrator, id: `p${index}` }));
    expect(CompanionSettingsSchema.shape.companionProfiles.safeParse(many).success).toBe(false);
    expect(CompanionSettingsSchema.shape.companionProfiles.safeParse(many.slice(1)).success).toBe(true);
  });
});

describe('the profile helpers', () => {
  it('captures the bundled fields and nothing else', () => {
    const fields = companionProfileFields({ ...asStore(narrator) });
    expect(fields).toEqual({ voices: narrator.voices, personality: narrator.personality, honorifics: narrator.honorifics });
  });

  it('finds by name case-insensitively, then by id', () => {
    expect(findCompanionProfile([narrator, pirate], 'narrator')?.id).toBe('p-narrator');
    expect(findCompanionProfile([narrator, pirate], '  pirate   captain ')?.id).toBe('p-pirate');
    expect(findCompanionProfile([narrator, pirate], 'p-pirate')?.id).toBe('p-pirate');
    expect(findCompanionProfile([narrator, pirate], 'Butler')).toBeNull();
    expect(findCompanionProfile([narrator], '')).toBeNull();
  });

  describe('modified marking', () => {
    it('is unmodified on the values it was saved with', () => {
      expect(isCompanionProfileModified(narrator, asStore(narrator))).toBe(false);
    });

    it('ignores whitespace the page keeps around the personality', () => {
      expect(
        isCompanionProfileModified(narrator, { ...asStore(narrator), companionPersonality: `${narrator.personality}  ` }),
      ).toBe(false);
    });

    it.each([
      ['the local voice', { companionVoices: { local: 'af_bella', system: null } }],
      ['the system voice', { companionVoices: { local: 'bm_george', system: 'com.apple.Samantha' } }],
      ['the personality', { companionPersonality: 'Terse.' }],
      ['what it calls you', { companionHonorifics: ['boss'] }],
      ['the order of what it calls you', { companionHonorifics: ['friend', 'boss'] }],
    ])('is modified once %s changes', (_label, change) => {
      expect(isCompanionProfileModified(narrator, { ...asStore(narrator), ...change })).toBe(true);
    });
  });

  it('names a clash, an empty name and an over-long one — but lets a rename keep its own name', () => {
    expect(companionProfileNameProblem('narrator', [narrator])).toBe("There's already a profile called Narrator.");
    expect(companionProfileNameProblem('NARRATOR', [narrator], 'p-narrator')).toBeNull();
    expect(companionProfileNameProblem('  ', [])).toBe('A profile needs a name.');
    expect(companionProfileNameProblem('x'.repeat(65), [])).toMatch(/64 characters/);
    expect(companionProfileNameProblem('Butler', [narrator])).toBeNull();
  });

  it('joins names the way the companion says them', () => {
    expect(joinCompanionProfileNames([])).toBe('');
    expect(joinCompanionProfileNames(['Narrator'])).toBe('Narrator');
    expect(joinCompanionProfileNames(['Narrator', 'Pirate', 'Butler'])).toBe('Narrator, Pirate and Butler');
  });
});

describe('companion_profile_list and the op outputs', () => {
  it('lists every profile with active and modified, modified only for the active one', () => {
    const current = { ...asStore(narrator), companionHonorifics: ['boss'] };
    const listed = describeCompanionProfiles([narrator, pirate], 'p-narrator', current, false);
    expect(CompanionProfileListOutputSchema.parse(listed)).toEqual(listed);
    expect(listed.active).toBe('p-narrator');
    expect(listed.max).toBe(COMPANION_PROFILES_MAX);
    expect(listed.profiles.map((row) => [row.name, row.active, row.modified])).toEqual([
      ['Narrator', true, true],
      ['Pirate Captain', false, false],
    ]);
  });

  it('reports a dangling active id as none', () => {
    expect(describeCompanionProfiles([narrator], 'p-gone', asStore(narrator), true)).toMatchObject({
      active: null,
      locked: true,
    });
  });

  it('parses every status an op can answer with', () => {
    for (const status of ['applied', 'approved', 'declined', 'timeout', 'refused'] as const) {
      expect(CompanionProfileOpOutputSchema.safeParse({ status, name: 'Narrator' }).success).toBe(true);
    }
    expect(CompanionProfileOpOutputSchema.safeParse({ status: 'refused', name: 'X', reason: 'nope' }).success).toBe(false);
  });

  it('lists the active profile as not settable through companion_settings_set', () => {
    const row = describeCompanionSettings({ companionActiveProfile: 'p-narrator' }, false).settings.find(
      (entry) => entry.key === 'companionActiveProfile',
    );
    expect(row).toMatchObject({ settable: false, value: 'p-narrator' });
    expect(row?.note).toMatch(/companion_profile_switch/);
  });
});

const vocabulary: CompanionVocabulary = {
  views: [
    { id: 'graph', label: 'Commit Graph', keywords: 'git history commits branches log' },
    { id: 'settings', label: 'Settings', keywords: 'settings preferences' },
  ],
  settingsPages: [{ id: 'companion', label: 'Companion' }],
  commands: [{ id: 'sync.fetch', label: 'Fetch', group: 'sync', access: 'direct' }],
  skills: [],
  repos: ['bilo-mono'],
  profiles: ['Narrator', 'Pirate Captain'],
};

const parse = (text: string, vocab: CompanionVocabulary = vocabulary) => parseIntent(text, vocab);

describe('parseIntent — profile phrases (Theme G)', () => {
  it.each([
    ['save this as Narrator', 'Narrator'],
    ['Save this as the narrator.', 'narrator'],
    ['please save yourself as Butler', 'Butler'],
    ['save your current voice as "Night Owl"', 'Night Owl'],
    ['save this as a new profile called Butler', 'Butler'],
    ['save a profile called Butler', 'Butler'],
    ['create a new persona named Butler', 'Butler'],
    ['save how you sound as Butler profile', 'Butler'],
  ])('“%s” saves %s', (text, name) => {
    expect(parse(text)).toEqual({ kind: 'profile', op: 'save', name });
  });

  it.each([
    ['switch to Narrator', 'Narrator'],
    ['switch to narrator', 'Narrator'],
    ['be Narrator', 'Narrator'],
    ['become the narrator again', 'Narrator'],
    ['go back to being Pirate Captain', 'Pirate Captain'],
    ['talk like the pirate captain', 'Pirate Captain'],
    ['use the Narrator profile', 'Narrator'],
    ['switch to the narrator persona', 'Narrator'],
    ['load profile Pirate Captain', 'Pirate Captain'],
  ])('“%s” switches to %s', (text, name) => {
    expect(parse(text)).toEqual({ kind: 'profile', op: 'switch', name });
  });

  it('keeps an unknown name when the phrase says "profile", so the companion can say it has none', () => {
    expect(parse('switch to the Butler profile')).toEqual({ kind: 'profile', op: 'switch', name: 'Butler' });
  });

  it.each([
    ['delete the Narrator profile', 'Narrator'],
    ['remove my pirate captain persona', 'pirate captain'],
    ['forget the profile called Narrator', 'Narrator'],
    ['get rid of the Butler profile', 'Butler'],
  ])('“%s” deletes %s', (text, name) => {
    expect(parse(text)).toEqual({ kind: 'profile', op: 'delete', name });
  });

  it.each([
    'what profiles do I have?',
    'which personas have I saved',
    'list my profiles',
    'show me the profiles',
    'read me my saved personas',
    'my profiles',
  ])('“%s” lists them', (text) => {
    expect(parse(text)).toEqual({ kind: 'profile', op: 'list' });
  });

  it('leaves a bare "switch to" alone unless the name is a profile', () => {
    // A view, a voice, a repo and "be quieter" keep what they meant before.
    expect(parse('switch to the graph').kind).toBe('navigate');
    expect(parse('switch to Bella')).toMatchObject({ kind: 'setting', key: 'companionVoices.local' });
    expect(parse('switch to bilo-mono')).toEqual({ kind: 'switchRepo', name: 'bilo-mono' });
    expect(parse('be quieter')).toMatchObject({ kind: 'setting', key: 'companionVolume' });
    expect(parse('be Narrator', { ...vocabulary, profiles: [] }).kind).not.toBe('profile');
  });

  it('beats a view or a voice by the same name — the profile is a name the user chose', () => {
    expect(parse('switch to Bella', { ...vocabulary, profiles: ['Bella'] })).toEqual({
      kind: 'profile',
      op: 'switch',
      name: 'Bella',
    });
  });

  it('refuses a clause where a name should be', () => {
    expect(parse('save this as the thing we talked about yesterday').kind).not.toBe('profile');
    expect(parse('delete this profile').kind).not.toBe('profile');
  });

  it('is behind the vocabulary gate, like every settings phrase', () => {
    expect(parseIntent('save this as Narrator').kind).not.toBe('profile');
  });

  it('never carries a name past the schema cap', () => {
    expect(CompanionIntentSchema.safeParse({ kind: 'profile', op: 'save', name: 'x'.repeat(65) }).success).toBe(false);
    expect(CompanionIntentSchema.safeParse({ kind: 'profile', op: 'list' }).success).toBe(true);
  });
});

describe('parseAskReply — profile replies (Theme G router fixtures)', () => {
  it('accepts a switch by name', () => {
    expect(
      parseAskReply('{"say":"Back to the narrator.","intent":{"kind":"profile","op":"switch","name":"Narrator"}}'),
    ).toEqual({ say: 'Back to the narrator.', intent: { kind: 'profile', op: 'switch', name: 'Narrator' } });
  });

  it('accepts a list', () => {
    expect(parseAskReply('{"say":"Let me check.","intent":{"kind":"profile","op":"list"}}')?.intent).toEqual({
      kind: 'profile',
      op: 'list',
    });
  });

  it('drops an op it does not know, keeping the sentence', () => {
    const reply = parseAskReply('{"say":"Sure.","intent":{"kind":"profile","op":"rename","name":"Narrator"}}');
    expect(reply?.intent).toBeUndefined();
  });
});
