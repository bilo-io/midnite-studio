import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DismissableScope,
  focusIsInOpenMenuTree,
  useDismissable,
  type DismissableNode,
} from './use-dismissable';

/**
 * The shared dismissal rules, exercised against a bare harness: a trigger, a
 * menu, and a submenu portalled into a DIFFERENT container than its parent —
 * the case `parent.contains(target)` gets wrong and the menu tree gets right.
 */

afterEach(() => {
  cleanup();
  for (const host of document.querySelectorAll('[data-testid="sub-host"]')) host.remove();
});

function Menu({
  label,
  onClose,
  trigger,
  windowBlur = false,
  tab = 'close',
  children,
  portalTo,
  nodeRef,
}: {
  label: string;
  onClose: () => void;
  trigger?: React.RefObject<HTMLElement | null>;
  windowBlur?: boolean;
  tab?: 'close' | 'edges' | 'none';
  children?: ReactNode;
  portalTo?: HTMLElement;
  nodeRef?: { current: DismissableNode | null };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const node = useDismissable({
    open: true,
    surfaceRef: ref,
    trigger,
    windowBlur,
    tab,
    onDismiss: onClose,
  });
  if (nodeRef) nodeRef.current = node;
  const surface = (
    <DismissableScope node={node}>
      <div ref={ref} role="menu" aria-label={label} tabIndex={-1}>
        <button type="button">{`${label} item`}</button>
        {children}
      </div>
    </DismissableScope>
  );
  return portalTo ? createPortal(surface, portalTo) : surface;
}

function Harness({
  withSubmenu = false,
  windowBlur = false,
  onParentClose,
  onChildClose,
}: {
  withSubmenu?: boolean;
  windowBlur?: boolean;
  onParentClose?: () => void;
  onChildClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(withSubmenu);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [subHost] = useState(() => {
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'sub-host');
    document.body.appendChild(el);
    return el;
  });
  const parentNode = useRef<DismissableNode | null>(null);

  return (
    <div>
      <button type="button" data-testid="elsewhere">
        elsewhere
      </button>
      <button ref={triggerRef} type="button" onClick={() => setOpen((value) => !value)}>
        trigger
      </button>
      {open ? (
        <Menu
          label="parent"
          trigger={triggerRef}
          windowBlur={windowBlur}
          nodeRef={parentNode}
          onClose={() => {
            onParentClose?.();
            setOpen(false);
          }}
        >
          <div data-testid="parent-row" onMouseEnter={() => setSubOpen(true)}>
            more
          </div>
          {subOpen ? (
            <Menu
              label="child"
              portalTo={subHost}
              onClose={() => {
                onChildClose?.();
                setSubOpen(false);
              }}
            >
              <button type="button" onClick={() => parentNode.current?.closeAll()}>
                leaf
              </button>
            </Menu>
          ) : null}
        </Menu>
      ) : null}
    </div>
  );
}

const parent = () => screen.queryByRole('menu', { name: 'parent' });
const child = () => screen.queryByRole('menu', { name: 'child' });
const trigger = () => screen.getByRole('button', { name: 'trigger' });

function openHarness(props: Parameters<typeof Harness>[0] = {}) {
  render(<Harness {...props} />);
  fireEvent.click(trigger());
  expect(parent()).not.toBeNull();
}

function escape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

describe('useDismissable — one surface', () => {
  it('Escape closes it and returns focus to its trigger', () => {
    openHarness();
    screen.getByRole('button', { name: 'parent item' }).focus();
    escape();
    expect(parent()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('a pointerdown outside closes it; one inside does not', () => {
    openHarness();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'parent item' }));
    expect(parent()).not.toBeNull();
    fireEvent.pointerDown(screen.getByTestId('elsewhere'));
    expect(parent()).toBeNull();
  });

  it('pressing the trigger again toggles it closed, without reopening', () => {
    openHarness();
    fireEvent.pointerDown(trigger());
    fireEvent.mouseDown(trigger());
    expect(parent()).not.toBeNull();
    fireEvent.click(trigger());
    expect(parent()).toBeNull();
  });

  it('focus moving outside closes it', () => {
    openHarness();
    act(() => screen.getByTestId('elsewhere').focus());
    expect(parent()).toBeNull();
  });

  it('Tab closes a menu and hands focus back to the trigger', () => {
    openHarness();
    const item = screen.getByRole('button', { name: 'parent item' });
    item.focus();
    fireEvent.keyDown(item, { key: 'Tab' });
    expect(parent()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on window blur only when asked to', () => {
    openHarness();
    fireEvent.blur(window);
    expect(parent()).not.toBeNull();
    cleanup();

    openHarness({ windowBlur: true });
    fireEvent.blur(window);
    expect(parent()).toBeNull();
  });

  it('marks the document while open, so title-bar drag regions can stand down', () => {
    openHarness();
    expect(document.documentElement.hasAttribute('data-dismissable-open')).toBe(true);
    fireEvent.pointerDown(screen.getByTestId('elsewhere'));
    expect(document.documentElement.hasAttribute('data-dismissable-open')).toBe(false);
  });
});

describe('focusIsInOpenMenuTree', () => {
  it('is true only while focus sits in an open surface or on its trigger', () => {
    render(<Harness />);
    act(() => trigger().focus());
    expect(focusIsInOpenMenuTree()).toBe(false);

    fireEvent.click(trigger());
    expect(focusIsInOpenMenuTree()).toBe(true);
    act(() => screen.getByRole('button', { name: 'parent item' }).focus());
    expect(focusIsInOpenMenuTree()).toBe(true);

    escape();
    expect(parent()).toBeNull();
    expect(focusIsInOpenMenuTree()).toBe(false);
  });
});

describe('useDismissable — nothing open', () => {
  it('leaves Escape alone, so a focused terminal still receives it', () => {
    render(<Harness />);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('useDismissable — a nested chain, submenu portalled elsewhere', () => {
  it('really is portalled outside its parent in the DOM', () => {
    openHarness({ withSubmenu: true });
    expect(parent()!.contains(child())).toBe(false);
    expect(screen.getByTestId('sub-host').contains(child())).toBe(true);
  });

  it('Escape closes the innermost first, then the parent', () => {
    openHarness({ withSubmenu: true });
    escape();
    expect(child()).toBeNull();
    expect(parent()).not.toBeNull();
    escape();
    expect(parent()).toBeNull();
  });

  it('a pointerdown inside the portalled submenu closes neither', () => {
    const onParentClose = vi.fn();
    openHarness({ withSubmenu: true, onParentClose });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'child item' }));
    expect(child()).not.toBeNull();
    expect(parent()).not.toBeNull();
    expect(onParentClose).not.toHaveBeenCalled();
  });

  it('a pointerdown in the parent does not count as outside for the submenu', () => {
    openHarness({ withSubmenu: true });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'parent item' }));
    expect(child()).not.toBeNull();
    expect(parent()).not.toBeNull();
  });

  it('a pointerdown outside every level closes the whole chain', () => {
    const onChildClose = vi.fn();
    openHarness({ withSubmenu: true, onChildClose });
    fireEvent.pointerDown(screen.getByTestId('elsewhere'));
    expect(onChildClose).toHaveBeenCalled();
    expect(child()).toBeNull();
    expect(parent()).toBeNull();
  });

  it('hovering and moving focus between parent and child closes neither', () => {
    openHarness({ withSubmenu: true });
    const row = screen.getByTestId('parent-row');
    const childItem = screen.getByRole('button', { name: 'child item' });
    fireEvent.mouseLeave(row);
    fireEvent.mouseOver(childItem);
    fireEvent.mouseEnter(row);
    act(() => childItem.focus());
    act(() => screen.getByRole('button', { name: 'parent item' }).focus());
    expect(child()).not.toBeNull();
    expect(parent()).not.toBeNull();
  });

  it('choosing a leaf closes the whole chain', () => {
    openHarness({ withSubmenu: true });
    fireEvent.click(screen.getByRole('button', { name: 'leaf' }));
    expect(child()).toBeNull();
    expect(parent()).toBeNull();
  });

  it('Tab inside the submenu closes the whole chain, back to the root trigger', () => {
    openHarness({ withSubmenu: true });
    const childItem = screen.getByRole('button', { name: 'child item' });
    childItem.focus();
    fireEvent.keyDown(childItem, { key: 'Tab' });
    expect(child()).toBeNull();
    expect(parent()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});

/**
 * A surface opened from *outside* React's tree of another — `DialogHost`'s
 * menu launched from a popover's content — adopts the surface its trigger
 * sits in: it keeps the popover open, wins Escape first, and still closes on
 * a click elsewhere in the popover, because it is a separate menu.
 */
describe('useDismissable — an adopted surface', () => {
  function Adoption() {
    const [popover, setPopover] = useState(true);
    const [menu, setMenu] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    useDismissable({
      open: popover,
      surfaceRef: popoverRef,
      layer: 'popover',
      tab: 'edges',
      onDismiss: () => setPopover(false),
    });
    return (
      <>
        <button type="button" data-testid="elsewhere">
          elsewhere
        </button>
        {popover ? (
          <div ref={popoverRef} role="dialog" aria-label="popover">
            <button ref={buttonRef} type="button" onClick={() => setMenu(true)}>
              open menu
            </button>
            <span data-testid="popover-body">body</span>
          </div>
        ) : null}
        {/* Rendered as a sibling, not inside the popover's scope. */}
        {menu ? <Menu label="adopted" trigger={buttonRef} onClose={() => setMenu(false)} /> : null}
      </>
    );
  }

  const popover = () => screen.queryByRole('dialog', { name: 'popover' });
  const adopted = () => screen.queryByRole('menu', { name: 'adopted' });

  it('a click in the menu keeps the popover open', () => {
    render(<Adoption />);
    fireEvent.click(screen.getByRole('button', { name: 'open menu' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'adopted item' }));
    expect(adopted()).not.toBeNull();
    expect(popover()).not.toBeNull();
  });

  it('a click elsewhere in the popover closes only the menu', () => {
    render(<Adoption />);
    fireEvent.click(screen.getByRole('button', { name: 'open menu' }));
    fireEvent.pointerDown(screen.getByTestId('popover-body'));
    expect(adopted()).toBeNull();
    expect(popover()).not.toBeNull();
  });

  it('Escape closes the menu before the popover, although it ranks lower', () => {
    render(<Adoption />);
    fireEvent.click(screen.getByRole('button', { name: 'open menu' }));
    escape();
    expect(adopted()).toBeNull();
    expect(popover()).not.toBeNull();
  });

  it('a click outside both closes both', () => {
    render(<Adoption />);
    fireEvent.click(screen.getByRole('button', { name: 'open menu' }));
    fireEvent.pointerDown(screen.getByTestId('elsewhere'));
    expect(adopted()).toBeNull();
    expect(popover()).toBeNull();
  });
});
