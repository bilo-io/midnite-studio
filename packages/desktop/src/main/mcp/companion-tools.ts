import {
  COMPANION_PROFILE_CONFIRM_TIMEOUT_MS,
  COMPANION_SETTINGS_OFF_MESSAGE,
  companionSettingSetTimeoutMs,
  describeCompanionLocalVoices,
  describeCompanionSettings,
  type CompanionProfileOpOutput,
  type CompanionUiAction,
  type CompanionUiReplyResult,
  type McpToolInput,
  type McpToolOutput,
} from '@midnite/studio-shared';

import { companionTtsModelOnDisk } from '../companion/tts-broker';
import { requestUiAction, UI_BRIDGE_TIMEOUT_MESSAGE } from '../companion/ui-bridge';
import { McpToolError } from './errors';
import { getMcpAllowCompanionSettings } from './ui-gate';

/**
 * The `companion_*` tools on the `midnite` MCP server (Phase 109 Theme D).
 *
 * Companion settings are renderer-owned, so every handler here is a round
 * trip through `ui-bridge.ts` to the main window's `ui-requests.ts`, which
 * calls `settings-apply.ts` — the same setter the companion's own voice and
 * the Settings page write through. Nothing here checks a tier, a guard or a
 * value: main cannot be talked into a different table than the renderer
 * enforces. What main does own is the gate and the wait:
 *
 * - **One switch, the whole family.** `allowCompanionSettings` refuses every
 *   tool here, reads included, before any IPC is sent (Decision 13).
 * - **A confirm-tier change waits for a person.** `companionSettingSetTimeoutMs`
 *   gives that one request the renderer's 30 s prompt plus a grace, instead of
 *   the bridge's 5 s; if even the grace runs out the answer is `timeout`, and
 *   the renderer's own deadline means nothing applies after it.
 */

/** `ui-bridge.ts`'s failures — no window, or a window that never answered — as the uniform MCP refusal `tools.ts` uses for the `ui.*` trio. */
function refuseIfFailed(result: CompanionUiReplyResult): asserts result is Extract<CompanionUiReplyResult, { ok: true }> {
  if (result.ok) return;
  throw new McpToolError('refused', result.kind === 'error' ? result.message : 'refused');
}

function requireSwitch(): void {
  if (!getMcpAllowCompanionSettings()) throw new McpToolError('refused', COMPANION_SETTINGS_OFF_MESSAGE);
}

export async function companionSettingsGet(): Promise<McpToolOutput<'companion_settings_get'>> {
  requireSwitch();
  const result = await requestUiAction({ kind: 'settingsState' });
  refuseIfFailed(result);
  if (result.value.did !== 'settingsState') {
    throw new McpToolError('error', 'unexpected reply shape for companion_settings_get');
  }
  return describeCompanionSettings(result.value.values, result.value.locked);
}

export async function companionSettingsSet(
  input: McpToolInput<'companion_settings_set'>,
): Promise<McpToolOutput<'companion_settings_set'>> {
  requireSwitch();
  const timeoutMs = companionSettingSetTimeoutMs(input.key, input.value);
  const result = await requestUiAction(
    { kind: 'setting', key: input.key, value: input.value },
    timeoutMs === undefined ? {} : { timeoutMs },
  );

  // The backstop fired: the renderer never answered even its own prompt's
  // deadline. Its wall-clock check means nothing applies after that deadline,
  // so this is the same `timeout` the renderer would have sent.
  if (!result.ok && timeoutMs !== undefined && result.kind === 'error' && result.message === UI_BRIDGE_TIMEOUT_MESSAGE) {
    return { status: 'timeout', key: input.key };
  }
  refuseIfFailed(result);
  if (result.value.did !== 'setting') {
    throw new McpToolError('error', 'unexpected reply shape for companion_settings_set');
  }
  const { did: _did, ...answer } = result.value;
  return answer;
}

export async function companionVoicesList(): Promise<McpToolOutput<'companion_voices_list'>> {
  requireSwitch();
  const result = await requestUiAction({ kind: 'voices' });
  refuseIfFailed(result);
  if (result.value.did !== 'voices') {
    throw new McpToolError('error', 'unexpected reply shape for companion_voices_list');
  }
  return {
    local: describeCompanionLocalVoices(companionTtsModelOnDisk()),
    system: result.value.system,
    selected: result.value.selected,
  };
}

// --- companion_profile_* (Phase 109 Theme G) ----------------------------------------

export async function companionProfileList(): Promise<McpToolOutput<'companion_profile_list'>> {
  requireSwitch();
  const result = await requestUiAction({ kind: 'profileList' });
  refuseIfFailed(result);
  if (result.value.did !== 'profileList') {
    throw new McpToolError('error', 'unexpected reply shape for companion_profile_list');
  }
  const { did: _did, ...answer } = result.value;
  return answer;
}

type ProfileWrite = Extract<CompanionUiAction, { kind: 'profileSave' | 'profileSwitch' | 'profileDelete' }>['kind'];

/**
 * One profile write. A save or a delete may wait on the user (a delete
 * always asks; a save asks when the name is taken, which only the renderer
 * knows), so both get the prompt's wait plus its grace; a switch is direct.
 */
async function profileWrite(kind: ProfileWrite, name: string, tool: string): Promise<CompanionProfileOpOutput> {
  requireSwitch();
  const waits = kind !== 'profileSwitch';
  const result = await requestUiAction(
    { kind, name },
    waits ? { timeoutMs: COMPANION_PROFILE_CONFIRM_TIMEOUT_MS } : {},
  );
  // The backstop fired with the user's question open: nothing applies after
  // the renderer's own deadline, so this is the `timeout` it would have sent.
  if (!result.ok && waits && result.kind === 'error' && result.message === UI_BRIDGE_TIMEOUT_MESSAGE) {
    return { status: 'timeout', name };
  }
  refuseIfFailed(result);
  if (result.value.did !== kind) {
    throw new McpToolError('error', `unexpected reply shape for ${tool}`);
  }
  const { did: _did, ...answer } = result.value;
  return answer;
}

export function companionProfileSave(
  input: McpToolInput<'companion_profile_save'>,
): Promise<McpToolOutput<'companion_profile_save'>> {
  return profileWrite('profileSave', input.name, 'companion_profile_save');
}

export function companionProfileSwitch(
  input: McpToolInput<'companion_profile_switch'>,
): Promise<McpToolOutput<'companion_profile_switch'>> {
  return profileWrite('profileSwitch', input.name, 'companion_profile_switch');
}

export function companionProfileDelete(
  input: McpToolInput<'companion_profile_delete'>,
): Promise<McpToolOutput<'companion_profile_delete'>> {
  return profileWrite('profileDelete', input.name, 'companion_profile_delete');
}
