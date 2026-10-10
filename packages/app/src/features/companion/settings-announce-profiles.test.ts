import { CompanionSettingsSchema, type CompanionSettings } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ToastRequest } from '../../components/toast-host';
import { useUiStore } from '../../store/ui-store';
import { saveCompanionProfile, switchCompanionProfile } from './profiles';
import {
  announceCompanionProfileSwitch,
  companionProfileSwitchAnnouncement,
  companionUndoAnnouncement,
  defaultAnnounceDeps,
  resetCompanionAnnounceForTests,
  undoAndAnnounceCompanionSetting,
  type AnnounceDeps,
} from './settings-announce';
import { resetCompanionSettingUndoForTest } from './settings-apply';

/**
 * Phase 109 Theme G — what the companion says about a profile switch and its
 * undo: one line in the new voice, an Undo toast for the whole bundle, and an
 * undo that names the profile rather than reading five settings back.
 */

const COMPANION_KEYS = Object.keys(CompanionSettingsSchema.shape) as (keyof CompanionSettings)[];
const initial = useUiStore.getInitialState();

beforeEach(() => {
  useUiStore.setState({
    ...Object.fromEntries(COMPANION_KEYS.map((key) => [key, initial[key]])),
    screensaverLocked: false,
  } as Partial<typeof initial>);
  resetCompanionSettingUndoForTest();
  resetCompanionAnnounceForTests();
});

type Recorder = AnnounceDeps & { said: { text: string; voice: string | null }[]; toasts: ToastRequest[] };

function recorder(): Recorder {
  const rec: Recorder = {
    ...defaultAnnounceDeps(),
    said: [],
    toasts: [],
    rng: () => 0,
    speak: async (text) => {
      rec.said.push({ text, voice: useUiStore.getState().companionVoices.local });
    },
    showToast: (request) => {
      rec.toasts.push(request);
      return `toast-${rec.toasts.length}`;
    },
    dismissToast: () => {},
    systemVoiceName: () => null,
  };
  return rec;
}

/** Narrator (George) saved, then Pirate (Adam) saved and active. */
function twoProfiles(): void {
  useUiStore.setState({ companionVoices: { local: 'bm_george', system: null }, companionPersonality: 'Measured.' });
  saveCompanionProfile('Narrator');
  useUiStore.setState({ companionVoices: { local: 'am_adam', system: null }, companionPersonality: 'Arr.' });
  saveCompanionProfile('Pirate');
}

describe('a profile switch', () => {
  it('is announced after the write — in the new voice — with an Undo toast', async () => {
    twoProfiles();
    const deps = recorder();
    const result = switchCompanionProfile('Narrator', 'voice');
    if (!result.ok || result.op !== 'switch') throw new Error('not switched');

    await announceCompanionProfileSwitch(result, 'voice', deps);

    expect(deps.said).toEqual([{ text: 'This is Narrator now.', voice: 'bm_george' }]);
    expect(deps.toasts).toHaveLength(1);
    expect(deps.toasts[0]).toMatchObject({ message: 'Switched to Narrator.', action: { label: 'Undo' } });
  });

  it('leads with the agent when an agent did it', () => {
    expect(companionProfileSwitchAnnouncement('Narrator', 'mcp')).toBe('Your agent switched me to Narrator.');
  });

  it('is silent from the page, and when nothing changed', async () => {
    twoProfiles();
    const deps = recorder();
    await announceCompanionProfileSwitch({ profile: { name: 'Narrator' }, changed: true }, 'page', deps);
    await announceCompanionProfileSwitch({ profile: { name: 'Pirate' }, changed: false }, 'voice', deps);
    expect(deps.said).toEqual([]);
    expect(deps.toasts).toEqual([]);
  });

  it('is undone by "undo that" as one change, named by the profile it went back to', async () => {
    twoProfiles();
    switchCompanionProfile('Narrator', 'voice');
    const deps = recorder();

    const undone = await undoAndAnnounceCompanionSetting(deps);

    expect(undone.ok).toBe(true);
    expect(useUiStore.getState().companionVoices.local).toBe('am_adam');
    expect(useUiStore.getState().companionPersonality).toBe('Arr.');
    expect(deps.said).toEqual([{ text: 'Put it back. Pirate again.', voice: 'am_adam' }]);
  });

  it('says it is back how it was when no profile was active before', () => {
    expect(
      companionUndoAnnouncement(
        {
          keys: ['companionVoices.local', 'companionActiveProfile'],
          restored: { 'companionVoices.local': null, companionActiveProfile: null },
        },
        () => 0,
      ),
    ).toBe('Put it back. Back how I was before that profile.');
  });
});
