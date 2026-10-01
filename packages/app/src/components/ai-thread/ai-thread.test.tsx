/**
 * Vitest/jsdom: the shared AI-thread components. No browser capability needed —
 * class toggling, DOM text and callbacks only.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCompanionPorts, resetCompanionPorts } from '../../features/companion/companion-ports';
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
