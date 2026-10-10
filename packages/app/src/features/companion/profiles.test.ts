import { beforeEach, describe, expect, it } from 'vitest';

import {
  COMPANION_PROFILES_MAX,
  CompanionSettingsSchema,
  type CompanionProfile,
  type CompanionSettings,
} from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import {
  deleteCompanionProfile,
  previewSaveCompanionProfile,
  readCompanionProfiles,
  renameCompanionProfile,
  saveCompanionProfile,
  switchCompanionProfile,
} from './profiles';
import {
  applyCompanionSetting,
  lastCompanionSettingChange,
  resetCompanionSettingUndoForTest,
  undoLastCompanionSetting,
} from './settings-apply';

/**
 * Phase 109 Theme G — persona profiles over the real store and the real
 * setter: a switch is one undoable change, editing marks a profile modified
 * without rewriting it, and save, rename and delete edit the list.
 */

const COMPANION_KEYS = Object.keys(CompanionSettingsSchema.shape) as (keyof CompanionSettings)[];
const initial = useUiStore.getInitialState() as unknown as Record<string, unknown>;

const now = () => new Date('2026-10-10T09:00:00.000Z');

/** The companion as Narrator sounds. */
function becomeNarrator(): void {
  useUiStore.setState({
    companionVoices: { local: 'bm_george', system: null },
    companionPersonality: 'Measured and warm.',
    companionHonorifics: ['friend'],
  });
}

beforeEach(() => {
  useUiStore.setState({
    ...Object.fromEntries(COMPANION_KEYS.map((key) => [key, initial[key]])),
    screensaverLocked: false,
    companionNames: ['Nova'],
  } as Parameters<typeof useUiStore.setState>[0]);
  resetCompanionSettingUndoForTest();
});

describe('save', () => {
  it('saves voice, personality and honorifics — never names — and makes the profile active', () => {
    becomeNarrator();
    const result = saveCompanionProfile('Narrator', { now });

    expect(result).toMatchObject({ ok: true, op: 'save', overwritten: false });
    const [saved] = useUiStore.getState().companionProfiles;
    expect(saved).toMatchObject({
      name: 'Narrator',
      voices: { local: 'bm_george', system: null },
      personality: 'Measured and warm.',
      honorifics: ['friend'],
      createdAt: '2026-10-10T09:00:00.000Z',
    });
    expect(saved).not.toHaveProperty('names');
    expect(useUiStore.getState().companionActiveProfile).toBe(saved?.id);
    // The list is not a setting: saving takes no undo step.
    expect(lastCompanionSettingChange()).toBeNull();
  });

  it('asks before saving over a taken name, and keeps the id and createdAt when told to', () => {
    becomeNarrator();
    const first = saveCompanionProfile('Narrator', { now });
    if (!first.ok) throw new Error('not saved');
    useUiStore.setState({ companionVoices: { local: 'af_bella', system: null } });

    const refused = saveCompanionProfile('narrator');
    expect(refused).toMatchObject({ ok: false, reason: 'confirm', profile: { name: 'Narrator' } });
    expect(useUiStore.getState().companionProfiles[0]?.voices.local).toBe('bm_george');

    const overwritten = saveCompanionProfile('narrator', { overwrite: true, now: () => new Date('2027-01-01T00:00:00Z') });
    expect(overwritten).toMatchObject({ ok: true, overwritten: true });
    expect(useUiStore.getState().companionProfiles).toHaveLength(1);
    expect(useUiStore.getState().companionProfiles[0]).toMatchObject({
      id: first.profile.id,
      name: 'Narrator',
      createdAt: '2026-10-10T09:00:00.000Z',
      voices: { local: 'af_bella' },
    });
  });

  it('previews a new name, a taken one and a bad one without writing', () => {
    saveCompanionProfile('Narrator');
    const profiles = useUiStore.getState().companionProfiles;
    expect(previewSaveCompanionProfile('Butler')).toEqual({ ok: true, name: 'Butler', existing: null });
    expect(previewSaveCompanionProfile('NARRATOR')).toMatchObject({ ok: true, name: 'Narrator', existing: { name: 'Narrator' } });
    expect(previewSaveCompanionProfile('   ')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(useUiStore.getState().companionProfiles).toBe(profiles);
  });

  it(`refuses a new profile past ${COMPANION_PROFILES_MAX}, but still saves over one`, () => {
    for (let index = 0; index < COMPANION_PROFILES_MAX; index += 1) saveCompanionProfile(`Profile ${index}`);
    expect(saveCompanionProfile('One too many')).toMatchObject({ ok: false, reason: 'full' });
    expect(saveCompanionProfile('Profile 3', { overwrite: true })).toMatchObject({ ok: true, overwritten: true });
  });

  it('refuses while the screen is locked', () => {
    useUiStore.setState({ screensaverLocked: true });
    expect(saveCompanionProfile('Narrator')).toMatchObject({ ok: false, reason: 'locked' });
    expect(useUiStore.getState().companionProfiles).toEqual([]);
  });
});

describe('switch — one change', () => {
  function twoProfiles(): { narrator: CompanionProfile; pirate: CompanionProfile } {
    becomeNarrator();
    const narrator = saveCompanionProfile('Narrator');
    useUiStore.setState({
      companionVoices: { local: 'am_adam', system: 'com.apple.Fred' },
      companionPersonality: 'Arr.',
      companionHonorifics: ['matey'],
    });
    const pirate = saveCompanionProfile('Pirate');
    if (!narrator.ok || !pirate.ok) throw new Error('not saved');
    return { narrator: narrator.profile, pirate: pirate.profile };
  }

  it('writes the voices, personality, honorifics and active id together, as one undo step', () => {
    const { narrator } = twoProfiles();
    const result = switchCompanionProfile('narrator', 'voice');

    expect(result).toMatchObject({ ok: true, op: 'switch', changed: true, profile: { id: narrator.id } });
    const ui = useUiStore.getState();
    expect(ui.companionVoices).toEqual({ local: 'bm_george', system: null });
    expect(ui.companionPersonality).toBe('Measured and warm.');
    expect(ui.companionHonorifics).toEqual(['friend']);
    expect(ui.companionActiveProfile).toBe(narrator.id);
    // Names are global: the wake word never moves on a switch.
    expect(ui.companionNames).toEqual(['Nova']);
    expect(lastCompanionSettingChange()?.keys.sort()).toEqual(
      [
        'companionActiveProfile',
        'companionHonorifics',
        'companionPersonality',
        'companionVoices.local',
        'companionVoices.system',
      ].sort(),
    );
  });

  it('is undone as one — every field and the active profile come back together', () => {
    const { pirate } = twoProfiles();
    switchCompanionProfile('Narrator', 'voice');

    const undone = undoLastCompanionSetting();
    expect(undone.ok).toBe(true);
    const ui = useUiStore.getState();
    expect(ui.companionVoices).toEqual({ local: 'am_adam', system: 'com.apple.Fred' });
    expect(ui.companionPersonality).toBe('Arr.');
    expect(ui.companionHonorifics).toEqual(['matey']);
    expect(ui.companionActiveProfile).toBe(pirate.id);
  });

  it('gets past the tier and the tunedText guard for an agent too — the switch is the consent', () => {
    twoProfiles();
    expect(switchCompanionProfile('Narrator', 'mcp')).toMatchObject({ ok: true, changed: true });
    expect(lastCompanionSettingChange()?.source).toBe('mcp');
  });

  it('says nothing changed when it is already that profile, unedited', () => {
    twoProfiles();
    expect(switchCompanionProfile('Pirate', 'voice')).toMatchObject({ ok: true, changed: false });
  });

  it('refuses an unknown name and a locked screen', () => {
    twoProfiles();
    expect(switchCompanionProfile('Butler', 'voice')).toMatchObject({
      ok: false,
      reason: 'notFound',
      message: "I don't have a profile called Butler.",
    });
    useUiStore.setState({ screensaverLocked: true });
    expect(switchCompanionProfile('Narrator', 'voice')).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('is the only way the active profile is written — a bare id is refused from every source', () => {
    const { narrator } = twoProfiles();
    for (const source of ['voice', 'mcp', 'page'] as const) {
      expect(applyCompanionSetting({ key: 'companionActiveProfile', value: narrator.id }, source)).toMatchObject({
        ok: false,
        reason: 'invalid',
      });
    }
  });
});

describe('modified marking', () => {
  it('marks the active profile modified on an edit, without rewriting it, and clears on a switch back', () => {
    becomeNarrator();
    saveCompanionProfile('Narrator');
    expect(readCompanionProfiles().modified).toBe(false);

    applyCompanionSetting({ key: 'companionVoices.local', value: 'af_bella' }, 'page');
    const after = readCompanionProfiles();
    expect(after.modified).toBe(true);
    expect(after.active?.voices.local).toBe('bm_george');

    expect(switchCompanionProfile('Narrator', 'voice')).toMatchObject({ ok: true, changed: true });
    expect(readCompanionProfiles().modified).toBe(false);
  });

  it('is never modified with no profile active', () => {
    useUiStore.setState({ companionVoices: { local: 'af_bella', system: null } });
    expect(readCompanionProfiles()).toMatchObject({ active: null, activeId: null, modified: false });
  });
});

describe('delete and rename', () => {
  it('deletes a profile; deleting the active one leaves the companion as it is with none active', () => {
    becomeNarrator();
    saveCompanionProfile('Narrator');
    const voices = useUiStore.getState().companionVoices;

    expect(deleteCompanionProfile('narrator')).toMatchObject({ ok: true, op: 'delete', wasActive: true });
    expect(useUiStore.getState().companionProfiles).toEqual([]);
    expect(useUiStore.getState().companionActiveProfile).toBeNull();
    expect(useUiStore.getState().companionVoices).toBe(voices);
    expect(deleteCompanionProfile('Narrator')).toMatchObject({ ok: false, reason: 'notFound' });
  });

  it('renames by id, refusing a name another profile has', () => {
    const narrator = saveCompanionProfile('Narrator');
    saveCompanionProfile('Pirate');
    if (!narrator.ok) throw new Error('not saved');

    expect(renameCompanionProfile(narrator.profile.id, 'pirate')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(renameCompanionProfile(narrator.profile.id, '  Storyteller ')).toMatchObject({
      ok: true,
      op: 'rename',
      previousName: 'Narrator',
      profile: { name: 'Storyteller' },
    });
    expect(useUiStore.getState().companionProfiles.map((profile) => profile.name)).toEqual(['Storyteller', 'Pirate']);
  });
});
