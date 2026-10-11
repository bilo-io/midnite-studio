import { COMPANION_SETTINGS_OFF_MESSAGE } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as ttsBroker from '../companion/tts-broker';
import * as uiBridge from '../companion/ui-bridge';
import { companionSettingsGet, companionSettingsSet, companionVoicesList } from './companion-tools';
import { MCP_HANDLERS } from './dispatch';
import { McpToolError } from './errors';
import { resetMcpAllowUiStateForTests, setMcpAllowCompanionSettingsState, setMcpAllowUiState } from './ui-gate';

/**
 * vitest: the `companion_*` MCP handlers (Phase 109 Theme D) — the one switch
 * that gates all three, reads included; the per-action wait a confirm-tier
 * `companion_settings_set` gets; and the answer shapes built from the
 * renderer's reply. The renderer half (tiers, guards, the in-app prompt) is
 * `app/features/companion/ui-requests.test.ts`'s.
 */

vi.mock('../companion/ui-bridge', () => ({
  requestUiAction: vi.fn(),
  UI_BRIDGE_TIMEOUT_MESSAGE: 'the window did not answer',
}));
vi.mock('../companion/tts-broker', () => ({ companionTtsModelOnDisk: vi.fn(() => true) }));

const requestUiAction = vi.mocked(uiBridge.requestUiAction);
const modelOnDisk = vi.mocked(ttsBroker.companionTtsModelOnDisk);

beforeEach(() => {
  setMcpAllowCompanionSettingsState(true);
});

afterEach(() => {
  resetMcpAllowUiStateForTests();
  requestUiAction.mockReset();
  modelOnDisk.mockReset();
  modelOnDisk.mockReturnValue(true);
});

async function refusal(promise: Promise<unknown>): Promise<McpToolError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(McpToolError);
  return error as McpToolError;
}

describe('the allowCompanionSettings switch', () => {
  it('refuses every companion tool, reads included, naming the switch — before any IPC', async () => {
    setMcpAllowCompanionSettingsState(false);
    // A different family's switch being on changes nothing here.
    setMcpAllowUiState(true);

    for (const call of [
      () => companionSettingsGet(),
      () => companionSettingsSet({ key: 'companionVolume', value: 0.5 }),
      () => companionVoicesList(),
    ]) {
      const error = await refusal(call());
      expect(error.kind).toBe('refused');
      expect(error.message).toBe(COMPANION_SETTINGS_OFF_MESSAGE);
    }
    expect(requestUiAction).not.toHaveBeenCalled();
  });

  it('is wired into MCP_HANDLERS for all three tools', () => {
    expect(MCP_HANDLERS.companion_settings_get).toBe(companionSettingsGet);
    expect(MCP_HANDLERS.companion_settings_set).toBe(companionSettingsSet);
    expect(MCP_HANDLERS.companion_voices_list).toBe(companionVoicesList);
  });
});

describe('companion_settings_get', () => {
  it('asks the renderer for the raw values and answers with the spec listing', async () => {
    requestUiAction.mockResolvedValue({
      ok: true,
      value: {
        did: 'settingsState',
        values: { companionVolume: 0.6, companionEnabled: true, companionAboutUser: 'likes jazz' },
        locked: false,
      },
    });

    const answer = await companionSettingsGet();

    expect(requestUiAction).toHaveBeenCalledWith({ kind: 'settingsState' });
    expect(answer.locked).toBe(false);
    expect(answer.settings.find((row) => row.key === 'companionVolume')).toMatchObject({
      value: 0.6,
      tier: 'direct',
      settable: true,
    });
  });

  it('never returns a never-tier key as settable', async () => {
    requestUiAction.mockResolvedValue({
      ok: true,
      value: { did: 'settingsState', values: { companionEnabled: true, companionSttEngine: 'server' }, locked: false },
    });

    const answer = await companionSettingsGet();
    const never = answer.settings.filter((row) => row.tier === 'never');
    expect(never.length).toBe(4);
    expect(never.every((row) => !row.settable)).toBe(true);
  });

  it('reports a locked screen rather than refusing the read', async () => {
    requestUiAction.mockResolvedValue({ ok: true, value: { did: 'settingsState', values: {}, locked: true } });
    expect((await companionSettingsGet()).locked).toBe(true);
  });

  it('refuses when there is no window to ask', async () => {
    requestUiAction.mockResolvedValue({ ok: false, kind: 'error', message: 'Midnite Studio has no open window right now.' });
    const error = await refusal(companionSettingsGet());
    expect(error).toMatchObject({ kind: 'refused', message: 'Midnite Studio has no open window right now.' });
  });
});

describe('companion_settings_set', () => {
  it('sends a direct change with the bridge’s default wait and returns the renderer’s answer', async () => {
    requestUiAction.mockResolvedValue({
      ok: true,
      value: { did: 'setting', status: 'applied', key: 'companionVolume', previous: 0.5, next: 0.8 },
    });

    const answer = await companionSettingsSet({ key: 'companionVolume', value: 0.8 });

    expect(requestUiAction).toHaveBeenCalledWith({ kind: 'setting', key: 'companionVolume', value: 0.8 }, {});
    expect(answer).toEqual({ status: 'applied', key: 'companionVolume', previous: 0.5, next: 0.8 });
  });

  it('gives a confirm-tier change the prompt’s 30 s plus a grace', async () => {
    requestUiAction.mockResolvedValue({
      ok: true,
      value: { did: 'setting', status: 'approved', key: 'companionNames', previous: ['Companion'], next: ['Nova'] },
    });

    const answer = await companionSettingsSet({ key: 'companionNames', value: ['Nova'] });

    expect(requestUiAction).toHaveBeenCalledWith(
      { kind: 'setting', key: 'companionNames', value: ['Nova'] },
      { timeoutMs: 35_000 },
    );
    expect(answer.status).toBe('approved');
  });

  it.each(['declined', 'timeout'] as const)('passes a %s answer through as it stands', async (status) => {
    requestUiAction.mockResolvedValue({ ok: true, value: { did: 'setting', status, key: 'companionNames' } });
    expect(await companionSettingsSet({ key: 'companionNames', value: ['Nova'] })).toEqual({
      status,
      key: 'companionNames',
    });
  });

  it('answers timeout when even the backstop runs out on a confirm-tier change', async () => {
    requestUiAction.mockResolvedValue({ ok: false, kind: 'error', message: 'the window did not answer' });
    expect(await companionSettingsSet({ key: 'companionMicMode', value: 'toggle' })).toEqual({
      status: 'timeout',
      key: 'companionMicMode',
    });
  });

  it('refuses a direct change whose window never answered — that is not a person taking their time', async () => {
    requestUiAction.mockResolvedValue({ ok: false, kind: 'error', message: 'the window did not answer' });
    const error = await refusal(companionSettingsSet({ key: 'companionVolume', value: 0.5 }));
    expect(error.kind).toBe('refused');
  });

  it('passes the renderer’s locked refusal through as a refused status', async () => {
    requestUiAction.mockResolvedValue({
      ok: true,
      value: {
        did: 'setting',
        status: 'refused',
        key: 'companionVolume',
        reason: 'locked',
        message: 'The screen is locked — unlock it first.',
      },
    });
    expect(await companionSettingsSet({ key: 'companionVolume', value: 0.5 })).toMatchObject({
      status: 'refused',
      reason: 'locked',
    });
  });
});

describe('companion_voices_list', () => {
  it('lists the Kokoro catalog with the on-disk flag, plus the renderer’s system voices', async () => {
    modelOnDisk.mockReturnValue(false);
    requestUiAction.mockResolvedValue({
      ok: true,
      value: {
        did: 'voices',
        system: [{ voiceURI: 'com.apple.Samantha', name: 'Samantha', lang: 'en-US', default: true }],
        selected: { local: 'af_bella', system: null },
      },
    });

    const answer = await companionVoicesList();

    expect(requestUiAction).toHaveBeenCalledWith({ kind: 'voices' });
    expect(answer.local.find((voice) => voice.id === 'af_bella')).toMatchObject({ name: 'Bella', downloaded: false });
    expect(answer.system).toEqual([{ voiceURI: 'com.apple.Samantha', name: 'Samantha', lang: 'en-US', default: true }]);
    expect(answer.selected).toEqual({ local: 'af_bella', system: null });
  });
});
