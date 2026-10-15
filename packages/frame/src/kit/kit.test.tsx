// vitest/jsdom: DOM roles and store transitions, no browser capability needed.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LuTrash2 } from 'react-icons/lu';

import { createDialogs } from './dialogs';
import { createFrameChrome } from './frame-chrome';
import { KitIconButton } from './kit-icon-button';

afterEach(cleanup);

describe('createDialogs', () => {
  it('fires onConfirm only from the dialog button', () => {
    const { useDialogs, DialogHost } = createDialogs();
    const onConfirm = vi.fn();
    render(<DialogHost />);
    act(() => useDialogs().confirm({ title: 'Delete?', confirmLabel: 'Delete', onConfirm }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancel closes without confirming', () => {
    const { useDialogs, DialogHost } = createDialogs();
    const onConfirm = vi.fn();
    render(<DialogHost />);
    act(() => useDialogs().confirm({ title: 'Delete?', confirmLabel: 'Delete', onConfirm }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('notify hides cancel', () => {
    const { useDialogs, DialogHost } = createDialogs();
    render(<DialogHost />);
    act(() => useDialogs().notify({ title: 'Heads up' }));
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'OK' })).toBeTruthy();
  });

  it('setBlastRadius updates the open request', () => {
    const { useDialogs, DialogHost } = createDialogs();
    render(<DialogHost />);
    act(() =>
      useDialogs().confirm({ title: 'Trash', confirmLabel: 'Trash', blastRadiusKind: 'files', onConfirm: () => {} }),
    );
    expect(screen.queryByRole('status')).toBeNull();
    act(() => useDialogs().setBlastRadius({ count: 3, sample: [] }, ['careful']));
    expect(screen.getByRole('status').textContent).toBe('3 items will be moved to the trash.');
    expect(screen.getByText('careful')).toBeTruthy();
  });
});

describe('KitIconButton', () => {
  it('disabledReason keeps hover title and swallows the click', () => {
    const onClick = vi.fn();
    render(<KitIconButton icon={LuTrash2} label="Clean" onClick={onClick} disabledReason="nothing selected" />);
    const btn = screen.getByRole('button', { name: 'Clean' });
    expect(btn.getAttribute('title')).toBe('Clean (nothing selected)');
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('busy blocks the click and flags aria-busy', () => {
    const onClick = vi.fn();
    render(<KitIconButton icon={LuTrash2} label="Clean" onClick={onClick} busy />);
    const btn = screen.getByRole('button', { name: 'Clean' });
    expect(btn.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('createFrameChrome', () => {
  it('returns a complete chrome and honours overrides', () => {
    const Mark = () => <span>mark</span>;
    const { chrome } = createFrameChrome({ PageDetachMark: Mark });
    expect(chrome.IconButton).toBe(KitIconButton);
    expect(chrome.PageDetachMark).toBe(Mark);
    expect(typeof chrome.useDialogs).toBe('function');
    expect(createFrameChrome().chrome.PageDetachMark).not.toBe(Mark);
  });
});
