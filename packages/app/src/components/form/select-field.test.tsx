import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectField } from './select-field';

afterEach(cleanup);

const OPTIONS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
] as const;

describe('SelectField', () => {
  it('renders every option with its label', () => {
    render(<SelectField value="a" onChange={vi.fn()} options={OPTIONS} label="Pick one" />);

    expect(screen.getByRole('option', { name: 'Option A' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Option B' })).toBeDefined();
  });

  it('reflects the current value', () => {
    render(<SelectField value="b" onChange={vi.fn()} options={OPTIONS} label="Pick one" />);

    const select = screen.getByRole('combobox', { name: 'Pick one' }) as HTMLSelectElement;
    expect(select.value).toBe('b');
  });

  it('calls onChange with the new value, not the event', () => {
    const onChange = vi.fn();
    render(<SelectField value="a" onChange={onChange} options={OPTIONS} label="Pick one" />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Pick one' }), { target: { value: 'b' } });

    expect(onChange).toHaveBeenCalledExactlyOnceWith('b');
  });
});
