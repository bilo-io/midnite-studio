import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../store/ui-store';
import { QuickAccessMenu } from '../features/quick-access/quick-access-menu';
import { ContextMenu, type MenuItem } from './context-menu';
import { DialogHost, useDialogs } from './dialog-host';
import { Popover } from './popover';

/**
 * The gradient-border menus, one by one, against the rules `useDismissable`
 * implements once — so a surface that stops wiring it shows up here by name.
 * The rules themselves (nested chains, portalled submenus, adoption) are
 * pinned in `use-dismissable.test.tsx`.
 */

afterEach(cleanup);

const outside = () => {
  const el = document.createElement('button');
  el.textContent = 'outside';
  document.body.appendChild(el);
  return el;
};

afterEach(() => {
  for (const el of document.body.querySelectorAll('button')) {
    if (el.textContent === 'outside') el.remove();
  }
});

describe('ContextMenu', () => {
  const onEditor = vi.fn();
  const items: MenuItem[] = [
    { label: 'Copy', onSelect: () => {} },
    {
      label: 'Open with',
      submenu: [
        { label: 'Editor', onSelect: onEditor },
        { label: 'Terminal', onSelect: () => {} },
      ],
    },
  ];
  const openSubmenu = () =>
    fireEvent.mouseEnter(screen.getByText('Open with').closest('div.relative')!);

  it('closes on a pointerdown outside — pointerdown, not mousedown, which a page can suppress', () => {
    const onClose = vi.fn();
    const away = outside();
    render(<ContextMenu position={{ x: 0, y: 0 }} items={items} onClose={onClose} />);
    fireEvent.pointerDown(away);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a pointerdown inside the open submenu closes nothing', () => {
    const onClose = vi.fn();
    render(<ContextMenu position={{ x: 0, y: 0 }} items={items} onClose={onClose} />);
    openSubmenu();
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Editor' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('menuitem', { name: 'Editor' })).not.toBeNull();
  });

  it('choosing a submenu leaf runs it and closes the whole chain', () => {
    const onClose = vi.fn();
    render(<ContextMenu position={{ x: 0, y: 0 }} items={items} onClose={onClose} />);
    openSubmenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editor' }));
    expect(onEditor).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the window loses focus', () => {
    const onClose = vi.fn();
    render(<ContextMenu position={{ x: 0, y: 0 }} items={items} onClose={onClose} />);
    fireEvent.blur(window);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Tab, and on focus moving anywhere else', () => {
    const onClose = vi.fn();
    const away = outside();
    render(<ContextMenu position={{ x: 0, y: 0 }} items={items} onClose={onClose} />);
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => away.focus());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('its trigger counts as inside, and Escape hands focus back to it', () => {
    function WithTrigger({ onClose }: { onClose: () => void }) {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={ref} type="button">
            menu button
          </button>
          <ContextMenu position={{ x: 0, y: 0 }} items={items} onClose={onClose} trigger={ref} />
        </>
      );
    }
    const onClose = vi.fn();
    render(<WithTrigger onClose={onClose} />);
    const button = screen.getByRole('button', { name: 'menu button' });
    fireEvent.pointerDown(button);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);
  });
});

describe('DialogHost.openMenu', () => {
  function Opener() {
    const dialogs = useDialogs();
    const items: MenuItem[] = [{ label: 'Rename', onSelect: () => {} }];
    return (
      <>
        <button type="button" onClick={(event) => dialogs.openMenu(event, items)}>
          by event
        </button>
        <button
          type="button"
          onClick={(event) => {
            // The rect-only shape most toolbar buttons pass.
            const rect = event.currentTarget.getBoundingClientRect();
            dialogs.openMenu({ clientX: rect.left, clientY: rect.bottom }, items);
          }}
        >
          by rect
        </button>
        <div data-testid="row" onContextMenu={(event) => dialogs.openMenu(event, items)}>
          row
        </div>
      </>
    );
  }
  const menu = () => screen.queryByRole('menu');
  /** A real press: pointerdown, then the click it becomes. */
  const press = (el: Element) => {
    fireEvent.pointerDown(el, { button: 0 });
    fireEvent.click(el);
  };

  it('pressing the same button again toggles its menu closed', () => {
    render(
      <DialogHost>
        <Opener />
      </DialogHost>,
    );
    const button = screen.getByRole('button', { name: 'by event' });
    press(button);
    expect(menu()).not.toBeNull();
    press(button);
    expect(menu()).toBeNull();
    press(button);
    expect(menu()).not.toBeNull();
  });

  it('also toggles for a caller that passes only rect coordinates', () => {
    render(
      <DialogHost>
        <Opener />
      </DialogHost>,
    );
    const button = screen.getByRole('button', { name: 'by rect' });
    press(button);
    expect(menu()).not.toBeNull();
    press(button);
    expect(menu()).toBeNull();
  });

  it('a second right-click on the same row keeps a menu open rather than toggling', () => {
    render(
      <DialogHost>
        <Opener />
      </DialogHost>,
    );
    const row = screen.getByTestId('row');
    fireEvent.pointerDown(row, { button: 2 });
    fireEvent.contextMenu(row);
    expect(menu()).not.toBeNull();
    fireEvent.pointerDown(row, { button: 2 });
    fireEvent.contextMenu(row);
    expect(menu()).not.toBeNull();
  });

  it('pressing a different button closes the first menu and opens its own', () => {
    render(
      <DialogHost>
        <Opener />
      </DialogHost>,
    );
    press(screen.getByRole('button', { name: 'by event' }));
    press(screen.getByRole('button', { name: 'by rect' }));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });
});

describe('Popover', () => {
  function Subject() {
    return (
      <Popover trigger={<span>Details</span>} label="Details">
        <button type="button">first</button>
        <button type="button">last</button>
      </Popover>
    );
  }
  const trigger = () => screen.getByRole('button', { name: 'Details' });
  const panel = () => screen.queryByRole('dialog', { name: 'Details' });

  it('closes on a pointerdown outside, and toggles from its trigger', () => {
    const away = outside();
    render(<Subject />);
    fireEvent.click(trigger());
    fireEvent.pointerDown(away);
    expect(panel()).toBeNull();

    fireEvent.click(trigger());
    fireEvent.pointerDown(trigger());
    fireEvent.click(trigger());
    expect(panel()).toBeNull();
  });

  it('Tab walks its controls, and walking past either end closes it on the trigger', () => {
    render(<Subject />);
    fireEvent.click(trigger());
    const first = screen.getByRole('button', { name: 'first' });
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab' });
    expect(panel()).not.toBeNull();

    const last = screen.getByRole('button', { name: 'last' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});

describe('QuickAccessMenu', () => {
  beforeEach(() => {
    useUiStore.setState({ companionEnabled: false });
  });

  function WithFab({ onClose }: { onClose: () => void }) {
    const ref = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button ref={ref} type="button">
          fab
        </button>
        <QuickAccessMenu trigger={ref} onClose={onClose} />
      </>
    );
  }

  it('closes on a pointerdown outside — it used to wait for Escape or a pick', () => {
    const onClose = vi.fn();
    const away = outside();
    render(<WithFab onClose={onClose} />);
    fireEvent.pointerDown(away);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a pointerdown on the FAB leaves the FAB’s own click to toggle it', () => {
    const onClose = vi.fn();
    render(<WithFab onClose={onClose} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'fab' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Tab and on window blur, and Escape returns focus to the FAB', () => {
    const onClose = vi.fn();
    render(<WithFab onClose={onClose} />);
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.blur(window);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'fab' }));
  });
});
