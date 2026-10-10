import { describe, expect, it } from 'vitest';

import { COMPANION_LOCAL_VOICES, COMPANION_SETTING_KEYS, COMPANION_SETTING_TIERS } from './companion';
import {
  COMPANION_MCP_CONFIRM_MS,
  COMPANION_MCP_REPLY_GRACE_MS,
  CompanionSettingsGetOutputSchema,
  CompanionVoicesListOutputSchema,
  companionSettingSetTimeoutMs,
  describeCompanionLocalVoices,
  describeCompanionSettings,
} from './companion-mcp';
import { CompanionUiActionSchema, CompanionUiResultValueSchema } from './ipc/schemas';

/** vitest: the `companion_*` MCP family's pure half (Phase 109 Theme D). */
describe('describeCompanionSettings', () => {
  const listing = describeCompanionSettings({ companionVolume: 0.4, companionEnabled: true }, false);

  it('lists every spec’d key once, and parses under its own output schema', () => {
    expect(listing.settings.map((entry) => entry.key)).toEqual([...COMPANION_SETTING_KEYS]);
    expect(CompanionSettingsGetOutputSchema.safeParse(listing).success).toBe(true);
  });

  it('never lists a never-tier key as settable', () => {
    const never = listing.settings.filter((entry) => COMPANION_SETTING_TIERS[entry.key] === 'never');
    expect(never.map((entry) => entry.key).sort()).toEqual(
      ['companionEnabled', 'companionHandsFree', 'companionSttEngine', 'companionSttProvider'].sort(),
    );
    for (const entry of never) {
      expect(entry.settable, entry.key).toBe(false);
      expect(entry.tier).toBe('never');
      expect(entry.note).toBe('Only from Settings ▸ Companion.');
    }
  });

  it('lists personality and About me as not settable — their tunedText guard refuses any agent', () => {
    for (const key of ['companionPersonality', 'companionAboutUser'] as const) {
      const entry = listing.settings.find((row) => row.key === key);
      expect(entry?.settable, key).toBe(false);
      expect(entry?.tier).toBe('confirm');
      expect(entry?.note).toMatch(/tune-me/);
    }
  });

  it('lists the direct and the other confirm keys as settable, with their allowed values', () => {
    const volume = listing.settings.find((row) => row.key === 'companionVolume');
    expect(volume).toMatchObject({ settable: true, tier: 'direct', value: 0.4 });
    expect(volume?.allowed).toEqual({ kind: 'number', min: 0, max: 1, step: 0.1 });

    const names = listing.settings.find((row) => row.key === 'companionNames');
    expect(names).toMatchObject({ settable: true, tier: 'confirm', allowed: { kind: 'list', min: 1 } });

    const local = listing.settings.find((row) => row.key === 'companionVoices.local');
    expect(local?.allowed).toMatchObject({ kind: 'enum', nullable: true });
    expect(local?.allowed.kind === 'enum' && local.allowed.values).toContain('af_bella');
  });

  it('carries the values that drop speak-aloud to direct', () => {
    const speak = listing.settings.find((row) => row.key === 'companionSpeakAloud');
    expect(speak).toMatchObject({ tier: 'confirm', directValues: [true], settable: true });
  });

  it('reports a missing value as null, and the lock as given', () => {
    expect(listing.settings.find((row) => row.key === 'companionMusicOffer')?.value).toBeNull();
    expect(describeCompanionSettings({}, true).locked).toBe(true);
  });
});

describe('companionSettingSetTimeoutMs', () => {
  const confirmWait = COMPANION_MCP_CONFIRM_MS + COMPANION_MCP_REPLY_GRACE_MS;

  it('waits for the prompt plus its grace on a confirm-tier change', () => {
    expect(confirmWait).toBe(35_000);
    expect(companionSettingSetTimeoutMs('companionNames', ['Nova'])).toBe(confirmWait);
    expect(companionSettingSetTimeoutMs('companionSpeakAloud', false)).toBe(confirmWait);
  });

  it('keeps the bridge default for a direct change, including speak-aloud back on', () => {
    expect(companionSettingSetTimeoutMs('companionVolume', 0.5)).toBeUndefined();
    expect(companionSettingSetTimeoutMs('companionSpeakAloud', true)).toBeUndefined();
  });
});

describe('describeCompanionLocalVoices', () => {
  it('lists every Kokoro voice with its spoken names and the download flag', () => {
    const voices = describeCompanionLocalVoices(true);
    expect(voices).toHaveLength(COMPANION_LOCAL_VOICES.length);
    expect(voices.find((voice) => voice.id === 'af_bella')).toMatchObject({
      name: 'Bella',
      spoken: ['Bella', 'American Bella'],
      downloaded: true,
    });
    expect(describeCompanionLocalVoices(false).every((voice) => !voice.downloaded)).toBe(true);
    expect(
      CompanionVoicesListOutputSchema.safeParse({ local: voices, system: [], selected: { local: null, system: null } })
        .success,
    ).toBe(true);
  });
});

describe('the companion arms on the ui request/reply', () => {
  it('accepts a setting action for a known key only', () => {
    expect(CompanionUiActionSchema.safeParse({ kind: 'setting', key: 'companionVolume', value: 0.5 }).success).toBe(true);
    expect(CompanionUiActionSchema.safeParse({ kind: 'setting', key: 'companionApiKey', value: 'x' }).success).toBe(false);
    expect(CompanionUiActionSchema.safeParse({ kind: 'settingsState' }).success).toBe(true);
    expect(CompanionUiActionSchema.safeParse({ kind: 'voices' }).success).toBe(true);
  });

  it('accepts each reply arm', () => {
    expect(
      CompanionUiResultValueSchema.safeParse({ did: 'setting', status: 'timeout', key: 'companionNames' }).success,
    ).toBe(true);
    expect(
      CompanionUiResultValueSchema.safeParse({
        did: 'settingsState',
        values: { companionVolume: 0.5, 'companionVoices.local': 'af_bella' },
        locked: false,
      }).success,
    ).toBe(true);
    expect(
      CompanionUiResultValueSchema.safeParse({
        did: 'voices',
        system: [{ voiceURI: 'com.apple.Samantha', name: 'Samantha', lang: 'en-US', default: true }],
        selected: { local: 'af_bella', system: null },
      }).success,
    ).toBe(true);
  });
});
