import { companionSettingsVocabulary, type CompanionProfile } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import type { PendingAction } from '../../store/companion-store';
import { resetHandoffState, submitInput } from './handoff';
import { describeProfiles } from './profile-handoff';
import { fakeCompanionProfiles, fakeCompanionSettings, fakeHandoffDeps, fakeStore, vocabularyFixture } from './test-doubles';

/**
 * Phase 109 Theme G — the companion's voice for persona profiles: `act()`'s
 * `profile` arm against a fake profiles port, through the real grammar and
 * the real pending slot. The real store writes are `profiles.test.ts`'s.
 */

afterEach(() => resetHandoffState());

const profile = (id: string, name: string): CompanionProfile => ({
  id,
  name,
  voices: { local: null, system: null },
  personality: '',
  honorifics: [],
  createdAt: '2026-10-10T09:00:00.000Z',
});

function setup(initial: CompanionProfile[] = [], activeId: string | null = null) {
  const store = fakeStore();
  const profiles = fakeCompanionProfiles(initial, activeId);
  let pending: PendingAction | null = null;
  const deps = fakeHandoffDeps({
    store,
    // The live names, as `runtime.ts`'s `withCompanionProfiles` merges them in.
    vocabulary: () =>
      vocabularyFixture({ settings: companionSettingsVocabulary(), profiles: profiles.profiles.map((row) => row.name) }),
    companionSettings: fakeCompanionSettings({}, { profiles }),
    pendingAction: () => pending,
    setPendingAction: (next) => {
      pending = next;
    },
  });
  return { store, profiles, deps, pending: () => pending };
}

describe('"save this as …"', () => {
  it('saves a new name at once, and says so', async () => {
    const { store, profiles, deps, pending } = setup();
    await submitInput('save this as Narrator', deps);
    expect(profiles.profiles.map((row) => row.name)).toEqual(['Narrator']);
    expect(store.lines().at(-1)).toBe('companion: Saved as Narrator.');
    expect(pending()).toBeNull();
  });

  it('asks before saving over a name that exists, and saves over it on yes', async () => {
    const { store, profiles, deps, pending } = setup([profile('p1', 'Narrator')]);
    await submitInput('save this as narrator', deps);
    expect(store.lines().at(-1)).toBe('companion: Save over the Narrator profile? Say yes, press Return, or tap Run.');
    expect(pending()?.label).toBe('Save over the Narrator profile');
    expect(profiles.active()).toBeNull();

    await submitInput('yes', deps);
    expect(store.lines().at(-1)).toBe('companion: Saved over Narrator.');
    expect(profiles.active()).toBe('p1');
    expect(profiles.profiles).toHaveLength(1);
  });

  it('leaves it on a no', async () => {
    const { store, profiles, deps, pending } = setup([profile('p1', 'Narrator')]);
    await submitInput('save this as Narrator', deps);
    await submitInput('no', deps);
    expect(pending()).toBeNull();
    expect(store.lines().at(-1)).toBe('companion: Left it.');
    expect(profiles.active()).toBeNull();
  });
});

describe('"switch to …" / "be …"', () => {
  it('switches by a saved name alone, and the new voice says so', async () => {
    const { store, profiles, deps } = setup([profile('p1', 'Narrator'), profile('p2', 'Pirate')], 'p2');
    await submitInput('be Narrator', deps);
    expect(profiles.switched).toEqual(['Narrator']);
    expect(store.lines().at(-1)).toBe('companion: This is Narrator now.');
  });

  it('says so when it already is that profile', async () => {
    const { store, deps } = setup([profile('p1', 'Narrator')], 'p1');
    await submitInput('switch to Narrator', deps);
    expect(store.lines().at(-1)).toBe("companion: I'm already Narrator.");
  });

  it('names the profiles it does have when asked for one it does not', async () => {
    const { store, deps } = setup([profile('p1', 'Narrator'), profile('p2', 'Pirate')]);
    await submitInput('use the Butler profile', deps);
    expect(store.lines().at(-1)).toBe("companion: I don't have a profile called Butler. I have Narrator and Pirate.");
  });
});

describe('"delete the … profile"', () => {
  it('always asks, and deletes on yes', async () => {
    const { store, profiles, deps, pending } = setup([profile('p1', 'Narrator')], 'p1');
    await submitInput('delete the narrator profile', deps);
    expect(store.lines().at(-1)).toBe('companion: Delete the Narrator profile? Say yes, press Return, or tap Run.');
    expect(profiles.profiles).toHaveLength(1);

    await submitInput('yes', deps);
    expect(store.lines().at(-1)).toBe('companion: Deleted Narrator.');
    expect(profiles.profiles).toHaveLength(0);
    expect(pending()).toBeNull();
  });

  it('refuses a name it does not have without asking', async () => {
    const { store, deps, pending } = setup();
    await submitInput('delete the Narrator profile', deps);
    expect(store.lines().at(-1)).toBe("companion: I don't have a profile called Narrator.");
    expect(pending()).toBeNull();
  });

  it('replaces an earlier question, naming it', async () => {
    const { store, deps } = setup([profile('p1', 'Narrator'), profile('p2', 'Pirate')]);
    await submitInput('delete the Narrator profile', deps);
    await submitInput('delete the Pirate profile', deps);
    expect(store.lines().at(-1)).toBe(
      'companion: Never mind delete the Narrator profile — Delete the Pirate profile? Say yes, press Return, or tap Run.',
    );
  });
});

describe('"what profiles do I have?"', () => {
  it('lists them and says which is on', async () => {
    const { store, deps } = setup([profile('p1', 'Narrator'), profile('p2', 'Pirate')], 'p2');
    await submitInput('what profiles do I have?', deps);
    expect(store.lines().at(-1)).toBe('companion: You have 2 profiles: Narrator and Pirate. Pirate is on.');
  });

  it('says how to start when there are none', async () => {
    const { store, deps } = setup();
    await submitInput('list my profiles', deps);
    expect(store.lines().at(-1)).toBe("companion: You haven't saved any profiles yet — say “save this as” and a name.");
  });

  it('mentions unsaved changes to the active one', () => {
    const narrator = profile('p1', 'Narrator');
    expect(describeProfiles({ profiles: [narrator], activeId: 'p1', active: narrator, modified: true })).toBe(
      'You have one profile: Narrator. Narrator is on, with changes since you saved it.',
    );
  });
});
