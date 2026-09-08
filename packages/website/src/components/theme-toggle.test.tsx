import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { STORAGE_KEY } from '../theme';

import { ThemeToggle } from './theme-toggle';

const reset = () => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('ws-auto-light');
};

beforeEach(reset);
afterEach(reset);

describe('ThemeToggle', () => {
  it('names the current state and the next one in its aria-label, starting at system', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: 'Theme: system — switch to light' });
    expect(button.getAttribute('title')).toBe('Theme: system — switch to light');
  });

  it('cycles system → light → dark → system on click, updating data-theme and the label', () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Theme: system — switch to light' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    expect(
      screen.getByRole('button', { name: 'Theme: light — switch to dark' }),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Theme: light — switch to dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('button', { name: 'Theme: dark — switch to system' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Theme: dark — switch to system' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Theme: system — switch to light' }),
    ).toBeDefined();
  });

  it('is keyboard focusable', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    button.focus();
    expect(document.activeElement).toBe(button);
  });
});
