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

  it('prompt asks for a value, validates it and confirms it (Theme Q)', () => {
    const { useDialogs, DialogHost } = createDialogs();
    const onConfirm = vi.fn();
    render(<DialogHost />);
    act(() =>
      useDialogs().prompt?.({
        title: 'New project',
        label: 'Name',
        confirmLabel: 'Create',
        validate: (v) => (v.includes('/') ? 'Use a single folder name.' : null),
        onConfirm,
      }),
    );
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'a/b' } });
    expect(screen.getByRole('alert').textContent).toBe('Use a single folder name.');
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'drafts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onConfirm).toHaveBeenCalledWith('drafts');
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

  it('openMenu draws a context menu at the pointer: a row closes it then acts, a submenu opens inline, a dead row does nothing (Theme S)', () => {
    const { useDialogs, DialogHost } = createDialogs();
    const rename = vi.fn();
    const moveTo = vi.fn();
    const dead = vi.fn();
    render(<DialogHost />);
    act(() =>
      useDialogs().openMenu?.({ clientX: 12, clientY: 34 }, [
        { label: 'Rename', onSelect: rename },
        { type: 'separator' },
        { label: 'Move to', submenu: [{ label: 'Top level', onSelect: moveTo }] },
        { label: 'Delete', danger: true, disabled: true, disabledReason: 'Nothing to delete', onSelect: dead },
      ]),
    );
    const menu = screen.getByTestId('kit-context-menu');
    expect(menu.style.left).toBe('12px');
    expect(menu.style.top).toBe('34px');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(dead).not.toHaveBeenCalled();
    expect(screen.queryByTestId('kit-context-menu')).not.toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Top level' }));
    expect(moveTo).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('kit-context-menu')).toBeNull();
    act(() => useDialogs().openMenu?.({ clientX: 0, clientY: 0 }, [{ label: 'Rename', onSelect: rename }]));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('kit-context-menu')).toBeNull();
    expect(rename).not.toHaveBeenCalled();
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
      useDialogs().confirm({
        title: 'Trash',
        confirmLabel: 'Trash',
        blastRadiusKind: 'files',
        onConfirm: () => {},
      }),
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
    render(
      <KitIconButton
        icon={LuTrash2}
        label="Clean"
        onClick={onClick}
        disabledReason="nothing selected"
      />,
    );
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
