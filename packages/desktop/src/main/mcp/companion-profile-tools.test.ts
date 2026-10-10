import { COMPANION_SETTINGS_OFF_MESSAGE } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as uiBridge from '../companion/ui-bridge';
import {
  companionProfileDelete,
  companionProfileList,
  companionProfileSave,
  companionProfileSwitch,
} from './companion-tools';
import { MCP_HANDLERS } from './dispatch';
import { McpToolError } from './errors';
import { resetMcpAllowUiStateForTests, setMcpAllowCompanionSettingsState, setMcpAllowUiState } from './ui-gate';

/**
 * vitest: the `companion_profile_*` MCP handlers (Phase 109 Theme G) — the
 * `allowCompanionSettings` switch gating all four, the confirm wait a save or
 * a delete gets, and the answers passed through from the renderer. The
 * renderer half (`profiles.ts`, the in-app question) is
 * `app/features/companion/ui-requests-profiles.test.ts`'s.
 */

vi.mock('../companion/ui-bridge', () => ({
  requestUiAction: vi.fn(),
  UI_BRIDGE_TIMEOUT_MESSAGE: 'the window did not answer',
}));
vi.mock('../companion/tts-broker', () => ({ companionTtsModelOnDisk: vi.fn(() => true) }));

const requestUiAction = vi.mocked(uiBridge.requestUiAction);

beforeEach(() => {
  setMcpAllowCompanionSettingsState(true);
});

afterEach(() => {
  resetMcpAllowUiStateForTests();
  requestUiAction.mockReset();
});

async function refusal(promise: Promise<unknown>): Promise<McpToolError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(McpToolError);
  return error as McpToolError;
}

const narrator = {
  id: 'p1',
  name: 'Narrator',
  voices: { local: 'bm_george', system: null },
  personality: 'Measured.',
  honorifics: ['friend'],
  createdAt: '2026-10-10T09:00:00.000Z',
  active: true,
  modified: false,
};

describe('the allowCompanionSettings switch', () => {
  it('refuses all four profile tools, the list included, before any IPC', async () => {
    setMcpAllowCompanionSettingsState(false);
    setMcpAllowUiState(true);
    for (const call of [
      () => companionProfileList(),
      () => companionProfileSave({ name: 'Narrator' }),
      () => companionProfileSwitch({ name: 'Narrator' }),
      () => companionProfileDelete({ name: 'Narrator' }),
    ]) {
      const error = await refusal(call());
      expect(error).toMatchObject({ kind: 'refused', message: COMPANION_SETTINGS_OFF_MESSAGE });
    }
    expect(requestUiAction).not.toHaveBeenCalled();
  });

  it('is wired into MCP_HANDLERS', () => {
    expect(MCP_HANDLERS.companion_profile_list).toBe(companionProfileList);
    expect(MCP_HANDLERS.companion_profile_save).toBe(companionProfileSave);
    expect(MCP_HANDLERS.companion_profile_switch).toBe(companionProfileSwitch);
    expect(MCP_HANDLERS.companion_profile_delete).toBe(companionProfileDelete);
  });
});

describe('companion_profile_list', () => {
  it('answers with the renderer’s list, less the reply tag', async () => {
    requestUiAction.mockResolvedValue({
      ok: true,
      value: { did: 'profileList', profiles: [narrator], active: 'p1', max: 20, locked: false },
    });
    expect(await companionProfileList()).toEqual({ profiles: [narrator], active: 'p1', max: 20, locked: false });
    expect(requestUiAction).toHaveBeenCalledWith({ kind: 'profileList' });
  });
});

describe('the writes', () => {
  it('gives a save and a delete the prompt’s 30 s plus a grace, and a switch the default', async () => {
    requestUiAction.mockResolvedValueOnce({
      ok: true,
      value: { did: 'profileSave', status: 'applied', name: 'Narrator', overwritten: false, profile: narrator },
    });
    expect(await companionProfileSave({ name: 'Narrator' })).toEqual({
      status: 'applied',
      name: 'Narrator',
      overwritten: false,
      profile: narrator,
    });
    expect(requestUiAction).toHaveBeenLastCalledWith({ kind: 'profileSave', name: 'Narrator' }, { timeoutMs: 35_000 });

    requestUiAction.mockResolvedValueOnce({ ok: true, value: { did: 'profileDelete', status: 'declined', name: 'Narrator' } });
    expect(await companionProfileDelete({ name: 'Narrator' })).toEqual({ status: 'declined', name: 'Narrator' });
    expect(requestUiAction).toHaveBeenLastCalledWith({ kind: 'profileDelete', name: 'Narrator' }, { timeoutMs: 35_000 });

    requestUiAction.mockResolvedValueOnce({
      ok: true,
      value: { did: 'profileSwitch', status: 'applied', name: 'Narrator', profile: narrator },
    });
    expect(await companionProfileSwitch({ name: 'narrator' })).toMatchObject({ status: 'applied', name: 'Narrator' });
    expect(requestUiAction).toHaveBeenLastCalledWith({ kind: 'profileSwitch', name: 'narrator' }, {});
  });

  it('answers timeout when the backstop runs out on a delete — nothing applies after the renderer’s deadline', async () => {
    requestUiAction.mockResolvedValue({ ok: false, kind: 'error', message: 'the window did not answer' });
    expect(await companionProfileDelete({ name: 'Narrator' })).toEqual({ status: 'timeout', name: 'Narrator' });
  });

  it('refuses a switch whose window never answered — nobody was asked anything', async () => {
    requestUiAction.mockResolvedValue({ ok: false, kind: 'error', message: 'the window did not answer' });
    expect((await refusal(companionProfileSwitch({ name: 'Narrator' }))).kind).toBe('refused');
  });

  it('passes a refusal through as a status', async () => {
    requestUiAction.mockResolvedValue({
      ok: true,
      value: { did: 'profileSwitch', status: 'refused', name: 'Butler', reason: 'notFound', message: 'No Butler.' },
    });
    expect(await companionProfileSwitch({ name: 'Butler' })).toEqual({
      status: 'refused',
      name: 'Butler',
      reason: 'notFound',
      message: 'No Butler.',
    });
  });

  it('errors on a reply for a different tool', async () => {
    requestUiAction.mockResolvedValue({ ok: true, value: { did: 'profileList', profiles: [], active: null, max: 20, locked: false } });
    expect((await refusal(companionProfileSave({ name: 'Narrator' }))).kind).toBe('error');
  });
});
