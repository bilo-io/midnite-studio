import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { sanitizeForSpeech } from '@midnite/studio-shared';
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
const retryLocalVoice = vi.fn();
/** Mutable so a test can start the renderer already fallen back to `'system'`. */
let mockActiveEngine: 'local' | 'system' = 'local';
vi.mock('../../companion/speaker', () => ({
  companionTtsSpeaker: {
    speak: (...args: unknown[]) => {
      speak(...args);
      return Promise.resolve();
    },
    cancel: vi.fn(),
    available: true,
    isSpeaking: () => false,
    get activeEngine() {
      return mockActiveEngine;
    },
    retryLocalVoice: () => {
      retryLocalVoice();
      mockActiveEngine = 'local';
    },
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
    .mockResolvedValue({ configured: [] as string[], encryptionAvailable: true, implemented: ['openai-whisper'] });
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
    companionNames: ['Companion'],
    companionVolume: 0.7,
    companionMicMode: 'push',
  });
  installVoices(['en-US', 'en-GB', 'de-DE']);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockActiveEngine = 'local';
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
   * Phase 80 Theme A — sanitizeForSpeech sits in the concierge's own
   * `sayMarkdown` path, not in this preview's direct `speaker.speak` call, so
   * this isn't new coverage of the transform. It's a non-regression check:
   * the greeting phrase bank never contains a SHA, a path or a URL, so
   * running it through sanitizeForSpeech must be a no-op.
   */
  it('leaves the Say hello preview untouched by sanitizeForSpeech (no machine-facing tokens to redact)', async () => {
    installBridge();
    render(<CompanionPage />);

    fireEvent.click(await screen.findByTestId('companion-say-hello'));
    const spoken = String(speak.mock.calls[0]?.[0] ?? '');
    expect(sanitizeForSpeech(spoken)).toBe(spoken);
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

  // Phase 80 Theme C — a non-regression check, not new coverage of the local
  // engine itself (which is unit-tested against `speaker.ts` directly): the
  // page still explains the local-voice-first, system-voice-fallback
  // behaviour, and the picker's own label now says so is the fallback.
  it('explains the local-voice-first fallback beside the (now fallback) voice picker', async () => {
    installBridge();
    render(<CompanionPage />);

    // `findByText`/`getByText` throw when nothing matches — reaching the
    // assertion is the proof either exists.
    await screen.findByText(/bundled offline voice.*falling back automatically/i);
    expect(screen.getByText('Speaking voice (fallback)')).not.toBeNull();
  });
});

/**
 * Phase 80 Theme C follow-up — Findings 1 and 2 from the user complaint this
 * addressed: the local voice engaged invisibly (no status, no download
 * indicator, no diagnosis) and "Say hello" could be unreachable on a machine
 * that also happened to report zero system voices, even with the local
 * engine ready.
 */
/** No jest-dom matchers registered in this project's vitest setup — plain `.textContent`. */
const textOf = (el: HTMLElement): string => el.textContent ?? '';

describe('Settings ▸ Companion ▸ Voice status (Phase 80 Theme C follow-up)', () => {
  it('shows a checking message before the status check resolves', async () => {
    installBridge(); // no ttsStatus at all — the same shape an older preload has
    render(<CompanionPage />);
    expect(textOf(await screen.findByTestId('companion-voice-status'))).toMatch(
      /checking the local offline voice/i,
    );
  });

  it('checks status exactly once on mount', async () => {
    const ttsStatus = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { engine: 'local', voice: 'ready', reason: null, message: null } });
    installBridge({ ttsStatus });
    render(<CompanionPage />);
    await screen.findByTestId('companion-voice-status');
    expect(ttsStatus).toHaveBeenCalledTimes(1);
    expect(ttsStatus).toHaveBeenCalledWith({ retry: false });
  });

  it('reports speaking with the local voice when it is ready and active', async () => {
    installBridge({
      ttsStatus: vi
        .fn()
        .mockResolvedValue({ ok: true, value: { engine: 'local', voice: 'ready', reason: null, message: null } }),
    });
    render(<CompanionPage />);

    await waitFor(() =>
      expect(textOf(screen.getByTestId('companion-voice-status'))).toMatch(
        /speaking with the local offline voice/i,
      ),
    );
    expect(screen.queryByTestId('companion-voice-retry')).toBeNull();
  });

  it('shows the one-time download in progress', async () => {
    installBridge({
      ttsStatus: vi
        .fn()
        .mockResolvedValue({ ok: true, value: { engine: 'system', voice: 'downloading', reason: null, message: null } }),
    });
    render(<CompanionPage />);

    await waitFor(() =>
      expect(textOf(screen.getByTestId('companion-voice-status'))).toMatch(
        /downloading the local offline voice.*88 mb/i,
      ),
    );
  });

  it('explains a missing native module, with no retry (nothing to retry)', async () => {
    installBridge({
      ttsStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          engine: 'system',
          voice: 'failed',
          reason: 'native-module-missing',
          message: 'no prebuilt binary for this platform',
        },
      }),
    });
    render(<CompanionPage />);

    await waitFor(() =>
      expect(textOf(screen.getByTestId('companion-voice-status'))).toMatch(
        /isn't available on this machine/i,
      ),
    );
    expect(textOf(screen.getByTestId('companion-voice-status'))).toMatch(
      /no prebuilt binary for this platform/,
    );
    expect(screen.queryByTestId('companion-voice-retry')).toBeNull();
  });

  it('offers Retry for a failed download, and Retry re-checks status and resets the renderer fallback', async () => {
    const ttsStatus = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: { engine: 'system', voice: 'failed', reason: 'download-failed', message: 'offline' },
      })
      .mockResolvedValue({ ok: true, value: { engine: 'local', voice: 'ready', reason: null, message: null } });
    mockActiveEngine = 'system'; // this session already fell back once
    installBridge({ ttsStatus });
    render(<CompanionPage />);

    await waitFor(() =>
      expect(textOf(screen.getByTestId('companion-voice-status'))).toMatch(
        /could not download the local voice/i,
      ),
    );
    expect(textOf(screen.getByTestId('companion-voice-status'))).toMatch(/offline/);
    expect(textOf(screen.getByTestId('companion-say-hello-engine'))).toMatch(
      /say hello uses the system voice/i,
    );

    fireEvent.click(screen.getByTestId('companion-voice-retry'));

    expect(retryLocalVoice).toHaveBeenCalledTimes(1);
    // Resetting the sticky fallback is synchronous and reflected immediately,
    // ahead of the status re-check resolving.
    expect(textOf(screen.getByTestId('companion-say-hello-engine'))).toMatch(
      /say hello uses the local offline voice/i,
    );
    await waitFor(() => expect(ttsStatus).toHaveBeenLastCalledWith({ retry: true }));
    await waitFor(() =>
      expect(textOf(screen.getByTestId('companion-voice-status'))).toMatch(
        /speaking with the local offline voice/i,
      ),
    );
  });

  it('offers Retry when main is ready but this session already switched to the system voice', async () => {
    mockActiveEngine = 'system';
    installBridge({
      ttsStatus: vi
        .fn()
        .mockResolvedValue({ ok: true, value: { engine: 'local', voice: 'ready', reason: null, message: null } }),
    });
    render(<CompanionPage />);

    await waitFor(() =>
      expect(textOf(screen.getByTestId('companion-voice-status'))).toMatch(
        /already switched to the system voice/i,
      ),
    );
    expect(screen.getByTestId('companion-voice-retry')).not.toBeNull();
  });

  it('does not disable Say hello for zero system voices once the local voice is ready (Finding 2)', async () => {
    installVoices([]); // a machine reporting no speechSynthesis voices at all
    installBridge({
      ttsStatus: vi
        .fn()
        .mockResolvedValue({ ok: true, value: { engine: 'local', voice: 'ready', reason: null, message: null } }),
    });
    render(<CompanionPage />);

    await screen.findByTestId('companion-voice-status');
    expect((await screen.findByTestId('companion-say-hello')).hasAttribute('disabled')).toBe(false);
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
        .mockResolvedValue({ configured: ['openai-whisper'], encryptionAvailable: true, implemented: ['openai-whisper'] }),
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
        .mockResolvedValue({ configured: ['openai-whisper'], encryptionAvailable: true, implemented: ['openai-whisper'] }),
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
      sttStatus: vi.fn().mockResolvedValue({ configured: [], encryptionAvailable: false, implemented: ['openai-whisper'] }),
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

describe('Settings ▸ Companion ▸ Personality — name pills (Theme D)', () => {
  it('starts with the fresh-install default name as a single pill', async () => {
    installBridge();
    render(<CompanionPage />);
    const pills = await screen.findByTestId('companion-names-pills');
    expect(pills.textContent).toContain('Companion');
  });

  it('commits a typed name as a pill on Enter and clears the field', async () => {
    installBridge();
    render(<CompanionPage />);

    const input = await screen.findByTestId('companion-names-input');
    fireEvent.change(input, { target: { value: 'Jarvis' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useUiStore.getState().companionNames).toEqual(['Companion', 'Jarvis']);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('rejects a duplicate name (case-insensitively) with an inline message, not a silent no-op', async () => {
    installBridge();
    render(<CompanionPage />);

    const input = await screen.findByTestId('companion-names-input');
    fireEvent.change(input, { target: { value: 'companion' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useUiStore.getState().companionNames).toEqual(['Companion']);
    expect(await screen.findByText(/already one of its names/)).toBeTruthy();
  });

  it('deletes the most-recently-added pill on Backspace in an empty field', async () => {
    installBridge();
    useUiStore.setState({ companionNames: ['Companion', 'Jarvis'] });
    render(<CompanionPage />);

    const input = await screen.findByTestId('companion-names-input');
    fireEvent.keyDown(input, { key: 'Backspace' });

    expect(useUiStore.getState().companionNames).toEqual(['Companion']);
  });

  it('gives each pill\'s remove control a name-specific accessible label', async () => {
    installBridge();
    useUiStore.setState({ companionNames: ['Companion', 'Jarvis'] });
    render(<CompanionPage />);

    expect(await screen.findByRole('button', { name: /Remove "Companion"/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Remove "Jarvis"/ })).toBeTruthy();
  });

  it('blocks deleting the last remaining pill rather than silently backfilling a default', async () => {
    installBridge();
    useUiStore.setState({ companionNames: ['Companion'] });
    render(<CompanionPage />);

    const remove = await screen.findByRole('button', { name: /Remove "Companion"/ });
    expect(remove.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(remove);
    expect(useUiStore.getState().companionNames).toEqual(['Companion']);

    // Backspace-to-delete-last is blocked the same way.
    const input = await screen.findByTestId('companion-names-input');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(useUiStore.getState().companionNames).toEqual(['Companion']);
  });
});
