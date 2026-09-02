import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LuSquareTerminal } from 'react-icons/lu';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StatusToggle } from './status-toggle';

function setup(active = false) {
  const onToggle = vi.fn();
  render(
    <StatusToggle
      testId="probe-toggle"
      icon={LuSquareTerminal}
      name="Terminal"
      chord="Ctrl+`"
      active={active}
      onToggle={onToggle}
      ariaLabel="Toggle Terminal"
      tooltip="Toggle terminal (Ctrl+`)"
    />,
  );
  return { onToggle, button: screen.getByTestId('probe-toggle') };
}

// No global setup file configures auto-cleanup, so each render is torn down
// by hand — two mounted copies would make every `getByTestId` ambiguous.
afterEach(cleanup);

/**
 * The name element exists in the tree either way; the decision is published as
 * `data-named` on the button and resolved by a `[data-density]`-scoped rule in
 * `styles.css`. jsdom applies no stylesheet, so the attribute is what a unit
 * test can honestly assert — the rendered result is covered in
 * `shortcut-rail.spec.ts`, which runs real CSS.
 *
 * The attribute is deliberately not `hidden`: that travelled with the element
 * into `OverflowPopover`'s portal, where density has no reach and the name is
 * the only affordance a 14px glyph has.
 */
const named = (testId = 'probe-toggle') =>
  screen.getByTestId(testId).getAttribute('data-named') === 'true';
const name = () => screen.getByText('Terminal');

describe('StatusToggle', () => {
  it('reports its state through aria-pressed', () => {
    const { button } = setup(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('is pressed while the surface is open', () => {
    const { button } = setup(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('withholds the name at rest — the chord is what you read', () => {
    setup(false);
    expect(named()).toBe(false);
  });

  it('shows the name while the surface is open', () => {
    setup(true);
    expect(named()).toBe(true);
  });

  it('reveals the name on hover, so the rail is discoverable while shut', () => {
    const { button } = setup(false);
    fireEvent.pointerEnter(button);
    expect(named()).toBe(true);
    fireEvent.pointerLeave(button);
    expect(named()).toBe(false);
  });

  it('reveals the name on keyboard focus', () => {
    const { button } = setup(false);
    fireEvent.focus(button);
    expect(named()).toBe(true);
    fireEvent.blur(button);
    expect(named()).toBe(false);
  });

  /**
   * The name and the chord carry DIFFERENT classes, which is the point of
   * splitting them: `.status-label`'s density rule and the state rule are two
   * independent gates, and the chord — being state-independent — has only the
   * density one.
   */
  it('puts the name under .status-label and the chord under .status-chord', () => {
    setup(true);
    expect(name().classList.contains('status-label')).toBe(true);
    expect(screen.getByText('Ctrl+`').classList.contains('status-label')).toBe(false);
  });

  /**
   * The state rule must be scoped so it cannot reach into `OverflowPopover`'s
   * portal. The marker class is what that scoping selector hangs off, so its
   * absence would silently disable the whole rule.
   */
  it('carries the .status-toggle hook the scoped CSS rule needs', () => {
    const { button } = setup(false);
    expect(button.classList.contains('status-toggle')).toBe(true);
  });

  /**
   * The chord is the one piece that is always there at `full` — it is the whole
   * reason the rail exists. It carries `.status-chord`, not `.status-label`, so
   * density can hide it without being coupled to the name's state rule.
   */
  it('always renders the chord, in both states, under .status-chord', () => {
    for (const active of [false, true]) {
      const { unmount } = render(
        <StatusToggle
          testId="chord-probe"
          icon={LuSquareTerminal}
          name="Terminal"
          chord="Ctrl+`"
          active={active}
          onToggle={() => {}}
          ariaLabel="Toggle Terminal"
          tooltip="t"
        />,
      );
      const chord = screen.getByText('Ctrl+`');
      expect(chord.classList.contains('status-chord')).toBe(true);
      expect(chord.hidden).toBe(false);
      unmount();
    }
  });

  it('calls onToggle when clicked', () => {
    const { onToggle, button } = setup(false);
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
