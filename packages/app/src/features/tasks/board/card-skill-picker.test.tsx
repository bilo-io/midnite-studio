import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SkillSuggestion } from './card-skill';
import { CardSkillPicker } from './card-skill-picker';

afterEach(cleanup);

const SUGGESTIONS: SkillSuggestion[] = [
  { value: '/midnite-refine', label: '/midnite-refine', description: '', group: 'recent' },
  { value: '/midnite-create', label: 'midnite-create', description: 'Build a phase slice', group: 'midnite' },
  { value: '/midnite-create-adhoc', label: 'midnite-create-adhoc', description: 'One-off task', group: 'midnite' },
  { value: '/graphify', label: 'graphify', description: 'Knowledge graph', group: 'other' },
];

function renderPicker(value = '/midnite-create-adhoc') {
  const onCommit = vi.fn();
  render(<CardSkillPicker value={value} suggestions={SUGGESTIONS} onCommit={onCommit} />);
  const input = screen.getByRole('combobox', { name: 'Skill' }) as HTMLInputElement;
  return { onCommit, input };
}

const optionNames = () =>
  within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.querySelector('.font-mono')?.textContent);

describe('CardSkillPicker', () => {
  it('is an ARIA combobox, collapsed until opened, prepopulated with its value', () => {
    const { input } = renderPicker();
    expect(input.value).toBe('/midnite-create-adhoc');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens on ArrowDown showing every suggestion — the prepopulated text does not filter', () => {
    const { input } = renderPicker();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    expect(optionNames()).toEqual(['/midnite-refine', 'midnite-create', 'midnite-create-adhoc', 'graphify']);
    const headings = screen.getAllByRole('group').map((g) => document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent);
    expect(headings).toEqual([
      'Recent',
      'Midnite skills',
      'Other repo skills',
    ]);
  });

  it('filters as you type', () => {
    const { input } = renderPicker();
    fireEvent.change(input, { target: { value: 'create' } });
    expect(optionNames()).toEqual(['midnite-create', 'midnite-create-adhoc']);
  });

  it('arrows move aria-activedescendant, Enter picks the active suggestion', () => {
    const { input, onCommit } = renderPicker();
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // opens, first active
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const active = document.getElementById(input.getAttribute('aria-activedescendant')!);
    expect(active?.getAttribute('aria-selected')).toBe('true');
    expect(active?.textContent).toContain('midnite-create');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' }); // wraps to the last
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('/graphify');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Enter with no active suggestion commits the typed text verbatim', () => {
    const { input, onCommit } = renderPicker();
    fireEvent.change(input, { target: { value: 'midnite-create 98 D' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('midnite-create 98 D');
  });

  it('blur commits a draft; an untouched input commits nothing', () => {
    const { input, onCommit } = renderPicker();
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '/midnite-verify 12' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('/midnite-verify 12');
  });

  it('Escape closes the suggestion list first, then reverts the draft', () => {
    const { input, onCommit } = renderPicker();
    fireEvent.change(input, { target: { value: 'crea' } });
    expect(screen.getByRole('listbox')).toBeDefined();

    // The shared dismiss stack's window listener owns the first Escape.
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('crea');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('/midnite-create-adhoc');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('clicking a suggestion commits it, even when it equals the current value', () => {
    const { input, onCommit } = renderPicker();
    fireEvent.click(input);
    fireEvent.click(screen.getByText('midnite-create-adhoc'));
    expect(onCommit).toHaveBeenCalledWith('/midnite-create-adhoc');
  });
});
