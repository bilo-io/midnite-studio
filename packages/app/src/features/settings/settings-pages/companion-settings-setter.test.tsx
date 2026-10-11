import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import {
  lastCompanionSettingChange,
  resetCompanionSettingUndoForTest,
  undoLastCompanionSetting,
} from '../../companion/settings-apply';
import { CompanionPage } from './companion-page';

/**
 * Phase 109 Theme B — Settings ▸ Companion writes through the one companion
 * setter. The proof is the undo slot: only `applyCompanionSetting` fills it,
 * so a control whose change lands there went through the setter, and "undo
 * that" can reach a change made on this page.
 */

vi.mock('../../companion/speaker', () => ({
  companionTtsSpeaker: {
    speak: () => Promise.resolve(),
    speakWithEngine: () => Promise.resolve(true),
    cancel: vi.fn(),
    available: true,
    isSpeaking: () => false,
    activeEngine: 'local',
    retryLocalVoice: vi.fn(),
    reloadLocalVoice: vi.fn(),
  },
}));

vi.mock('../../companion/voice-ports', () => ({
  refreshMicAvailability: () => Promise.resolve(true),
}));

function installBridge(configured: string[] = []): void {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    companion: {
      sttStatus: vi.fn().mockResolvedValue({
        configured,
        encryptionAvailable: true,
        implemented: ['whisper-local', 'openai-whisper'],
        localModel: { state: 'ready', reason: null, message: null },
      }),
    },
  } as unknown as Partial<MidniteStudioBridge>;
}

beforeEach(() => {
  useUiStore.setState({
    companionEnabled: true,
    companionMusicOffer: true,
    companionNames: ['Companion'],
    companionHonorifics: [],
    companionSttProvider: null,
    voiceConversation: false,
    voiceConversationTrigger: 'always',
    screensaverLocked: false,
  });
  resetCompanionSettingUndoForTest();
  installBridge();
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('Settings ▸ Companion through applyCompanionSetting (Phase 109 Theme B)', () => {
  it('a switch on the page lands in the undo slot as a page change, and undo puts it back', async () => {
    render(<CompanionPage />);
    fireEvent.click(await screen.findByTestId('companion-music-offer'));

    expect(useUiStore.getState().companionMusicOffer).toBe(false);
    expect(lastCompanionSettingChange()).toMatchObject({ keys: ['companionMusicOffer'], source: 'page' });

    expect(undoLastCompanionSetting()).toMatchObject({ ok: true });
    expect(useUiStore.getState().companionMusicOffer).toBe(true);
  });

  it('a page write is refused while the screen is locked, and the switch shows the stored value', async () => {
    useUiStore.setState({ screensaverLocked: true });
    render(<CompanionPage />);
    const toggle = (await screen.findByTestId('companion-music-offer')) as HTMLInputElement;
    fireEvent.click(toggle);

    expect(useUiStore.getState().companionMusicOffer).toBe(true);
    expect(toggle.checked).toBe(true);
    expect(lastCompanionSettingChange()).toBeNull();
  });

  it('choosing a conversation mode is one change: undo restores both the switch and its trigger', async () => {
    render(<CompanionPage />);
    const group = await screen.findByRole('radiogroup', { name: 'Conversation mode' });
    const wake = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).find(
      (el) => el.textContent === 'Wake word',
    );
    fireEvent.click(wake!);

    expect(useUiStore.getState()).toMatchObject({ voiceConversation: true, voiceConversationTrigger: 'wake' });
    expect(lastCompanionSettingChange()?.keys.sort()).toEqual(['voiceConversation', 'voiceConversationTrigger']);

    undoLastCompanionSetting();
    expect(useUiStore.getState()).toMatchObject({ voiceConversation: false, voiceConversationTrigger: 'always' });
  });

  it('a name pill goes through the setter too', async () => {
    render(<CompanionPage />);
    const input = await screen.findByTestId('companion-names-input');
    fireEvent.change(input, { target: { value: 'Nova' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useUiStore.getState().companionNames).toEqual(['Companion', 'Nova']);
    expect(lastCompanionSettingChange()).toMatchObject({ keys: ['companionNames'], source: 'page' });
  });
});

describe('Settings ▸ Companion ▸ Microphone ▸ Provider, persisted (Phase 109 Theme B)', () => {
  it('shows what automatic resolves to — offline Whisper with no cloud key stored', async () => {
    render(<CompanionPage />);
    const select = (await screen.findByTestId('companion-stt-provider')) as HTMLSelectElement;
    expect(select.value).toBe('whisper-local');
    expect(useUiStore.getState().companionSttProvider).toBeNull();
  });

  it('shows the single stored cloud key as the automatic choice, as main resolves it', async () => {
    installBridge(['openai-whisper']);
    render(<CompanionPage />);
    const select = (await screen.findByTestId('companion-stt-provider')) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('openai-whisper'));
  });

  it('persists a picked provider in the store, so it survives a reload', async () => {
    render(<CompanionPage />);
    fireEvent.change(await screen.findByTestId('companion-stt-provider'), {
      target: { value: 'openai-whisper' },
    });

    expect(useUiStore.getState().companionSttProvider).toBe('openai-whisper');
    cleanup();
    render(<CompanionPage />);
    expect(((await screen.findByTestId('companion-stt-provider')) as HTMLSelectElement).value).toBe(
      'openai-whisper',
    );
  });
});

describe('"Try: …" hints (Phase 109 Theme C)', () => {
  it('puts the spec\'s example under each control the companion can change by voice', async () => {
    render(<CompanionPage />);
    expect((await screen.findByTestId('companion-try-companionVoices.local')).textContent).toBe('Try: “use voice Bella”');
    expect(screen.getByTestId('companion-try-companionVolume').textContent).toBe('Try: “volume 50”');
    expect(screen.getByTestId('companion-try-companionSpeakAloud').textContent).toBe('Try: “stop talking out loud”');
    expect(screen.getByTestId('companion-try-companionNames').textContent).toBe('Try: “I\'ll call you Nova”');
    expect(screen.getByTestId('companion-try-companionHonorifics').textContent).toBe('Try: “call me boss”');
    expect(screen.getByTestId('companion-try-companionMusicOffer').textContent).toBe('Try: “turn elevator music off”');
    expect(screen.getByTestId('companion-try-companionMicMode').textContent).toBe('Try: “push to talk”');
    expect(screen.getByTestId('companion-try-voiceConversation').textContent).toBe('Try: “conversation mode on”');
  });

  it('gives a never-tier control no hint', async () => {
    render(<CompanionPage />);
    await screen.findByTestId('companion-try-companionVolume');
    for (const key of ['companionEnabled', 'companionSttEngine', 'companionSttProvider', 'companionHandsFree']) {
      expect(screen.queryByTestId(`companion-try-${key}`)).toBeNull();
    }
  });

  it('points personality and About me at the interview, never at dictation (Phase 109 Theme H)', async () => {
    render(<CompanionPage />);
    expect((await screen.findByTestId('companion-try-companionPersonality')).textContent).toBe('Try: “tune yourself”');
    expect(screen.getByTestId('companion-try-companionAboutUser').textContent).toBe('Try: “let me tell you about me”');
  });

  it('promises nothing a later theme has yet to teach it — the active profile', async () => {
    render(<CompanionPage />);
    await screen.findByTestId('companion-try-companionVolume');
    expect(screen.queryByTestId('companion-try-companionActiveProfile')).toBeNull();
  });
});
