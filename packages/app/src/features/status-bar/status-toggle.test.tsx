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

/** The name element exists in the tree either way — `hidden` is the gate. */
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

  it('hides the name at rest — the chord is what you read', () => {
    setup(false);
    expect(name().hidden).toBe(true);
  });

  it('shows the name while the surface is open', () => {
    setup(true);
    expect(name().hidden).toBe(false);
  });

  it('reveals the name on hover, so the rail is discoverable while shut', () => {
    const { button } = setup(false);
    fireEvent.pointerEnter(button);
    expect(name().hidden).toBe(false);
    fireEvent.pointerLeave(button);
    expect(name().hidden).toBe(true);
  });

  it('reveals the name on keyboard focus', () => {
    const { button } = setup(false);
    fireEvent.focus(button);
    expect(name().hidden).toBe(false);
    fireEvent.blur(button);
    expect(name().hidden).toBe(true);
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
