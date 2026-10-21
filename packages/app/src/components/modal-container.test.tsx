import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';
import { Modal } from './modal';

afterEach(cleanup);

describe('Modal — container', () => {
  it('portals into the container with an absolute scrim, not a fixed window-level one', () => {
    const host = document.createElement('div');
    host.style.position = 'relative';
    document.body.appendChild(host);
    const onClose = vi.fn();
    const { getByRole } = render(
      <Modal open onClose={onClose} container={host}>
        <input aria-label="name" />
      </Modal>,
    );
    const dialog = getByRole('dialog');
    expect(host.contains(dialog)).toBe(true);
    expect(dialog.className).toContain('absolute');
    expect(dialog.className).not.toContain('fixed');

    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    host.remove();
  });

  it('falls back to the window-level dialog when the container is null', () => {
    const { getByRole } = render(
      <Modal open onClose={() => {}} container={null}>
        <div />
      </Modal>,
    );
    expect(getByRole('dialog').className).toContain('fixed');
  });
});

describe('ConfirmDialog — container', () => {
  it('portals into the container with an absolute scrim', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const { getByRole } = render(
      <ConfirmDialog
        request={{ title: 'Close?', confirmLabel: 'Close', onConfirm: () => {}, container: host }}
        onCancel={() => {}}
      />,
    );
    const dialog = getByRole('dialog');
    expect(host.contains(dialog)).toBe(true);
    expect(dialog.className).toContain('absolute');
    host.remove();
  });
});
