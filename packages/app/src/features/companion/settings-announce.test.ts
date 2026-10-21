import { CompanionSettingsSchema, type CompanionSettings } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToastRequest } from '../../components/toast-host';
import { useUiStore } from '../../store/ui-store';
import {
  announceCompanionSettingChange,
  applyAndAnnounceCompanionSetting,
  companionSettingAnnouncement,
  defaultAnnounceDeps,
  resetCompanionAnnounceForTests,
  undoAndAnnounceCompanionSetting,
  type AnnounceDeps,
} from './settings-announce';
import {
  COMPANION_UNDO_WINDOW_MS,
  applyCompanionSetting,
  resetCompanionSettingUndoForTest,
} from './settings-apply';

/**
 * Phase 109 Theme E — the read-back and the Undo toast, over the real setter
 * and store. Every side effect is a recording fake, so the order of the store
 * write and the spoken line is something a test can see.
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

afterEach(() => vi.useRealTimers());

type Recorder = AnnounceDeps & {
  /** Each spoken line, with what the store held at the moment it was said. */
  said: { text: string; voice: string | null; speakAloud: boolean; names: string[] }[];
  toasts: (ToastRequest & { id: string })[];
  dismissed: string[];
};

function recorder(): Recorder {
  const deps = defaultAnnounceDeps();
  const rec: Recorder = {
    ...deps,
    said: [],
    toasts: [],
    dismissed: [],
    rng: () => 0,
    speak: async (text) => {
      const ui = useUiStore.getState();
      rec.said.push({
        text,
        voice: ui.companionVoices.local,
        speakAloud: ui.companionSpeakAloud,
        names: ui.companionNames,
      });
    },
    showToast: (request) => {
      const id = `toast-${rec.toasts.length + 1}`;
      rec.toasts.push({ ...request, id });
      return id;
    },
    dismissToast: (id) => {
      rec.dismissed.push(id);
    },
    systemVoiceName: () => null,
  };
  return rec;
}

describe('the read-back order', () => {
  it('writes, then speaks — so a new voice is confirmed in the new voice', async () => {
    const deps = recorder();
    await applyAndAnnounceCompanionSetting({ key: 'companionVoices.local', value: 'af_bella' }, 'voice', deps);
    expect(deps.said).toEqual([
      { text: 'This is Bella now.', voice: 'af_bella', speakAloud: true, names: initial.companionNames },
    ]);
  });

  it('speaks, then writes, for a mute — after the write there is no voice to say it with', async () => {
    const deps = recorder();
    const result = await applyAndAnnounceCompanionSetting(
      { key: 'companionSpeakAloud', value: false, confirmed: true },
      'voice',
      deps,
    );
    expect(result.ok).toBe(true);
    expect(deps.said).toHaveLength(1);
    expect(deps.said[0]?.speakAloud).toBe(true);
    expect(useUiStore.getState().companionSpeakAloud).toBe(false);
  });

  it('speaks, then writes, for a rename — the old name still works while it is said', async () => {
    const deps = recorder();
    await applyAndAnnounceCompanionSetting(
      { key: 'companionNames', value: [...initial.companionNames, 'Nova'], confirmed: true },
      'voice',
      deps,
    );
    expect(deps.said[0]?.names).toEqual(initial.companionNames);
    expect(useUiStore.getState().companionNames).toEqual([...initial.companionNames, 'Nova']);
  });

  it('returns a refusal unspoken, for the caller to word', async () => {
    const deps = recorder();
    const result = await applyAndAnnounceCompanionSetting({ key: 'companionNames', value: ['Nova'] }, 'voice', deps);
    expect(result).toMatchObject({ ok: false, reason: 'confirm' });
    expect(deps.said).toEqual([]);
    expect(deps.toasts).toEqual([]);
  });

  it('varies the phrasing — the same change twice is not said the same way twice', () => {
    const first = companionSettingAnnouncement({ key: 'companionVolume', next: 0.5 }, 'voice', () => 0);
    const second = companionSettingAnnouncement({ key: 'companionVolume', next: 0.5 }, 'voice', () => 0);
    expect(first).not.toBe(second);
  });
});

describe('announceCompanionSettingChange — the contract with Theme D', () => {
  it('prefixes an MCP change with "Your agent changed…"', async () => {
    const deps = recorder();
    const result = applyCompanionSetting({ key: 'companionVoices.local', value: 'af_bella' }, 'mcp');
    await announceCompanionSettingChange(result, 'mcp', deps);
    expect(deps.said[0]?.text).toBe('Your agent changed my voice. This is Bella now.');
    expect(deps.toasts[0]?.message).toBe('Your agent changed Local voice to Bella.');
  });

  it('announces nothing for a page change — no read-back, no toast', async () => {
    const deps = recorder();
    const result = applyCompanionSetting({ key: 'companionVoices.local', value: 'af_bella' }, 'page');
    await announceCompanionSettingChange(result, 'page', deps);
    expect(deps.said).toEqual([]);
    expect(deps.toasts).toEqual([]);
  });

  it('announces nothing for a refusal or for a change that changed nothing', async () => {
    const deps = recorder();
    await announceCompanionSettingChange(
      applyCompanionSetting({ key: 'companionEnabled', value: false }, 'mcp'),
      'mcp',
      deps,
    );
    await announceCompanionSettingChange(
      applyCompanionSetting({ key: 'companionVoices.local', value: null }, 'mcp'),
      'mcp',
      deps,
    );
    expect(deps.said).toEqual([]);
    expect(deps.toasts).toEqual([]);
  });
});

describe('the Undo toast', () => {
  it('shows for a voice change for the whole undo window, and a newer one replaces it', async () => {
    const deps = recorder();
    await applyAndAnnounceCompanionSetting({ key: 'companionVoices.local', value: 'af_bella' }, 'voice', deps);
    expect(deps.toasts[0]).toMatchObject({ message: 'Local voice set to Bella.', action: { label: 'Undo' } });
    expect(deps.toasts[0]?.durationMs).toBeGreaterThan(COMPANION_UNDO_WINDOW_MS - 1000);
    expect(deps.toasts[0]?.durationMs).toBeLessThanOrEqual(COMPANION_UNDO_WINDOW_MS);

    await applyAndAnnounceCompanionSetting({ key: 'companionVolume', value: 0.3 }, 'voice', deps);
    expect(deps.dismissed).toEqual(['toast-1']);
    expect(deps.toasts[1]?.message).toBe('Companion volume set to 30%.');
  });

  it("its Undo restores the change and reads the old value back", async () => {
    const deps = recorder();
    await applyAndAnnounceCompanionSetting({ key: 'companionVoices.local', value: 'af_bella' }, 'voice', deps);
    deps.toasts[0]?.action?.onAction();
    await vi.waitFor(() => expect(useUiStore.getState().companionVoices.local).toBeNull());
    await vi.waitFor(() => expect(deps.said.at(-1)?.text).toMatch(/Heart/));
  });

  it('does nothing once another change has taken the undo slot', async () => {
    const deps = recorder();
    await applyAndAnnounceCompanionSetting({ key: 'companionVoices.local', value: 'af_bella' }, 'voice', deps);
    applyCompanionSetting({ key: 'companionVolume', value: 0.2 }, 'page');
    deps.toasts[0]?.action?.onAction();
    await Promise.resolve();
    expect(useUiStore.getState().companionVoices.local).toBe('af_bella');
    expect(useUiStore.getState().companionVolume).toBe(0.2);
  });
});

describe('"undo that"', () => {
  it('after a voice change, restores it and reads back in the restored voice', async () => {
    const deps = recorder();
    await applyAndAnnounceCompanionSetting({ key: 'companionVoices.local', value: 'af_bella' }, 'voice', deps);
    const result = await undoAndAnnounceCompanionSetting(deps);
    expect(result.ok).toBe(true);
    expect(useUiStore.getState().companionVoices.local).toBeNull();
    const last = deps.said.at(-1);
    expect(last?.text).toMatch(/^(Put it back\.|Undone\.|Back how it was\.) .*Heart/);
    expect(last?.voice).toBeNull();
    expect(deps.dismissed).toContain('toast-1');
  });

  it("after an agent's change, reverts it too", async () => {
    const deps = recorder();
    const applied = applyCompanionSetting({ key: 'companionVolume', value: 0.9 }, 'mcp');
    await announceCompanionSettingChange(applied, 'mcp', deps);
    const result = await undoAndAnnounceCompanionSetting(deps);
    expect(result).toMatchObject({ ok: true, source: 'mcp' });
    expect(useUiStore.getState().companionVolume).toBe(initial.companionVolume);
  });

  it('reads back first when undoing an unmute, which silences it', async () => {
    useUiStore.setState({ companionSpeakAloud: false });
    const deps = recorder();
    await applyAndAnnounceCompanionSetting({ key: 'companionSpeakAloud', value: true }, 'voice', deps);
    await undoAndAnnounceCompanionSetting(deps);
    expect(deps.said.at(-1)?.speakAloud).toBe(true);
    expect(useUiStore.getState().companionSpeakAloud).toBe(false);
  });

  it('says there is nothing to undo, and that sixty seconds on it is too late', async () => {
    const deps = recorder();
    await undoAndAnnounceCompanionSetting(deps);
    expect(deps.said.at(-1)?.text).toBe('Nothing to undo.');

    vi.useFakeTimers();
    await applyAndAnnounceCompanionSetting({ key: 'companionVoices.local', value: 'af_bella' }, 'voice', deps);
    vi.setSystemTime(Date.now() + COMPANION_UNDO_WINDOW_MS + 1000);
    const late = await undoAndAnnounceCompanionSetting(deps);
    expect(late).toEqual({ ok: false, reason: 'expired' });
    expect(deps.said.at(-1)?.text).toMatch(/^That was too long ago/);
    expect(useUiStore.getState().companionVoices.local).toBe('af_bella');
  });
});
