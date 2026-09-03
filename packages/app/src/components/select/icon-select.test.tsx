import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LuGitBranch, LuTerminal } from 'react-icons/lu';

import { IconSelect, MultiIconSelect } from './icon-select';

afterEach(cleanup);

const OPTIONS = [
  { id: 'claude', label: 'Claude', icon: LuTerminal, iconColor: '#D97757' },
  { id: 'codex', label: 'Codex', icon: LuGitBranch, iconColor: '#10A37F' },
];

describe('IconSelect', () => {
  it('shows the selected option, with its icon, as the current value', () => {
    render(<IconSelect ariaLabel="Agent" options={OPTIONS} value="claude" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Agent')).toBeDefined();
    expect(screen.getByText('Claude')).toBeDefined();
  });

  it('is searchable: typing narrows the open menu to matching options', () => {
    render(<IconSelect ariaLabel="Agent" options={OPTIONS} value="claude" onChange={vi.fn()} />);

    const input = screen.getByLabelText('Agent');
    fireEvent.mouseDown(input);
    fireEvent.change(input, { target: { value: 'cod' } });

    expect(screen.getByText('Codex')).toBeDefined();
    expect(screen.queryByRole('option', { name: /Claude/ })).toBeNull();
  });

  it('picking an option calls onChange with its id', () => {
    const onChange = vi.fn();
    render(<IconSelect ariaLabel="Agent" options={OPTIONS} value="claude" onChange={onChange} />);

    const input = screen.getByLabelText('Agent');
    fireEvent.mouseDown(input);
    fireEvent.click(screen.getByText('Codex'));

    expect(onChange).toHaveBeenCalledWith('codex');
  });

  it('disables the control when there are no options to choose from', () => {
    render(<IconSelect ariaLabel="Model" options={[]} value="" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Model')).toHaveProperty('disabled', true);
  });
});

describe('MultiIconSelect', () => {
  const DAYS = [
    { id: 'mon', label: 'Mon' },
    { id: 'sat', label: 'Sat' },
    { id: 'sun', label: 'Sun' },
  ];

  it('shows every selected option as its own chip', () => {
    render(
      <MultiIconSelect ariaLabel="Days" options={DAYS} values={['sat', 'sun']} onChange={vi.fn()} />,
    );

    expect(screen.getByText('Sat')).toBeDefined();
    expect(screen.getByText('Sun')).toBeDefined();
  });

  it('adds a pick to the selection rather than replacing it', () => {
    const onChange = vi.fn();
    render(
      <MultiIconSelect ariaLabel="Days" options={DAYS} values={['sat']} onChange={onChange} />,
    );

    fireEvent.mouseDown(screen.getByLabelText('Days'));
    fireEvent.click(screen.getByRole('option', { name: 'Mon' }));

    expect(onChange).toHaveBeenCalledWith(['sat', 'mon']);
  });

  it('drops a pick when its already-selected row is clicked again', () => {
    // `hideSelectedOptions={false}` keeps selected rows in the menu, which is
    // what makes deselecting them possible there at all.
    const onChange = vi.fn();
    render(
      <MultiIconSelect
        ariaLabel="Days"
        options={DAYS}
        values={['mon', 'sat', 'sun']}
        onChange={onChange}
      />,
    );

    fireEvent.mouseDown(screen.getByLabelText('Days'));
    fireEvent.click(screen.getByRole('option', { name: 'Sat' }));

    expect(onChange).toHaveBeenCalledWith(['mon', 'sun']);
  });

  it('gives each chip an announced remove control, not a hidden div', () => {
    // `isClearable={false}` means the per-chip × is the only pointer route to
    // dropping a value; unnamed, a screen-reader user has Backspace and
    // nothing else.
    render(
      <MultiIconSelect ariaLabel="Days" options={DAYS} values={['sat']} onChange={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Remove Sat' })).toBeDefined();
  });

  it('shows its placeholder rather than a chip row when nothing is picked', () => {
    render(
      <MultiIconSelect
        ariaLabel="Days"
        options={DAYS}
        values={[]}
        placeholder="Every day"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Every day')).toBeDefined();
  });
});
