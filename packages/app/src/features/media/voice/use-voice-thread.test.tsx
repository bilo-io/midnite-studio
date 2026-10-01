import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { appendDictation, useVoiceThread } from './use-voice-thread';
import { SpeechToggle } from './voice-controls';

const speaker = () => ({ speak: vi.fn().mockResolvedValue(undefined), cancel: vi.fn() });

beforeEach(() => useUiStore.setState({ mediaSpeechOn: false }));
afterEach(cleanup);

describe('useVoiceThread', () => {
  it('defaults speech off and stays silent', () => {
    const s = speaker();
    const { result } = renderHook(() => useVoiceThread(s));
    expect(result.current.speechOn).toBe(false);
    act(() => result.current.speakReply('Hello there.'));
    expect(s.speak).not.toHaveBeenCalled();
  });

  it('speaks a simplified reply once speech is on, and silences when turned off', () => {
    const s = speaker();
    const { result } = renderHook(() => useVoiceThread(s));
    act(() => result.current.setSpeechOn(true));
    act(() => result.current.speakReply('**Done.**\n```\nbig code\n```'));
    const spoken = s.speak.mock.calls[0]?.[0] as string;
    expect(spoken).toContain('Done.');
    expect(spoken).not.toContain('big code');
    s.cancel.mockClear();
    act(() => result.current.setSpeechOn(false));
    expect(s.cancel).toHaveBeenCalled();
  });
});

describe('SpeechToggle', () => {
  it('flips the persisted setting', () => {
    function Host() {
      return <SpeechToggle voice={useVoiceThread(speaker())} />;
    }
    render(<Host />);
    const toggle = screen.getByRole('button', { name: 'Speak replies aloud' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(useUiStore.getState().mediaSpeechOn).toBe(true);
  });
});

describe('appendDictation', () => {
  it('joins onto a draft', () => {
    expect(appendDictation('', 'a fox')).toBe('a fox');
    expect(appendDictation('red ', 'fox')).toBe('red fox');
  });
});
