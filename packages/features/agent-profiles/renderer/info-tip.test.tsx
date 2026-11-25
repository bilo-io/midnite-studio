// vitest/jsdom: timers, roles and focus only; the popover's placement is a class, not layout.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InfoTip } from './info-tip';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const button = (): HTMLElement => screen.getByRole('button', { name: 'About Model' });
const wrapper = (): HTMLElement => button().parentElement!;

describe('InfoTip', () => {
  it('opens on hover after 300 ms and closes on leave after 150 ms', () => {
    render(<InfoTip label="Model" text="Which model." />);
    fireEvent.pointerEnter(wrapper());
    act(() => void vi.advanceTimersByTime(299));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip').textContent).toBe('Which model.');
    fireEvent.pointerLeave(wrapper());
    act(() => void vi.advanceTimersByTime(149));
    expect(screen.getByRole('tooltip')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('stays open when the pointer comes back before the close delay ends', () => {
    render(<InfoTip label="Model" text="Which model." />);
    fireEvent.click(button());
    fireEvent.pointerLeave(wrapper());
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.pointerEnter(wrapper());
    act(() => void vi.advanceTimersByTime(500));
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('opens at once on focus and closes on blur', () => {
    render(<InfoTip label="Model" text="Which model." />);
    fireEvent.focus(button());
    expect(screen.getByRole('tooltip')).toBeTruthy();
    expect(button().getAttribute('aria-expanded')).toBe('true');
    fireEvent.blur(button());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('toggles on click', () => {
    render(<InfoTip label="Model" text="Which model." />);
    fireEvent.click(button());
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.click(button());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes on Escape and keeps focus on the button', () => {
    render(<InfoTip label="Model" text="Which model." />);
    button().focus();
    fireEvent.focus(button());
    fireEvent.keyDown(button(), { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('points aria-describedby at the tooltip only while open', () => {
    render(<InfoTip label="Model" text="Which model." />);
    expect(button().getAttribute('aria-describedby')).toBeNull();
    fireEvent.click(button());
    expect(button().getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
  });

  it('side="bottom" places the popover below', () => {
    render(<InfoTip label="Model" text="Which model." side="bottom" />);
    fireEvent.click(button());
    expect(screen.getByRole('tooltip').className).toContain('top-full');
  });

  it('side="top" (default) places the popover above', () => {
    render(<InfoTip label="Model" text="Which model." />);
    fireEvent.click(button());
    expect(screen.getByRole('tooltip').className).toContain('bottom-full');
  });
});
