/**
 * Vitest/jsdom: the shared AI-thread components. No browser capability needed —
 * class toggling, DOM text and callbacks only.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCompanionPorts, resetCompanionPorts } from '../../features/companion/companion-ports';
import { __setConversationDepsForTest, conversationOwner } from '../../features/companion/conversation';

/*
  Pass-through: the real `setNextTranscriptSink`, plus a copy of the sink a
  held press installs — the only way to deliver a push-to-talk transcript here
  without a microphone, since `voice-ports.ts` keeps its delivery internal.
*/
const pushSink = vi.hoisted(() => ({ current: null as ((text: string) => void) | null }));
vi.mock('../../features/companion/voice-ports', async () => {
  const actual = await vi.importActual<typeof import('../../features/companion/voice-ports')>(
    '../../features/companion/voice-ports',
  );
  return {
    ...actual,
    setNextTranscriptSink: (sink: ((text: string) => void) | null) => {
      pushSink.current = sink;
      actual.setNextTranscriptSink(sink);
    },
  };
});
import { useUiStore } from '../../store/ui-store';
import { AiComposer } from './ai-composer';
import { ThinkingIndicator } from './thinking-indicator';
import { AiThreadFrame } from './thread-frame';
import { useComposerMic } from './use-composer-mic';

afterEach(() => {
  cleanup();
  resetCompanionPorts();
  vi.useRealTimers();
});

describe('ThinkingIndicator', () => {
  beforeEach(() => useUiStore.setState({ aiThinkingStyle: 'spinner' }));

  it('defaults to a spinner left of the text', () => {
    render(<ThinkingIndicator />);
    const root = screen.getByTestId('thinking-indicator');
    expect(root.dataset.style).toBe('spinner');
    expect(screen.getByTestId('thinking-spinner')).toBeTruthy();
    expect(root.textContent).toContain('Thinking…');
    expect(root.firstElementChild).toBe(screen.getByTestId('thinking-spinner'));
  });

  it('renders animated dots for ellipsis', () => {
    useUiStore.setState({ aiThinkingStyle: 'ellipsis' });
    render(<ThinkingIndicator />);
    expect(screen.getByTestId('thinking-dots')).toBeTruthy();
    expect(screen.queryByTestId('thinking-spinner')).toBeNull();
  });

  it('cycles Claude glyphs', () => {
    vi.useFakeTimers();
    useUiStore.setState({ aiThinkingStyle: 'claude' });
    render(<ThinkingIndicator />);
    const first = screen.getByTestId('thinking-glyph').textContent;
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('thinking-glyph').textContent).not.toBe(first);
  });

  it('lets a caller pin the style', () => {
    render(<ThinkingIndicator style="claude" />);
    expect(screen.getByTestId('thinking-indicator').dataset.style).toBe('claude');
  });
});

describe('AiThreadFrame', () => {
  it('wears the Loops gradient frame only while loading', () => {
    const { rerender } = render(<AiThreadFrame loading={false} testId="f">x</AiThreadFrame>);
    const el = screen.getByTestId('f');
    expect(el.className).not.toContain('gradient-frame');
    rerender(<AiThreadFrame loading testId="f">x</AiThreadFrame>);
    expect(screen.getByTestId('f').className).toContain('gradient-frame');
    expect(screen.getByTestId('f').dataset.loopState).toBe('thinking');
    expect(screen.getByTestId('f').dataset.loopsRunning).toBe('true');
  });
});

function Harness({ onSend, onTranscript }: { onSend: () => void; onTranscript?: (t: string) => void }) {
  const mic = useComposerMic(onTranscript ? { onTranscript } : {});
  return (
    <AiComposer value="hi" onChange={() => {}} onSend={onSend} canSend ariaLabel="Prompt" mic={mic} trailing={<i data-testid="extra" />} />
  );
}

describe('AiComposer', () => {
  it('sends on click and on Enter, and renders the trailing slot', () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    fireEvent.click(screen.getByTestId('ai-composer-send'));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Prompt' }), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('extra')).toBeTruthy();
  });

  it('renders Mic bottom-left and Send bottom-right, inside the box', () => {
    render(<Harness onSend={() => {}} />);
    const controls = screen.getByTestId('ai-composer-controls');
    const box = screen.getByTestId('ai-composer-input').closest('.gradient-border')!;
    expect(box.contains(controls)).toBe(true);
    expect(controls.contains(screen.getByTestId('ai-composer-mic'))).toBe(true);
    expect(controls.contains(screen.getByTestId('ai-composer-send'))).toBe(true);
    // Mic first, Send last — the spacer between them pushes Send to the right edge.
    expect(controls.firstElementChild?.contains(screen.getByTestId('ai-composer-mic'))).toBe(true);
    expect(controls.lastElementChild?.contains(screen.getByTestId('ai-composer-send'))).toBe(true);
    // textarea precedes the controls (controls sit below it)
    expect(screen.getByTestId('ai-composer-input').compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('with enterToSend=false, Enter is a newline and Cmd+Enter sends', () => {
    const onSend = vi.fn();
    render(<AiComposer value="x" onChange={() => {}} onSend={onSend} canSend ariaLabel="P" enterToSend={false} />);
    const box = screen.getByRole('textbox', { name: 'P' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('has no Stop button unless it is streaming with an onStop handler', () => {
    const { rerender } = render(<AiComposer value="x" onChange={() => {}} onSend={() => {}} canSend ariaLabel="P" streaming />);
    expect(screen.queryByTestId('ai-composer-stop')).toBeNull();
    rerender(<AiComposer value="x" onChange={() => {}} onSend={() => {}} canSend ariaLabel="P" onStop={() => {}} />);
    expect(screen.queryByTestId('ai-composer-stop')).toBeNull();
  });

  it('streaming puts Stop directly left of Send, and Stop calls onStop', () => {
    const onStop = vi.fn();
    render(<AiComposer value="x" onChange={() => {}} onSend={() => {}} canSend={false} ariaLabel="P" streaming onStop={onStop} />);
    const stop = screen.getByTestId('ai-composer-stop');
    expect(stop.nextElementSibling).toBe(screen.getByTestId('ai-composer-send'));
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('presses the mic through the companion ports when available', () => {
    const micPressStart = vi.fn();
    setCompanionPorts({ micAvailable: () => true, micPressStart, micPressEnd: vi.fn() });
    render(<Harness onSend={() => {}} onTranscript={() => {}} />);
    fireEvent.pointerDown(screen.getByTestId('ai-composer-mic'));
    expect(micPressStart).toHaveBeenCalled();
  });

  it('does nothing when the mic is unavailable', () => {
    const micPressStart = vi.fn();
    setCompanionPorts({ micAvailable: () => false, micPressStart });
    render(<Harness onSend={() => {}} />);
    fireEvent.pointerDown(screen.getByTestId('ai-composer-mic'));
    expect(micPressStart).not.toHaveBeenCalled();
  });
});

/*
  Conversation mode in the composer. The audio path (segmenter, capture,
  transcription) is `conversation.test.ts`'s; here a phrase arrives the way a
  transcribed one does — through the session owner's `deliver` — and what is
  under test is the toggle, the mic's two modes and the auto-send.
*/
describe('AiComposer conversation mode', () => {
  const close = vi.fn();
  const sent: string[] = [];

  function Chat({ busy = false }: { busy?: boolean }) {
    const [value, setValue] = useState('');
    const mic = useComposerMic({ onTranscript: (text) => setValue((current) => (current ? `${current} ${text}` : text)) });
    return (
      <AiComposer
        value={value}
        onChange={setValue}
        onSend={() => {
          sent.push(value);
          setValue('');
        }}
        canSend={!busy && value.trim().length > 0}
        ariaLabel="Prompt"
        mic={mic}
      />
    );
  }

  beforeEach(() => {
    sent.length = 0;
    close.mockClear();
    __setConversationDepsForTest({
      openCapture: async () => ({ stream: {} as MediaStream, sampleRate: 16_000, close }),
    });
    setCompanionPorts({ micAvailable: () => true, micPressStart: vi.fn(), micPressEnd: vi.fn() });
    useUiStore.setState({ voiceConversation: false, voiceConversationTrigger: 'always' });
  });

  afterEach(() => {
    __setConversationDepsForTest(null);
    useUiStore.setState({ voiceConversation: false });
  });

  it('shows the toggle beside the mic, off — manual — by default', () => {
    render(<Chat />);
    const toggle = screen.getByTestId('ai-composer-conversation');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('ai-composer-mic').nextElementSibling?.contains(toggle)).toBe(true);
    expect(screen.getByTestId('ai-composer-mic').getAttribute('aria-label')).toBe('Hold to talk');
  });

  it('turning it on starts listening here, and every phrase is sent with no press', async () => {
    render(<Chat />);
    fireEvent.click(screen.getByTestId('ai-composer-conversation'));
    expect(useUiStore.getState().voiceConversation).toBe(true);
    await waitFor(() => expect(conversationOwner()).not.toBeNull());
    expect(screen.getByTestId('ai-composer-mic').getAttribute('aria-label')).toBe('Stop listening');

    act(() => conversationOwner()!.deliver('open the pull request'));
    act(() => conversationOwner()!.deliver('and merge it'));
    expect(sent).toEqual(['open the pull request', 'and merge it']);
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Prompt' }).value).toBe('');
  });

  it('holds a phrase until the composer can send, then sends it once', async () => {
    useUiStore.setState({ voiceConversation: true });
    const { rerender } = render(<Chat busy />);
    fireEvent.pointerDown(screen.getByTestId('ai-composer-mic'));
    await waitFor(() => expect(conversationOwner()).not.toBeNull());

    act(() => conversationOwner()!.deliver('and then deploy'));
    expect(sent).toEqual([]);
    rerender(<Chat />);
    expect(sent).toEqual(['and then deploy']);
    rerender(<Chat />);
    expect(sent).toEqual(['and then deploy']);
  });

  it('in conversation mode the mic button starts and stops listening instead of being held', async () => {
    const micPressStart = vi.fn();
    setCompanionPorts({ micAvailable: () => true, micPressStart, micPressEnd: vi.fn() });
    useUiStore.setState({ voiceConversation: true });
    render(<Chat />);
    const mic = screen.getByTestId('ai-composer-mic');
    expect(mic.getAttribute('aria-label')).toBe('Start listening');

    fireEvent.pointerDown(mic);
    await waitFor(() => expect(mic.getAttribute('aria-pressed')).toBe('true'));
    fireEvent.pointerDown(mic);
    expect(conversationOwner()).toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(micPressStart).not.toHaveBeenCalled();
  });

  it('turning it off goes back to manual: the mic closes and nothing more is sent', async () => {
    render(<Chat />);
    fireEvent.click(screen.getByTestId('ai-composer-conversation'));
    await waitFor(() => expect(conversationOwner()).not.toBeNull());
    fireEvent.click(screen.getByTestId('ai-composer-conversation'));
    expect(useUiStore.getState().voiceConversation).toBe(false);
    expect(conversationOwner()).toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(screen.getByTestId('ai-composer-mic').getAttribute('aria-label')).toBe('Hold to talk');
  });

  it('will not turn on without a working mic', () => {
    setCompanionPorts({ micAvailable: () => false, micPressStart: vi.fn() });
    render(<Chat />);
    fireEvent.click(screen.getByTestId('ai-composer-conversation'));
    expect(useUiStore.getState().voiceConversation).toBe(false);
    expect(conversationOwner()).toBeNull();
  });

  it('closes the mic when the composer that holds it goes away', async () => {
    useUiStore.setState({ voiceConversation: true });
    const { unmount } = render(<Chat />);
    fireEvent.pointerDown(screen.getByTestId('ai-composer-mic'));
    await waitFor(() => expect(conversationOwner()).not.toBeNull());
    unmount();
    expect(conversationOwner()).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });
});

/*
  What was just said stays on screen: the field scrolls to the end and the
  caret follows, even when the draft is taller than the field.
*/
describe('AiComposer after dictation', () => {
  function LongDraft({ busy = false }: { busy?: boolean }) {
    const [value, setValue] = useState(Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n'));
    const mic = useComposerMic({ onTranscript: (text) => setValue((current) => `${current} ${text}`) });
    return (
      <AiComposer value={value} onChange={setValue} onSend={() => {}} canSend={!busy} ariaLabel="Prompt" mic={mic} />
    );
  }

  /** jsdom has no layout: give the field a scrollable height, and park the view and caret at the top. */
  const tallField = (): HTMLTextAreaElement => {
    const el = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Prompt' });
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 900 });
    Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: 0 });
    el.setSelectionRange(0, 0);
    return el;
  };

  beforeEach(() => {
    pushSink.current = null;
    setCompanionPorts({ micAvailable: () => true, micPressStart: vi.fn(), micPressEnd: vi.fn() });
    useUiStore.setState({ voiceConversation: false, voiceConversationTrigger: 'always' });
  });

  afterEach(() => {
    __setConversationDepsForTest(null);
    useUiStore.setState({ voiceConversation: false });
  });

  it('scrolls a held-press transcript into view, caret at the end', () => {
    render(<LongDraft />);
    const el = tallField();
    fireEvent.pointerDown(screen.getByTestId('ai-composer-mic'));
    expect(pushSink.current).not.toBeNull();

    act(() => pushSink.current!('and then deploy'));
    expect(el.value.endsWith('and then deploy')).toBe(true);
    expect(el.scrollTop).toBe(900);
    expect(el.selectionStart).toBe(el.value.length);
  });

  it('scrolls a conversation-mode phrase into view while it waits to be sent', async () => {
    __setConversationDepsForTest({ openCapture: async () => ({ stream: {} as MediaStream, sampleRate: 16_000, close: vi.fn() }) });
    useUiStore.setState({ voiceConversation: true });
    render(<LongDraft busy />);
    const el = tallField();
    fireEvent.pointerDown(screen.getByTestId('ai-composer-mic'));
    await waitFor(() => expect(conversationOwner()).not.toBeNull());

    act(() => conversationOwner()!.deliver('and then deploy'));
    expect(el.value.endsWith('and then deploy')).toBe(true);
    expect(el.scrollTop).toBe(900);
    expect(el.selectionStart).toBe(el.value.length);
  });

  it('leaves the field alone when the change is typing, not speech', () => {
    render(<LongDraft />);
    const el = tallField();
    el.scrollTop = 40;
    fireEvent.change(el, { target: { value: `${el.value}x` } });
    expect(el.scrollTop).toBe(40);
  });
});
