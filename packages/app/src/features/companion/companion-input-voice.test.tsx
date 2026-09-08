import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { CompanionPanel } from './companion-panel';
import { companionPorts, resetCompanionPorts, setCompanionPorts } from './companion-ports';

/**
 * Phase 79 Theme F's two additions to Theme C's input bar: the spacebar as a
 * second push-to-talk gesture, and `transcriptSink` — the port the textarea
 * registers so a transcript can land in it **unsent**.
 *
 * A separate file from `companion-panel.test.tsx` so the two slices' coverage
 * of the same component cannot conflict; the virtualizer stubs are the same
 * ones that file explains and are local for the same reason.
 */
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: StubResizeObserver,
    });
  }
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 600,
  });
});

beforeEach(() => {
  resetCompanionPorts();
  useUiStore.setState({ companionEnabled: true, companionPanelOpen: true });
  useCompanionStore.setState({ state: 'idle', transcript: [] });
});

afterEach(() => {
  cleanup();
  resetCompanionPorts();
});

describe('the spacebar as push-to-talk (Theme F)', () => {
  it('starts the mic on Space while the textarea is empty', () => {
    const micPressStart = vi.fn();
    setCompanionPorts({ micPressStart, micAvailable: () => true });
    render(<CompanionPanel />);

    const input = screen.getByTestId('companion-input');
    fireEvent.keyDown(input, { key: ' ' });
    expect(micPressStart).toHaveBeenCalledTimes(1);
  });

  /*
    The moment there is a draft, Space is a space. A shortcut that ate one
    mid-sentence would make the textarea unusable, which is why the phase doc
    scopes it to an empty field.
  */
  it('is a plain space once anything is typed', () => {
    const micPressStart = vi.fn();
    setCompanionPorts({ micPressStart, micAvailable: () => true });
    render(<CompanionPanel />);

    const input = screen.getByTestId('companion-input');
    fireEvent.change(input, { target: { value: 'start an' } });
    fireEvent.keyDown(input, { key: ' ' });
    expect(micPressStart).not.toHaveBeenCalled();
  });

  it('does nothing when no provider is configured', () => {
    const micPressStart = vi.fn();
    setCompanionPorts({ micPressStart, micAvailable: () => false });
    render(<CompanionPanel />);

    fireEvent.keyDown(screen.getByTestId('companion-input'), { key: ' ' });
    expect(micPressStart).not.toHaveBeenCalled();
  });

  it('ignores autorepeat — only the first press starts anything', () => {
    const micPressStart = vi.fn();
    setCompanionPorts({ micPressStart, micAvailable: () => true });
    render(<CompanionPanel />);

    const input = screen.getByTestId('companion-input');
    fireEvent.keyDown(input, { key: ' ' });
    fireEvent.keyDown(input, { key: ' ', repeat: true });
    expect(micPressStart).toHaveBeenCalledTimes(1);
  });

  it('stops on the Space release', () => {
    const micPressEnd = vi.fn();
    setCompanionPorts({ micPressEnd, micAvailable: () => true });
    render(<CompanionPanel />);

    fireEvent.keyDown(screen.getByTestId('companion-input'), { key: ' ' });
    fireEvent.keyUp(window, { key: ' ' });
    expect(micPressEnd).toHaveBeenCalledTimes(1);
  });

  /*
    On the window, not the textarea: a release that arrives after focus has
    moved still has to stop the recorder, or a click away mid-utterance leaves
    it recording forever.
  */
  it('stops when the window loses focus mid-press', () => {
    const micPressEnd = vi.fn();
    setCompanionPorts({ micPressEnd, micAvailable: () => true });
    render(<CompanionPanel />);

    fireEvent.keyDown(screen.getByTestId('companion-input'), { key: ' ' });
    fireEvent.blur(window);
    expect(micPressEnd).toHaveBeenCalledTimes(1);
  });

  it('does not release on some other key', () => {
    const micPressEnd = vi.fn();
    setCompanionPorts({ micPressEnd, micAvailable: () => true });
    render(<CompanionPanel />);

    fireEvent.keyDown(screen.getByTestId('companion-input'), { key: ' ' });
    fireEvent.keyUp(window, { key: 'a' });
    expect(micPressEnd).not.toHaveBeenCalled();
  });

  it('interrupts a spoken line, like every other keystroke does', () => {
    const interrupt = vi.fn();
    setCompanionPorts({ interrupt, micAvailable: () => true });
    render(<CompanionPanel />);

    fireEvent.keyDown(screen.getByTestId('companion-input'), { key: ' ' });
    expect(interrupt).toHaveBeenCalled();
  });
});

describe('transcriptSink (Theme F)', () => {
  it('is registered by the input bar, which is the only writer of the textarea', () => {
    render(<CompanionPanel />);
    // `act`, because the sink is a plain function call from outside React —
    // which is exactly how it arrives in production, off an IPC reply.
    act(() => companionPorts().transcriptSink('start an adhoc task'));
    expect((screen.getByTestId('companion-input') as HTMLTextAreaElement).value).toBe(
      'start an adhoc task',
    );
  });

  it('lands the text unsent — the user still has to press Return', () => {
    const submit = vi.fn();
    setCompanionPorts({ submit });
    render(<CompanionPanel />);

    act(() => companionPorts().transcriptSink('start an adhoc task'));
    expect(submit).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByTestId('companion-input'), { key: 'Enter' });
    expect(submit).toHaveBeenCalledExactlyOnceWith('start an adhoc task');
  });

  it('appends rather than eating a draft already typed', () => {
    render(<CompanionPanel />);
    const input = screen.getByTestId('companion-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'start' } });
    act(() => companionPorts().transcriptSink('an adhoc task'));
    expect(input.value).toBe('start an adhoc task');
  });

  it('ignores an empty transcript', () => {
    render(<CompanionPanel />);
    act(() => companionPorts().transcriptSink('   '));
    expect((screen.getByTestId('companion-input') as HTMLTextAreaElement).value).toBe('');
  });

  /*
    Back to a no-op on unmount: a transcript arriving with no panel mounted is
    dropped rather than queued for a textarea that may never exist again.
  */
  it('goes back to a no-op once the panel unmounts', () => {
    const { unmount } = render(<CompanionPanel />);
    unmount();
    expect(() => companionPorts().transcriptSink('anything')).not.toThrow();
  });
});
