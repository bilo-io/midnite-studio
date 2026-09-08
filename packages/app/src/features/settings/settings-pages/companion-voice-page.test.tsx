import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { CompanionPage } from './companion-page';

/**
 * Phase 79 Themes F and G — the halves of Settings ▸ Companion that Theme H
 * shipped as a placeholder and these themes filled in: the "Say hello"
 * preview, the locale filter, the volume slider, and the whole Microphone
 * section.
 *
 * Theme H's own `companion-page` coverage lives with its switches; this file
 * is deliberately separate so the two slices' tests cannot conflict.
 */

const speak = vi.fn();
vi.mock('../../companion/speaker', () => ({
  companionTtsSpeaker: {
    speak: (...args: unknown[]) => {
      speak(...args);
      return Promise.resolve();
    },
    cancel: vi.fn(),
    available: true,
    isSpeaking: () => false,
  },
}));

const applyVolume = vi.fn();
vi.mock('../../companion/audio/context', () => ({
  setCompanionVolume: (value: number) => applyVolume(value),
}));

const refreshMicAvailability = vi.fn().mockResolvedValue(true);
vi.mock('../../companion/voice-ports', () => ({
  refreshMicAvailability: () => refreshMicAvailability(),
}));

function installBridge(overrides: Partial<NonNullable<MidniteStudioBridge['companion']>> = {}) {
  const sttStatus = vi
    .fn()
    .mockResolvedValue({ configured: [] as string[], encryptionAvailable: true });
  const sttSet = vi.fn().mockResolvedValue({ ok: true });
  const sttTest = vi.fn().mockResolvedValue({ ok: true, value: { ms: 412, text: '' } });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    companion: { sttStatus, sttSet, sttTest, ...overrides },
  } as Partial<MidniteStudioBridge>;
  return { sttStatus, sttSet, sttTest };
}

/** macOS reports dozens; two of them in the app's language, one not. */
function installVoices(langs: string[]) {
  const voices = langs.map((lang, index) => ({
    voiceURI: `urn:voice:${index}`,
    name: `Voice ${index}`,
    lang,
    default: index === 0,
    localService: true,
  }));
  (window as unknown as { speechSynthesis: unknown }).speechSynthesis = {
    getVoices: () => voices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

beforeEach(() => {
  useUiStore.setState({
    companionEnabled: true,
    companionHonorific: '',
    companionVolume: 0.7,
    companionMicMode: 'push',
  });
  installVoices(['en-US', 'en-GB', 'de-DE']);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
});

describe('Settings ▸ Companion ▸ Voice (Theme F)', () => {
  it('speaks a greeting when Say hello is pressed', async () => {
    installBridge();
    render(<CompanionPage />);

    fireEvent.click(await screen.findByTestId('companion-say-hello'));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(String(speak.mock.calls[0]?.[0] ?? '')).not.toContain('{name}');
  });

  it('resolves the honorific into the preview', async () => {
    installBridge();
    useUiStore.setState({ companionHonorific: 'Ada' });
    render(<CompanionPage />);

    fireEvent.click(await screen.findByTestId('companion-say-hello'));
    expect(String(speak.mock.calls[0]?.[0] ?? '')).toContain('Ada');
  });

  it('cannot preview with the companion switched off', async () => {
    installBridge();
    useUiStore.setState({ companionEnabled: false });
    render(<CompanionPage />);
    expect((await screen.findByTestId('companion-say-hello')).hasAttribute('disabled')).toBe(true);
  });

  /*
    Filtered by default because macOS ships dozens of voices in languages the
    app does not speak — but escapable, because a bilingual user's preferred
    voice is a choice the locale cannot predict.
  */
  it('filters the voice list to the app locale, with a Show all escape', async () => {
    installBridge();
    render(<CompanionPage />);

    const select = (await screen.findByTestId('companion-voice')) as HTMLSelectElement;
    // Two English voices plus the "System default" row; the German one is out.
    expect(select.querySelectorAll('option')).toHaveLength(3);

    fireEvent.click(screen.getByTestId('companion-show-all-voices'));
    expect(select.querySelectorAll('option')).toHaveLength(4);
  });

  it('shows every voice when none match the locale, rather than an empty list', async () => {
    installBridge();
    installVoices(['de-DE', 'fr-FR']);
    render(<CompanionPage />);

    const select = (await screen.findByTestId('companion-voice')) as HTMLSelectElement;
    expect(select.querySelectorAll('option')).toHaveLength(3);
    // Nothing to escape from, so no toggle is offered.
    expect(screen.queryByTestId('companion-show-all-voices')).toBeNull();
  });
});

describe('Settings ▸ Companion ▸ Companion volume (Theme G)', () => {
  it('persists the slider and pushes it at the live master gain', async () => {
    installBridge();
    render(<CompanionPage />);

    const slider = await screen.findByTestId('companion-volume');
    fireEvent.change(slider, { target: { value: '40' } });

    expect(useUiStore.getState().companionVolume).toBeCloseTo(0.4, 5);
    await waitFor(() => expect(applyVolume).toHaveBeenCalledWith(0.4));
  });

  it('applies the persisted volume on mount, not only on change', async () => {
    installBridge();
    useUiStore.setState({ companionVolume: 0.25 });
    render(<CompanionPage />);
    await waitFor(() => expect(applyVolume).toHaveBeenCalledWith(0.25));
  });
});

describe('Settings ▸ Companion ▸ Microphone (Theme F)', () => {
  it('reads whether a key is stored on mount', async () => {
    const b = installBridge();
    render(<CompanionPage />);
    await waitFor(() => expect(b.sttStatus).toHaveBeenCalledTimes(1));
    expect((await screen.findByTestId('companion-stt-stored')).textContent).toContain(
      'No key stored',
    );
  });

  it('lists every provider id, the reserved one included', async () => {
    installBridge();
    render(<CompanionPage />);
    const select = (await screen.findByTestId('companion-stt-provider')) as HTMLSelectElement;
    expect([...select.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'OpenAI Whisper',
      'Deepgram (not yet implemented)',
    ]);
  });

  it('sends the key one way and clears the field, never reading it back', async () => {
    const b = installBridge();
    render(<CompanionPage />);

    const field = (await screen.findByTestId('companion-stt-key')) as HTMLInputElement;
    // A password input, so a screenshot or a shoulder cannot read it either.
    expect(field.type).toBe('password');
    fireEvent.change(field, { target: { value: 'sk-secret' } });
    fireEvent.click(screen.getByTestId('companion-stt-save'));

    await waitFor(() =>
      expect(b.sttSet).toHaveBeenCalledWith({ providerId: 'openai-whisper', key: 'sk-secret' }),
    );
    // Emptied immediately: there is no channel that could refill it, and a
    // field that kept a secret on screen is one a screenshot leaks.
    await waitFor(() => expect(field.value).toBe(''));
    expect(await screen.findByTestId('companion-stt-status')).toBeTruthy();
  });

  it('invalidates the panel\'s cached mic availability after a save', async () => {
    installBridge();
    render(<CompanionPage />);
    fireEvent.change(await screen.findByTestId('companion-stt-key'), {
      target: { value: 'sk-secret' },
    });
    fireEvent.click(screen.getByTestId('companion-stt-save'));
    await waitFor(() => expect(refreshMicAvailability).toHaveBeenCalledTimes(1));
  });

  it('reports an empty save as a clear, which is the same gesture', async () => {
    const b = installBridge();
    render(<CompanionPage />);
    fireEvent.click(await screen.findByTestId('companion-stt-save'));

    await waitFor(() =>
      expect(b.sttSet).toHaveBeenCalledWith({ providerId: 'openai-whisper', key: '' }),
    );
    expect((await screen.findByTestId('companion-stt-status')).textContent).toContain('cleared');
  });

  it('will not Test before a key is stored', async () => {
    installBridge();
    render(<CompanionPage />);
    expect((await screen.findByTestId('companion-stt-test')).hasAttribute('disabled')).toBe(true);
  });

  /*
    An empty transcript is a *pass*: the point of the Test button is the
    401/429/DNS failure it rules out, not what a second of silence says.
  */
  it('reports the round-trip time on a successful test', async () => {
    installBridge({
      sttStatus: vi
        .fn()
        .mockResolvedValue({ configured: ['openai-whisper'], encryptionAvailable: true }),
    } as Partial<NonNullable<MidniteStudioBridge['companion']>>);
    render(<CompanionPage />);

    const test = await screen.findByTestId('companion-stt-test');
    await waitFor(() => expect(test.hasAttribute('disabled')).toBe(false));
    fireEvent.click(test);
    expect((await screen.findByTestId('companion-stt-status')).textContent).toContain('412 ms');
  });

  it('surfaces a failed test as the provider\'s own sentence', async () => {
    installBridge({
      sttStatus: vi
        .fn()
        .mockResolvedValue({ configured: ['openai-whisper'], encryptionAvailable: true }),
      sttTest: vi.fn().mockResolvedValue({
        ok: false,
        kind: 'error',
        message: 'The transcription service rejected the key. Check the key in Settings.',
      }),
    } as Partial<NonNullable<MidniteStudioBridge['companion']>>);
    render(<CompanionPage />);

    const test = await screen.findByTestId('companion-stt-test');
    await waitFor(() => expect(test.hasAttribute('disabled')).toBe(false));
    fireEvent.click(test);
    expect((await screen.findByRole('alert')).textContent).toContain('rejected the key');
  });

  it('warns when the machine has no working keychain', async () => {
    installBridge({
      sttStatus: vi.fn().mockResolvedValue({ configured: [], encryptionAvailable: false }),
    } as Partial<NonNullable<MidniteStudioBridge['companion']>>);
    render(<CompanionPage />);
    expect(await screen.findByText(/no working keychain/)).toBeTruthy();
  });

  it('persists the hold-or-tap choice', async () => {
    installBridge();
    render(<CompanionPage />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Tap to toggle' }));
    expect(useUiStore.getState().companionMicMode).toBe('toggle');
  });

  it('degrades to no controls at all with no bridge', async () => {
    render(<CompanionPage />);
    // The section still renders; nothing throws and the Test stays disabled.
    expect((await screen.findByTestId('companion-stt-test')).hasAttribute('disabled')).toBe(true);
  });
});
