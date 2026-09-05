import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';

import { Modal } from './modal';
import { useUiStore } from '../store/ui-store';

describe('Modal', () => {
  beforeEach(() => {
    useUiStore.setState({ occluders: 0 });
  });

  afterEach(cleanup);

  it('increments occluders on mount and decrements on unmount', () => {
    expect(useUiStore.getState().occluders).toBe(0);

    const { unmount } = render(
      <Modal open onClose={() => {}}>
        <div>Modal content</div>
      </Modal>,
    );

    expect(useUiStore.getState().occluders).toBe(1);

    unmount();

    expect(useUiStore.getState().occluders).toBe(0);
  });

  it('closes on Escape key press', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <div>Modal content</div>
      </Modal>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click', () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <Modal open onClose={onClose}>
        <div>Modal content</div>
      </Modal>,
    );

    const backdrop = getByRole('dialog');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to previously active element on close/unmount', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);

    const { unmount } = render(
      <Modal open onClose={() => {}}>
        <input data-testid="modal-input" />
      </Modal>,
    );

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(document.activeElement).toBe(button);
    document.body.removeChild(button);
  });

  it('focuses initialFocusRef when provided', () => {
    const inputRef = createRef<HTMLInputElement>();

    render(
      <Modal open onClose={() => {}} initialFocusRef={inputRef}>
        <div>
          <button>First button</button>
          <input ref={inputRef} data-testid="target-input" />
        </div>
      </Modal>,
    );

    expect(document.activeElement).toBe(inputRef.current);
  });

  it('does not render or register occluder when open is false', () => {
    expect(useUiStore.getState().occluders).toBe(0);

    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        <div>Hidden modal</div>
      </Modal>,
    );

    expect(container.firstChild).toBeNull();
    expect(useUiStore.getState().occluders).toBe(0);
  });
});
